(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['underscore', 'jquery', 'codemirror'], factory);
  } else if (typeof exports === 'object') {
    // CommonJS
    factory(require('underscore'), require('jquery'), require('codemirror'));
  } else {
    // Browser globals
    factory(root._, (root.jQuery || root.Zepto || root.ender || root.$), root.CodeMirror);
  }
}(this, function(_, $, CodeMirror) {
  "use strict";

  /**
   * CodeMirror object.
   * @external CodeMirror
   * @see {@link http://codemirror.net/ CodeMirror}
   */

  /**
   * Returns CodeMirror position object.
   * @function external:CodeMirror.Pos
   * @param {int} line Line number.
   * @param {int} ch Character number.
   * @return {{line: {int}, ch: {ch}}}
   */

  /**
   * Scenario class.
   * @typedef {Object} Scenario
   * @property {String} code The initial code for the editor. `|` character can be placed anywhere in code to defined
   * initial cursor position.
   * @property {Action[]} actions Array of scenario actions.
   */

  /**
   * Scenario action class.
   * @typedef {Object} Action
   * @property {Object} type Action type.
   * @property {Object} options Action options.
   */

  var STATE_IDLE = 'idle';
  var STATE_PLAY = 'play';
  var STATE_PAUSE = 'pause';
  var newScroll = null;

  // Regular expression used to split event strings
  var eventSplitter = /\s+/;

  var defaultOptions = {
    beforeDelay: 0,
    afterDelay: 0
  };

  var default_texts = {
    "Play": "Play",
    "Replay": "Replay",
    "Next": "Next",
    "Back": "Back",
    "Stop": "Pause",
    "Click on these blue things to continue.": "Click on these blue messages to continue.",
    "Show difference": "Show difference",
    "Compile and test": "Compile and test"
  };

  /**
   * Player class.
   *
   * @param {CodeMirror} editor {@link external:CodeMirror Codemirror} instance.
   * @param {Scenario} scenario Scenario to play.
   * @param {Object} options Player options.
   * @name Player
   * @constructor
   * @private
   */
  function Player(editor, scenario, options) {
    this.actions = scenario.actions;
    this.actionIndex = -1;
    this.state = STATE_IDLE;
    this.timerQueue = [];
    this.timers = [];
    this.editor = editor;
    this.locale = options.locale;
    this.$container = options.container || $('body');

    for (var type in this.availableActions) {
      if (_.isFunction(this.availableActions[type].init)) {
        this.availableActions[type].init.call(this);
      }
    }

    // TODO: calculate this dynamically.
    this.LINE_HEIGHT = 18;
    this.CHAR_WIDTH = 7;

    var initialValue = scenario.code || editor.value || '';
    editor.value = initialValue;

    var initialPos = initialValue.indexOf('|');
    if (initialPos != -1) {
      editor.setCursor(editor.posFromIndex(initialPos));
    }

    if (editor && !editor.__initial) {
      editor.__initial = {
        content: editor.getValue(),
        pos: editor.getCursor(true)
      };
    }
  }

  /**
   * @memberOf Player
   */
  Player.prototype = {
    /**
     * @namespace Player.availableActions
     */
    /**
     * Associative list of actions, which can be played from scenario.
     * @see Player.availableActions
     */
    availableActions: {},

    /**
     * Actions will be played instantly while this property is `true`.
     */
    fastForward: false,

    /**
     * Play current scenario.
     */
    play: function() {
      if (this.state === STATE_PLAY) {
        // already playing
        return;
      }

      if (this.state === STATE_PAUSE) {
        // revert from paused state
        this.editor.focus();
        var timerObj = null;
        while (timerObj = this.timerQueue.shift()) {
          this.setTimeout(timerObj.fn, timerObj.delay);
        }

        this.state = STATE_PLAY;
        this.trigger('resume');
        return;
      }

      this.reset();

      this.state = STATE_PLAY;
      this.trigger('play');
      this.next(defaultOptions.beforeDelay);
    },

    /**
     * Launch next scenario action.
     */
    next: function() {
      this.cleanup();

      var action;
      while (this.actionIndex < (this.actions.length - 1)) {
        this.actionIndex++;

        this.trigger('action', this.actionIndex);
        action = this.actions[this.actionIndex];

        if (this.hasAction(action.type)) {
          if (this.isCorrectLocale(action)) {
            if (this.isReversableAction(action.type)) {
              this.saveActionState(action);
            }
            this.getAction(action.type)(action.options);
            return;
          }
        } else {
          throw 'No such action: ' + action.type;
        }
      }

      if (this.actionIndex >= (this.actions.length - 1)) {
        return this.timer(function() {
          this.stop();
        }, defaultOptions.afterDelay);
      }
    },

    /**
     * Helper function, which saves player state prior to the action execution so that it could be replayed in case of
     * reverse playback (@see revertActionState()).
     * @param {Object} action Action to be played.
     */
    saveActionState: function(action) {
      action.state = {
        value: this.editor.getValue(),
        cursor: this.editor.getCursor(),
        selection: this.editor.doc.listSelections(),
        step: this.step
      };
      if (_.isFunction(this.availableActions[action.type].saveState)) {
        this.availableActions[action.type].saveState.call(this, action);
      }
    },

    /**
     * Launch previous scenario action.
     */
    back: function() {
      this.cleanup();

      var action;
      while (this.actionIndex > 0) {
        this.actionIndex--;

        action = this.actions[this.actionIndex];

        if (this.hasAction(action.type)) {
          if (this.isCorrectLocale(action)) {
            if (this.isReversableAction(action.type)) {
              this.revertActionState(action);
              this.trigger('action', this.actionIndex);
              this.getAction(action.type)(action.options);
              return;
            }
          }
        } else {
          throw 'No such action: ' + action.type;
        }
      }
      
      if (this.actionIndex == 0) {
        this.reset();
      }
    },

    /**
     * Helper function, which rewinds the player state, recorded when it was played first time (@see saveActionState()).
     * @param {Object} action Action to be played.
     */
    revertActionState: function(action) {
      if (!action.state) return;

      this.editor.setValue(action.state.value);
      this.editor.setCursor(action.state.cursor);
      this.editor.setSelections(action.state.selection);
      this.setStep(action.state.step);

      if (_.isFunction(this.availableActions[action.type].revertState)) {
        this.availableActions[action.type].revertState.call(this, action);
      }
    },

    /**
     * Execute the cleanup functions, defined by actions. Also, terminate all pending timers.
     */
    cleanup: function() {
      if (this.cleanupFunc.length) {
        this.cleanupFunc.forEach(function(func) {
          func();
        });
        this.cleanupFunc = [];
      }
      this.timers.forEach(function(timer) {
        clearTimeout(timer);
      });
      this.timers = [];
    },

    /**
     * Similar to setTimeout(), but can be paused or scheduled, if the player is paused.
     * @param {Function} fn Function to execute.
     * @param {int} delay Timer delay.
     * @returns {*} Timer object.
     */
    timer: function(fn, delay) {
      fn = _.bind(fn, this);
      if (this.state !== STATE_PLAY) {
        // save function call into a queue till next 'play()' call
        this.timerQueue.push({
          fn: fn,
          delay: delay
        });
      } else {
        return this.setTimeout(fn, this.fastForward ? 0 : delay);
      }
    },

    /**
     * Helper function which does the real job of creating timers.
     */
    setTimeout: function(fn, delay) {
      var that = this;
      if (!delay) {
        fn();
      } else {
        var timer = setTimeout(function() {
          fn();
          that.timers = _.filter(that.timers, function(item) {
            return item != timer;
          });
        }, delay);
        that.timers.push(timer);
        return timer;
      }
    },

    /**
     * Pause current scenario playback. It can be restored with `play()` method call.
     */
    pause: function() {
      this.state = STATE_PAUSE;
      this.trigger('pause');
    },

    /**
     * Stops playback of current scenario.
     */
    stop: function() {
      if (this.state !== STATE_IDLE) {
        this.state = STATE_IDLE;
        this.timerQueue.length = 0;
        this.trigger('stop');
      }
    },

    /**
     * Resets player initial vanilla state.
     */
    reset: function() {
      this.state = STATE_IDLE;
      this.cleanupFunc = [];
      this.actionIndex = -1;
      this.setStep(0);
      this.editor.execCommand('revert');
      this.trigger('reset');
    },

    /**
     * Set fastForward status.
     */
    setFastForward: function(value) {
      this.fastForward = value;
      this.trigger('fastForward', value);
    },

    /**
     * Returns current playback state.
     * @return {String}
     */
    getState: function() {
      return this.state;
    },

    /**
     * Toggle playback of the scenario.
     */
    toggle: function() {
      if (this.state === STATE_PLAY) {
        this.pause();
      } else {
        this.play();
      }
    },

    // borrowed from Backbone
    /**
     * Bind one or events, to a callback function.
     *
     * @param {String} events Space separated list of events. Pass `"all"` to bind the callback to all events fired.
     * @param {Function} callback A function to execute upon event.
     * @param {Object} context Data which will be passed to callback.
     */
    on: function(events, callback, context) {
      var calls, event, node, tail, list;
      if (!callback) {
        return this;
      }

      events = events.split(eventSplitter);
      calls = this._callbacks || (this._callbacks = {});

      // Create an immutable callback list, allowing traversal during
      // modification.  The tail is an empty object that will always be used
      // as the next node.
      while (event = events.shift()) {
        list = calls[event];
        node = list ? list.tail : {};
        node.next = tail = {};
        node.context = context;
        node.callback = callback;
        calls[event] = {
          tail: tail,
          next: list ? list.next : node
        };
      }

      return this;
    },

    /**
     * Remove one or many callbacks.
     *
     * @param {String} events Space separated list of events. If `null`, removes all bound callbacks for all events.
     * @param {Function} callback A function to execute upon event. If `null`, removes all callbacks for the event.
     * @param {Object} context Data which will be passed to callback. If `null`, removes all callbacks with that function.
     */
    off: function(events, callback, context) {
      var event, calls, node, tail, cb, ctx;

      // No events, or removing *all* events.
      if (!(calls = this._callbacks)) {
        return;
      }

      if (!(events || callback || context)) {
        delete this._callbacks;
        return this;
      }

      // Loop through the listed events and contexts, splicing them out of the
      // linked list of callbacks if appropriate.
      events = events ? events.split(eventSplitter) : _.keys(calls);
      while (event = events.shift()) {
        node = calls[event];
        delete calls[event];
        if (!node || !(callback || context)) {
          continue;
        }

        // Create a new list, omitting the indicated callbacks.
        tail = node.tail;
        while ((node = node.next) !== tail) {
          cb = node.callback;
          ctx = node.context;
          if ((callback && cb !== callback) || (context && ctx !== context)) {
            this.on(event, cb, ctx);
          }
        }
      }

      return this;
    },

    /**
     * Trigger one or many events, firing all bound callbacks. Callbacks are passed the same arguments as `trigger` is,
     * apart from the event name (unless you're listening on `"all"`, which will cause your callback to receive the true
     * name of the event as the first argument).
     *
     * @param {String} events Space separated list of events.
     */
    trigger: function(events) {
      var event, node, calls, tail, args, all, rest;
      if (!(calls = this._callbacks)) {
        return this;
      }

      all = calls.all;
      events = events.split(eventSplitter);
      rest = Array.prototype.slice.call(arguments, 1);

      // For each event, walk through the linked list of callbacks twice,
      // first to trigger the event, then to trigger any `"all"` callbacks.
      while (event = events.shift()) {
        if (node = calls[event]) {
          tail = node.tail;
          while ((node = node.next) !== tail) {
            node.callback.apply(node.context || this, rest);
          }
        }
        if (node = all) {
          tail = node.tail;
          args = [event].concat(rest);
          while ((node = node.next) !== tail) {
            node.callback.apply(node.context || this, args);
          }
        }
      }

      return this;
    },

    setStep: function(step) {
      this.step = step;
      var $player = $(this.editor.display.wrapper).closest('.codeplayer');
      var $roadmap = $('.codeplayer-roadmap', $player);
      var numberOfSteps = $('.step', $roadmap).length;
      $roadmap.addClass('fastForward');
      if (step == "all" || (_.isNumber(step) && (step == -1 || step > $('.codeplayer-roadmap .step', $player).length))) {
        $('.step', $roadmap).removeClass('active').removeClass('transitioned').addClass('completed');
        $roadmap.addClass('completed');
      }
      else if (_.isNumber(step)) {
        $roadmap.removeClass('completed');
        for (var i = 1; i < step; i++) {
          $('.step:nth-child(' + i + ')', $roadmap).removeClass('active').removeClass('transitioned').addClass('completed');
        }
        for (var i = step + 1; i <= numberOfSteps; i++) {
          $('.step:nth-child(' + i + ')', $roadmap).removeClass('active').removeClass('transitioned').removeClass('completed');
        }
        $('.step:nth-child(' + step + ')', $roadmap).removeClass('completed').addClass('active').addClass('transitioned');
      }
      setTimeout(function(){ $roadmap.removeClass('fastForward'); }, 1)
    },

    /**
     * Scroll window to specified jQuery element or position.
     *
     * @param {Object|int} target Either jQuery object or integer screen Y offset where the screen should scroll.
     * @param {int} [time] Animation time.
     */
    scrollToTarget: function(target, time) {
      if (this.fastForward) {
        time = 0;
      }
      //this.$container
      time = _.isNumber(time) ? time : 300;
      if (this.$container[0] == $('body')[0]) {
        var scrollTop = (newScroll == null) ? $(window).scrollTop() : newScroll;
        var viewportHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
        var targetY = (target instanceof $) ? target.offset().top : target;
      }
      else {
        var scrollTop = (newScroll == null) ? this.$container.scrollTop() : newScroll;
        var viewportHeight = Math.max(document.documentElement.clientHeight, this.$container.height());
        var targetY = ((target instanceof $) ? target.offset().top : target)  + this.$container.scrollTop();
      }
      var targetH = (target instanceof $) ? target.height() : 0;
      var scrollPadding = 20;
      var scroll = null;

      if (targetY < scrollTop) {
        scroll = targetY - scrollPadding;
      }
      else if ((targetY + targetH) > (scrollTop + viewportHeight)) {
        scroll = ((targetY + targetH) - viewportHeight + scrollPadding);
      }
      
      if (scroll != null) {
        newScroll = scroll;
        if (time) {
          this.$container.animate({scrollTop: scroll}, time, function() {
            newScroll = null;
          });
        }
        else {
          this.$container.scrollTop(scroll);
          newScroll = null;
        }
      }
    },

    /**
     * Get absolute coordinates of the place in editor.
     *
     * @param {Object} pos
     * @returns {{x: number, y: number}} Object with <code>x</code> and <code>y</code> properties.
     */
    resolvePosition: function(pos) {
      /**
       * @returns {{x: number, y: number}}
       */
      function sanitizeCaretPos(pos) {
        if ('left' in pos) {
          pos.x = pos.left;
        }

        if ('top' in pos) {
          pos.y = pos.top;
        }

        return pos;
      }

      if (pos === 'caret') {
        // get absolute position of current caret position
        return sanitizeCaretPos(this.editor.cursorCoords(true));
      }

      if (_.isObject(pos)) {
        if ('x' in pos && 'y' in pos) {
          // passed absolute coordinates
          return pos;
        }

        if ('left' in pos && 'top' in pos) {
          // passed absolute coordinates
          return sanitizeCaretPos(pos);
        }
      }

      return sanitizeCaretPos(this.editor.charCoords(this.makePos(pos), 'page'));
    },

    /**
     * Check if there's an action type with specified name.
     *
     * @param {String} type Action type.
     * @returns {boolean}
     */
    hasAction: function(type) {
      return typeof(this.availableActions[type]) != 'undefined';
    },

    /**
     * Return action function with specified name.
     *
     * @param {String} type Action type.
     * @returns {Function}
     */
    getAction: function(type) {
      return _.bind(this.availableActions[type], this);
    },

    /**
     * Check if action should be a reverse point.
     *
     * When player's Back method is executed, playback is reverted to the first reversable action. We don't roll-back
     * just to previous action, because some of the actions are very trivial and don't make a lot of sense on their own.
     *
     * @param {String} type Action type.
     * @returns {bool}
     */
    isReversableAction: function(type) {
      return this.availableActions[type].reversable;
    },

    /**
     * Check if action could be played with current locale preferences.
     * @param action Action to check.
     * @returns {boolean}
     */
    isCorrectLocale: function(action) {
      return _.isUndefined(this.locale) || _.isUndefined(action.options.locale) ||
      (this.locale && action.options.locale == this.locale);
    },

    /**
     * Prepare {@link external:CodeMirror.Pos CodeMirror.Pos} object.
     *
     * @param {int|String} pos Can be either:
     * - `caret`: to receive current caret position;
     * - `line:character` string (`2:12`)
     * - single integer, which represents the order number of specific character in a `CodeMirror`'s value.
     * @returns {CodeMirror.Pos}
     */
    makePos: function(pos) {
      if (_.isString(pos)) {
        if (pos === 'caret') {
          return this.editor.getCursor(true);
        }

        if (~pos.indexOf(':')) {
          var parts = pos.split(':');
          return {
            line: parseInt(parts[0], 10),
            ch: parseInt(parts[1], 10)
          };
        }

        pos = parseInt(pos, 10);
      }

      if (_.isNumber(pos)) {
        return this.editor.posFromIndex(pos);
      }

      return pos;
    }
  };

  /**
   * Creates a new instance of `Player`.
   *
   * @param {Element} element Element where the player will be inserted.
   * @param {Scenario} scenario Scenario to play.
   * @param {Object} options Player options.
   * @param {String} [options.mode=none] CodeMirror language mode.
   * @param {String} [options.diff=false] Whether or not attach a diff viewer to editor (CodeMirror Merge addon scripts should
   * be loaded in order for this to work.)
   * @param {String} [options.locale] Scenario texts could be translated. This option picks the locale.
   * @param {String} [options.translation] Interface translation object. Will override default interface texts (see
   * `default_texts` variable of player.js).
   * @returns {Player}
   * @memberOf Player
   */
  Player.create = function(element, scenario, options) {
    options = _.extend({}, defaultOptions, options || {});
    options.locale = options.locale || 'en';

    if (options.mode === undefined && scenario.lang !== undefined) {
      var lang_mode = {
        'java': 'text/x-java',
        'cpp': 'text/x-c++hdr',
        'csharp': 'text/x-csharp',
        'php': 'text/x-php',
        'delphi': 'text/x-pascal',
        'python': 'text/x-python'
      };
      options.mode = lang_mode[scenario.lang];
    }

    var $element = $(element);
    $element.empty().addClass('codeplayer idle');
    $('.tooltip-target').remove();
    $('.tooltip').remove();

    var texts = _.extend(default_texts, options.translation || {});

    // Render steps.
    if (scenario.steps && scenario.steps.length) {
      var $steps = $('<div class="codeplayer-roadmap"></div>');
      for (var i = 0; i < scenario.steps.length; i++) {
        var step_title = _.isObject(scenario.steps[i]) ? scenario.steps[i][options.locale] : scenario.steps[i];
        var $step = $('<div class="step"><div class="step-content">' + step_title + '</div></div>');
        $steps.append($step);
      }
      $element.append($steps);

      $('a', $steps).attr('target', '_blank');
    }


    // Render screen.
    var $wrapper = $('<div class="codeplayer-screen-wrapper"></div>');
    $element.append($wrapper);

    // Render screen.
    var $screen = $('<div class="codeplayer-screen"></div>');
    $wrapper.append($screen);


    // Render editor.
    options.diff = (typeof(CodeMirror.MergeView) != 'undefined' && options.diff);
    options.mode = options.mode || '';
    options.edit_mode = options.edit_mode || false;

    var default_options, editor;
    if (options.diff) {
      default_options = {
          value: scenario.code,
          origRight: scenario.code,
          lineNumbers: true,
          showDifferences: false,
          viewportMargin: Infinity,
          readOnly: !options.edit_mode,
          dragDrop: options.edit_mode,
          autofocus: false,
          inputStyle: "textarea"
      };
      var diff = CodeMirror.MergeView($screen[0], _.extend(default_options, options));
      diff.right.orig.setOption("lineNumbers", false);
      editor = diff.edit;
      editor.diff = diff;
    }
    else {
        default_options = {
            value: scenario.code,
            lineNumbers: true,
            viewportMargin: Infinity,
            readOnly: !options.edit_mode,
            dragDrop: options.edit_mode,
            autofocus: false,
            inputStyle: "textarea"
        };
      editor = CodeMirror($screen[0], _.extend(default_options, options));
    }
    $screen.data('CodeMirror', editor);


    // Create a player instance.
    var player = editor.player = new Player(editor, scenario, options);

    // Create typing protection, unless it's debug mode.
    if (!options.edit_mode) {
      var $typing_shield = $('<div class="codeplayer-typing-shield"></div>')
      editor.display.wrapper.appendChild($typing_shield[0]);
      player.on('play resume', function() {
        $typing_shield.addClass('active');
        editor.getInputField().blur();
      });
      player.on('stop', function() {
        $typing_shield.removeClass('active');
      });
      player.on('pause', function() {
        $typing_shield.removeClass('active');
      });
    }

    // Put help into first popover.
    if (!scenario.ready) {
      for (var i = 0; i < scenario.actions.length; i++) {
        if (scenario.actions[i].type == 'popover' && (!scenario.actions[i].options.locale || scenario.actions[i].options.locale == options.locale)) {
          scenario.actions[i].options.text += '<p><small class="blinking-tooltip-text">' + texts["Click on these blue things to continue."] + '</small></p>';
          break;
        }
      }
    }

    // Create controls.
    var $controls = $('<div class="codeplayer-controls"></div>');
    var createButton = function(options) {
      var $button = $('<button type="button" class="btn"></button>').addClass(options.buttonClass).attr('title', options.title);
      $button.icon = $('<span class="icon"></span>').addClass(options.iconClass);
      $button.title = $('<span class="title"></span>').addClass(options.titleClass).html(options.title);
      $button.append($button.icon).append($button.title);
      return $button;
    };

    // Play/Pause.
    var $play_button = createButton({
      title: texts['Play'],
      buttonClass: 'btn-success btn-embossed codeplayer-play',
      iconClass: 'fa fa-play',
      titleClass: 'idle-only'
    });
    $play_button.bind('click', function() {
      if (player.getState() == 'play') {
        player.pause();
      } else {
        player.play();
      }
    });
    $controls.append($play_button);

    var $back_next = $('<div class="btn-group" role="group"></div>');

    var $back_button = createButton({
      title: texts['Back'],
      buttonClass: 'btn-success btn-embossed codeplayer-back',
      iconClass: 'fa fa-angle-left'
    });
    $back_button.bind('click', function() {
      player.back();
    });
    $back_next.append($back_button);

    var $next_button = createButton({
      title: texts['Next'],
      buttonClass: 'btn-success btn-embossed codeplayer-next',
      iconClass: 'fa fa-angle-right'
    });
    $next_button.bind('click', function() {
      player.next();
    });
    $back_next.append($next_button);

    $controls.append($back_next);

    // Diff.
    if (options.diff) {
      var $diff_button = createButton({
        title: texts['Show difference'],
        buttonClass: 'btn-default btn-embossed codeplayer-diff',
        iconClass: 'fa fa-eye'
      });
      $diff_button.bind('click', function() {
        $element.toggleClass('diff');
        diff.setShowDifferences($element.is('.diff'));
        $diff_button.toggleClass('btn-success');
        $diff_button.icon.toggleClass('fa-eye-slash');
        setTimeout(function() {
          editor.refresh();
          diff.right.orig.refresh();
          editor.display.scrollbars.setScrollLeft(0);
        }, 1000);
      });
      $controls.append($diff_button);
      player.on('stop', function() {
        $diff_button.trigger('click');
      });
      $diff_button.hide();
    }

    // Compile.
    var hasCompile = false;
    scenario.actions.every(function(el, i) {
      if (scenario.actions[i].type == 'compile' || scenario.actions[i].type == 'readyAndCompile') {
        hasCompile = true;
        return false;
      }
      return true;
    });
    if (hasCompile) {
      var $compile_button = createButton({
        title: texts['Compile and test'],
        buttonClass: 'btn-default btn-embossed codeplayer-compile',
        iconClass: 'fa fa-bug'
      });
      $controls.append($compile_button);
    }

    // Events.
    player.on('stop', function() {
      $play_button.attr('title', texts['Replay']);
      $play_button.icon.attr('class', 'fa fa-refresh');
      $play_button.title.html($play_button.attr('title'));
      $back_next.addClass('hidden');
      $play_button.removeClass('hidden');
    });
    player.on('play resume', function() {
      $element.removeClass('idle');
      $play_button.attr('title', texts['Stop']);
      $play_button.icon.attr('class', 'fa fa-pause');
      $play_button.title.html($play_button.attr('title'));
      $back_next.removeClass('hidden');
      $play_button.addClass('hidden');
    });
    player.on('pause', function() {
      $play_button.attr('title', texts['Play']);
      $play_button.icon.attr('class', 'fa fa-play');
      $play_button.title.html($play_button.attr('title'));
      $back_next.removeClass('hidden');
      $play_button.addClass('hidden');
    });
    player.on('reset', function() {
      $element.addClass('idle');
      $play_button.attr('title', texts['Play']);
      $play_button.icon.attr('class', 'fa fa-play');
      $play_button.title.html($play_button.attr('title'));
      $play_button.removeClass('hidden');
      $back_next.addClass('hidden');
      if (options.diff) {
        $element.removeClass('diff');
        diff.setShowDifferences(false);
        $diff_button.removeClass('btn-success');
      }
    });
    $wrapper.prepend($controls);

    scenario.ready = true;
    return player;
  };

  Player.attach = function(editor, scenario, options) {
    options = _.extend({}, defaultOptions, options || {});
    return new Player(editor, scenario, options);
  };

  CodeMirror.player = Player;

  CodeMirror.commands.revert = function(editor) {
    if (editor.__initial) {
      editor.setValue(editor.__initial.content);
      editor.setCursor(editor.__initial.pos);
    }
  };

  return Player;
}));