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

    var editor;
    if (options.diff) {
      var diff = CodeMirror.MergeView($screen[0], {
        value: scenario.code,
        origRight: scenario.code,
        lineNumbers: true,
        mode: options.mode,
        showDifferences: false,
        viewportMargin: Infinity,
        readOnly: !options.edit_mode,
        dragDrop: options.edit_mode,
        autofocus: false
      });
      diff.right.orig.setOption("lineNumbers", false);
      editor = diff.edit;
      editor.diff = diff;
    }
    else {
      editor = CodeMirror($screen[0], {
        value: scenario.code,
        lineNumbers: true,
        mode: options.mode,
        viewportMargin: Infinity,
        readOnly: !options.edit_mode,
        dragDrop: options.edit_mode,
        autofocus: false
      });
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
}));;(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['underscore', 'jquery', '../codeplayer', 'codemirror', '../utils/syntax'], factory);
  } else if (typeof exports === 'object') {
    // CommonJS
    factory(require('underscore'), require('jquery'), require('../codeplayer'), require('codemirror'), require('syntax'));
  } else {
    // Browser globals
    factory(root._, (root.jQuery || root.Zepto || root.ender || root.$), root.CodeMirror.player, root.CodeMirror);
  }
}(this, function (_, $, pl, CodeMirror) {

  pl.prototype.getLocationRange = function(location, parent, place, text) {
    var editor = this.editor;
    function findPos(pos, shift) {
      return editor.findPosH(pos, shift, "char", false);
    }

    function getLocationData(location, text) {
      var matches = location.match(/(?:([a-zA-Z0-9_\\$]+?) )?([a-zA-Z0-9_\\$]+?)$/);
      var type = matches[1];
      var name = matches[2];
      var r = {
        start: '^([^\\S\\n]*)',
        class: {
          visibility: '((private|protected|public|internal)\\s+)?',
          abstract: '((abstract|virtual|static|partial)\\s+)?',
          class: '((class)\\s+)',
          name: '([a-zA-Z0-9_<>\\\\.]+)',
          super: '((?:\\s+extends|\\s*:)\\s+([a-zA-Z0-9_<>\\\\. ]+)\\s*)?',
          interface: '((?:\\s+implements|\\s*\\,)\\s+([a-zA-Z0-9_<>\\\\., ]+)\\s*)?'
        },
        method: {
          override: '(?:@Override\\s+)?',
          visibility: '((private|protected|public|internal)\\s+)?',
          static: '((override|static|abstract|virtual)\\s+)?',
          type: '(([a-zA-Z0-9_<>\\$]+?)\\s+)?',
          name: '([a-zA-Z0-9_<>\\$]+?)',
          parameters: '\\s*\\(([^;\\(\\{\\}]*?)\\)',
          base: '(\\s*:\\s*(base|this)\\([a-zA-Z0-9_<>\\\\., ]*\\))?'
        },
        end: '\\s*'
      };

      var regexp = r.start;

      if (!type) {
        type = text.match(RegExp(r.class.class + '(' + name + ')', 'im'), null, true) ? 'class' : null;
      }

      if (type == 'class') {
        regexp += r.class.visibility + r.class.abstract + r.class.class + '(' + name + ')' + r.class.super + r.class.interface;
      }
      else {
        if (type == 'public' || type == 'private' || type == 'protected') {
          regexp += r.method.override + '((' + type + ')\\s+)' + '(())' + '(())' + '(' + name + ')' + r.method.parameters + r.method.base;
        }
        else if (type == 'static') {
          regexp += r.method.override + r.method.visibility + '((' + type + ')\\s+)' + '(())' + '(' + name + ')' + r.method.parameters + r.method.base;
        }
        else if (type) {
          regexp += r.method.override + r.method.visibility + r.method.static + '((' + type + ')\\s+)' + '(' + name + ')' + r.method.parameters + r.method.base;
        }
        else {
          regexp += r.method.override + r.method.visibility + r.method.static + r.method.type + '(' + name + ')' + r.method.parameters + r.method.base;
        }
      }
      regexp += r.end;
      return {
        type: type,
        regexp: regexp
      };
    }

    function getLocation(location, region) {
      region = region || {anchor: CodeMirror.Pos(0, 0), head: CodeMirror.Pos(editor.doc.lastLine())};

      if (!location) {
        return region;
      }

      var text = editor.doc.getRange(region.anchor, region.head);
      locationData = getLocationData(location, text);
      var cur = text.match(RegExp(locationData.regexp + '\\{', 'im'), null, true);
      if (!cur) {
        throw 'Method or class "' + location + '" can not be found in source text.';
      }

      var result = {};
      result.anchor = findPos(region.anchor, cur.index + cur[0].length);
      result.head = editor.findMatchingBracket(result.anchor, false).to;
      result.before = findPos(region.anchor, cur.index - 1);
      result.after = findPos(result.head, 1);
      result.start = CodeMirror.Pos(result.anchor.line, result.anchor.ch);
      result.end = CodeMirror.Pos(result.head.line, result.head.ch);
      var noCodeBefore = editor.doc.getLine(result.end.line).slice(0, result.end.ch).trim() == '';
      if (noCodeBefore) {
        if (result.end.line > 0) {
          result.end.line--;
          result.end.ch = editor.doc.getLine(result.end.line).length;
        }
      }
      return result;
    }

    function getPlace(location, place, region) {
      if (!place) {
        return region;
      }
      result = $.extend({}, region);

      var parCur = editor.getSearchCursor('(', result.start, true);
      if (parCur.findPrevious()) {
        result.parameters = CodeMirror.Pos(parCur.from().line, parCur.from().ch + 1);
      }
      var parCur = editor.getSearchCursor(')', result.start, true);
      if (parCur.findPrevious()) {
        result["parameters end"] = parCur.from();
      }

      switch (place) {
        case 'name':
        case 'visibility':
        case 'static':
        case 'abstract':
        case 'type':
        case 'super':
        case 'interface':
          var res = {};
          var signatureParser = editor.getSearchCursor(RegExp(locationData.regexp, 'i'), result.start, true);
          if (signatureParser.findPrevious()) {
            if (locationData.type == 'class') {
              var index = 1;
              var nextStart = findPos(signatureParser.pos.from, signatureParser.pos.match[index].length);
              index++;
              if (signatureParser.pos.match[index]) {
                res['visibility'] = {
                  anchor: nextStart,
                  head: CodeMirror.Pos(nextStart.line, nextStart.ch + signatureParser.pos.match[index + 1].trim().length)
                };
                nextStart = findPos(nextStart, signatureParser.pos.match[index].length);
              }
              index += 2;
              if (signatureParser.pos.match[index]) {
                res['abstract'] = {
                  anchor: nextStart,
                  head: CodeMirror.Pos(nextStart.line, nextStart.ch + signatureParser.pos.match[index + 1].trim().length)
                };
                nextStart = findPos(nextStart, signatureParser.pos.match[index].length);
              }
              index += 2;
              if (signatureParser.pos.match[index]) {
                res['type'] = {
                  anchor: nextStart,
                  head: CodeMirror.Pos(nextStart.line, nextStart.ch + signatureParser.pos.match[index + 1].trim().length)
                };
                nextStart = findPos(nextStart, signatureParser.pos.match[index].length);
              }
              index += 2;
              if (signatureParser.pos.match[index]) {
                res['name'] = {
                  anchor: nextStart,
                  head: CodeMirror.Pos(nextStart.line, nextStart.ch + signatureParser.pos.match[index].trim().length)
                };
                nextStart = findPos(nextStart, signatureParser.pos.match[index].length);
              }
              index += 1;
              if (signatureParser.pos.match[index]) {
                var offset = signatureParser.pos.match[index].indexOf(signatureParser.pos.match[index + 1]);
                res['super'] = {
                  anchor: CodeMirror.Pos(nextStart.line, nextStart.ch + offset),
                  head: CodeMirror.Pos(nextStart.line, nextStart.ch + offset + signatureParser.pos.match[index + 1].trim().length)
                };
                nextStart = findPos(nextStart, signatureParser.pos.match[index].length);
              }
              index += 2;
              if (signatureParser.pos.match[index]) {
                var offset = signatureParser.pos.match[index].indexOf(signatureParser.pos.match[index + 1]);
                res['interface'] = {
                  anchor: CodeMirror.Pos(nextStart.line, nextStart.ch + offset),
                  head: CodeMirror.Pos(nextStart.line, nextStart.ch + offset + signatureParser.pos.match[index + 1].trim().length)
                };
                nextStart = findPos(nextStart, signatureParser.pos.match[index].length);
              }
            }
            else {
              var nextStart = findPos(signatureParser.pos.from, signatureParser.pos.match[1].length);
              if (signatureParser.pos.match[2]) {
                res['visibility'] = {
                  anchor: nextStart,
                  head: CodeMirror.Pos(nextStart.line, nextStart.ch + signatureParser.pos.match[3].trim().length)
                };
                nextStart = findPos(nextStart, signatureParser.pos.match[2].length);
              }
              if (signatureParser.pos.match[4]) {
                res['static'] = {
                  anchor: nextStart,
                  head: CodeMirror.Pos(nextStart.line, nextStart.ch + signatureParser.pos.match[5].trim().length)
                };
                res['abstract'] = res['static'];
                nextStart = findPos(nextStart, signatureParser.pos.match[4].length);
              }
              if (signatureParser.pos.match[6]) {
                res['type'] = {
                  anchor: nextStart,
                  head: CodeMirror.Pos(nextStart.line, nextStart.ch + signatureParser.pos.match[7].length)
                };
                nextStart = findPos(nextStart, signatureParser.pos.match[6].length);
              }
              res['name'] = {
                anchor: nextStart,
                head: CodeMirror.Pos(nextStart.line, nextStart.ch + signatureParser.pos.match[8].length)
              };
            }
            result = res[place];
          }
          else {
            throw 'Signature of "' + location + '" can not be found.';
          }
          break;
        case 'body':
          result.anchor = findPos(result.start, 1);
          result.head = result.end;
          break;
        case 'whole':
          result.anchor = (result.before.line == 0 && result.before.ch == 0) ? result.before : findPos(result.before, 1);
          result.head = findPos(result.after, 1);
          break;
        case 'start':
          result.anchor = result.start;
          break;
        case 'end':
          result.anchor = result.end;
          break;
        case 'before':
          result.anchor = result.before;
          break;
        case 'after':
          result.anchor = result.after;
          break;
        case 'parameters':
          if (result.parameters && result["parameters end"]) {
            result.anchor = result.parameters;
            result.head = result["parameters end"];
          }
          else {
            throw "Method " + location + " has no parameters.";
          }
          break;
        case 'parameters end':
          if (result.parameters && result["parameters end"]) {
            result.anchor = result["parameters end"];
          }
          else {
            throw "Method " + location + " has no parameters.";
          }
          break;
      }
      return result;
    }

    var locationData;
    var result = parent ? getLocation(parent) : null;
    result = getLocation(location, result);
    result = getPlace(location, place, result);

    return result;
  };
}));;(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['underscore', 'jquery', '../codeplayer'], factory);
  } else if (typeof exports === 'object') {
    // CommonJS
    factory(require('underscore'), require('jquery'), require('../codeplayer'));
  } else {
    // Browser globals
    factory(root._, (root.jQuery || root.Zepto || root.ender || root.$), root.CodeMirror.player);
  }
}(this, function (_, $, pl) {
  /**
   * Add css class to specified element.
   *
   * @function addClass
   * @memberof Player.availableActions#
   * @param {Object} options
   * @param {String} options.selector CSS selector of target element.
   * @param {String} options.class CSS class to add.
   * @param {int} [options.wait=0] Time to wait before proceeding.
   * @param {Function} [next] Reference to the next action.
   */
  pl.prototype.availableActions.addClass = function(options, next) {
    var that = this;

    next = next || _.bind(that.next, that);
    options = _.extend({
      wait: 0
    }, options || {});

    $(options.selector).addClass(options.class);
    that.scrollToTarget($(options.selector));

    that.timer(function() {
      next();
    }, options.wait);
  };

  /**
   * Remove css class from specified element.
   *
   * @function removeClass
   * @memberof Player.availableActions#
   * @param {Object} options
   * @param {String} options.selector CSS selector of target element.
   * @param {String} options.class CSS class to add.
   * @param {int} [options.wait = 0] Time to wait before proceeding.
   * @param {Function} [next] Reference to the next action.
   */
  pl.prototype.availableActions.removeClass = function(options, next) {
    var that = this;

    next = next || _.bind(that.next, that);
    options = _.extend({
      wait: 0
    }, options || {});

    $(options.selector).removeClass(options.class);

    that.timer(function() {
      next();
    }, options.wait);
  };
}));;(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['underscore', 'jquery', '../codeplayer', 'tooltip'], factory);
    } else if (typeof exports === 'object') {
        // CommonJS
        factory(require('underscore'), require('jquery'), require('../codeplayer'), require('tooltip'));
    } else {
        // Browser globals
        factory(root._, (root.jQuery || root.Zepto || root.ender || root.$), root.CodeMirror.player);
    }
}(this, function (_, $, pl) {

    /**
     * Shows a text message.
     *
     * @function popover
     * @memberof Player.availableActions#
     * @param {Object} options
     * @param {String} options.text Popover text.
     * @param {String|int} [options.wait = "click"] Time to wait before launching next action or `click` to only
     * continue after click.
     * @param {String} [options.hide = "same"] Either `same` to match `wait`'s value, or `click` to hide on click,
     * or `none` to remain visible.
     * @param {String} [options.attachment = "element"] Where to attach a tooltip:
     * - `code`: to a code at cursor or selection;
     * - `element`: to specific element on page (`selector` parameter).
     * @param {String|Object} [options.popover.pos = 'caret'] If `attachment` is `code`, you should pass 'caret' or
     * CodeMirror.Pos object to specify location of the popover in editor.
     * @param {String} [options.popover.selector = '.codeplayer-compile'] If `attachment` is `element`, you should pass a
     * CSS selector of the target element.
     * @param {String} [options.popover.placement = "right"] From which side to display a popover (`top`, `bottom`,
     * `left`, `right`).
     * @param {String} [options.popover.class = ""] Pass to add extra classes to the popover element.
     * @param {String} [options.popover.hideOthers = false] Upon hiding the popover, hide all other popovers.
     * @param {Function} [next] Function which should be executed after action is finished. If not passed, player's
     * `next()` method will be called instead.
     */
    pl.prototype.availableActions.popover = function (options, next) {
        var that = this;

        next = next || _.bind(that.next, that);
        options = _.extend({
            wait: 'click',
            hide: 'same',
            attachment: 'code',
            pos: 'caret',
            selector: '',
            placement: 'top',
            class: '',
            hideOthers: false,
            locale: 'en'
        }, options || {});
        if (this.locale && options.locale != this.locale) {
            return next();
        }

        // Detect target element.
        var $element;
        var $selection = $('.CodeMirror-selected:first-child', $(that.editor.display.selectionDiv));
        var $player = $(that.editor.display.wrapper).closest('.codeplayer');

        if (options.attachment == 'element') {
            if (options.selector instanceof jQuery) {
                $element = options.selector;
            }
            else if (options.selector == ".codeplayer-roadmap") {
                $element = $(options.selector, $player);
            }
            else {
                $element = $(options.selector);
            }
        }
        else {
            if (options.attachment == 'code' || that.editor.getSelection() == '' || $selection.offset() == undefined) {
                var pos = that.resolvePosition(options.pos);
                if (options.placement == 'bottom') {
                    pos.y += that.LINE_HEIGHT;
                }
                if (options.placement == 'left' || options.placement == 'right') {
                    pos.y += that.LINE_HEIGHT / 2;
                }
                $element = $('<div class="tooltip-target"></div>');
                $element.css({
                    left: pos.x + "px",
                    top: pos.y + "px"
                });
                this.$container.append($element);
            }
            else if (options.attachment == 'selection') {
                var pos = {x: $selection.offset().left, y: $selection.offset().top};
                if (options.placement == 'top' || options.placement == 'bottom') {
                    pos.x += $selection.width() / 2;
                }
                if (options.placement == 'left' || options.placement == 'right') {
                    pos.y += $selection.height() / 2;
                }
                if (options.placement == 'bottom') {
                    var $bottomMostSelection = $selection;
                    $('.CodeMirror-selected', $(that.editor.display.selectionDiv)).each(function () {
                        if ($(this).offset().top > $bottomMostSelection.offset().top) {
                            $bottomMostSelection = $(this);
                        }
                    });
                    pos.x = $bottomMostSelection.offset().left;
                    pos.y = $bottomMostSelection.offset().top + $bottomMostSelection.height();
                }
                if (options.placement == 'right') {
                    pos.x += $selection.width();
                }
                $element = $('<div class="tooltip-target"></div>');
                $element.css({
                    left: pos.x + "px",
                    top: pos.y + "px"
                });
                this.$container.append($element);
            }
            if (this.$container[0] != $('body')[0]) {
                $element.css({top: (pos.y + this.$container.scrollTop()) + "px"});
            }
        }

        if ($element != null && $element.length) {
            if (options.attachment == 'element' && $element.attr('title')) {
                $element.attr('data-orig-title', $element.attr('title')).removeAttr('title', '');
            }
            $element.tooltip({
                title: options.text,
                placement: options.placement,
                trigger: 'manual',
                html: true,
                constraints: [
                    {
                        to: 'window',
                        attachment: 'together',
                        pin: true
                    }
                ]
            }).tooltip("show");
            that.tooltip_targets.push($element);

            var $tooltip = $('#' + $element.attr('aria-describedby'));
            if (!$tooltip.length) {
                $tooltip = this.$container.find('.tooltip').last();
            }
            $tooltip.addClass('codeplayer-tooltip');
            var $all_tooltips = $('.tooltip.codeplayer-tooltip');
            if ($tooltip.length) {
                $('a', $tooltip).attr('target', '_blank');

                if (options.class) {
                    $tooltip.addClass(options.class);
                }
                that.scrollToTarget($tooltip);

                if (that.fastForward) {
                    options.wait = 0;
                    options.hide = 'same';
                }

                var hideFunc = function () {
                    that.tooltip_targets.splice(_.indexOf(that.tooltip_targets, $element), 1);
                    $element.tooltip("dispose");
                    // This attribute is set by tooltip lib itself and it messes up compilation tooltip texts.
                    $element.removeAttr('data-original-title');
                    if ($element.is('.tooltip-target')) {
                        $element.remove();
                    }
                    else if ($element.attr('data-orig-title')) {
                        $element.attr('title', $element.attr('data-orig-title')).removeAttr('data-orig-title')
                    }

                    if (options.hideOthers) {
                        that.hidePopovers();
                    }
                };

                if (options.hide != 'none') {
                    that.cleanupFunc.push(hideFunc);
                }

                if (_.isNumber(options.wait)) {
                    that.timer(function () {
                        if (options.hide == 'same') {
                            hideFunc();
                        }
                        next();
                    }, options.wait);
                }

                // We should launch next event on clicking any visible popover.
                $all_tooltips.off('click').click(function (e) {
                    if (e.target.tagName == 'A') {
                        return true;
                    }
                    $all_tooltips.off('click');
                    if (options.hide == 'click' || (options.wait == 'click' && options.hide == 'same')) {
                        hideFunc();
                    }
                    if (options.wait == 'click') {
                        next();
                    }
                });
            }
            else {
                next();
            }
        }
    };
    pl.prototype.availableActions.popover.init = function () {
        this.tooltip_targets = [];
    };
    pl.prototype.availableActions.popover.reversable = true;
    pl.prototype.availableActions.popover.saveState = function (action) {
        var popovers = [];
        this.tooltip_targets.forEach(function ($element) {
            popovers.push({
                target: $element.is('.tooltip-target') ? $element.clone() : $element,
                tooltip: $element.data('bs.tooltip').options
            });
        });
        action.state.popovers = popovers;
    };
    pl.prototype.availableActions.popover.revertState = function (action) {
        this.hidePopovers();
        if (action.state.popovers) {
            action.state.popovers.forEach(function (obj) {
                $element = obj.target;
                if ($element.is('.tooltip-target')) {
                    this.$container.append($element);
                }
                this.tooltip_targets.push(obj.target);
                $element.tooltip(obj.tooltip).tooltip("show");
            });
        }
    };

    /**
     * Hide all existing popovers.
     */
    pl.prototype.availableActions.hidePopovers = function (options, next) {
        var that = this;

        next = next || _.bind(that.next, that);
        options = _.extend({
            wait: 100
        }, options || {});

        that.hidePopovers();
        that.timer(next, options.wait);
    };

    pl.prototype.hidePopovers = function () {
        var $element;
        for (var i = this.tooltip_targets.length - 1; i >= 0; i--) {
            $element = this.tooltip_targets[i];
            this.tooltip_targets.splice(i, 1);
            $element.tooltip("dispose");
            // This attribute is set by tooltip lib itself and it messes up compilation tooltip texts.
            $element.removeAttr('data-original-title');
            if ($element.is('.tooltip-target')) {
                $element.remove();
            }
            else if ($element.attr('data-orig-title')) {
                $element.attr('title', $element.attr('data-orig-title')).removeAttr('data-orig-title')
            }
        }
    }
}));;(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['underscore', 'jquery', '../codeplayer', './popover'], factory);
  } else if (typeof exports === 'object') {
    // CommonJS
    factory(require('underscore'), require('jquery'), require('../codeplayer'));
  } else {
    // Browser globals
    factory(root._, (root.jQuery || root.Zepto || root.ender || root.$), root.CodeMirror.player);
  }
}(this, function (_, $, pl) {
  /**
   * Make compile button seem active for a specific period of time.
   *
   * @function compile
   * @memberof Player.availableActions#
   * @param {Object} options
   * @param {String} [options.text] Popover text.
   * @param {bool} [options.success=true] Is compilation successfull or not.
   * @param {int} [options.wait=1000] Time of compilation (in other words, time to delay the next steps).
   * @param {Object} [options.popover] Popover, which will be shown after compilation.
   * @param {String|int} [options.popover.wait = "click"] Time to wait before launching next action or `click` to only
   * continue after click.
   * @param {String} [options.popover.hide = "same"] Either `same` to match `wait`'s value, or `click` to hide on click,
   * or `none` to remain visible.
   * @param {Function} [next] Function which should be executed after action is finished. If not passed, player's
   * `next()` method will be called instead.
   */
  pl.prototype.availableActions.compile = function(options, next) {
    var that = this;
    
    next = next || _.bind(that.next, that);
    var $player = $(that.editor.display.wrapper).closest('.codeplayer');
    options = _.extend({
      success: true,
      wait: 1000,
      popover: {}
    }, options || {});
    options.popover.wait = options.popover.wait || "click";
    options.popover.hide = options.popover.hide || "same";
    options.popover.attachment = "element";
    options.popover.selector = $('.codeplayer-compile', $player);
    options.popover.placement = "right";
    if (options.text !== undefined) {
      options.popover.text = options.text;
    }
    options.popover.text = options.popover.text || ((options.success && options.popover.text == undefined) ? "<b>Все отлично, можем продолжать!</b>" : "");
    options.popover.locale = options.locale;

    var cleanupFunc = function(){
      $(".codeplayer-compile", $player).removeClass('active').removeClass('btn-danger').removeClass('btn-success');
      $(".codeplayer-compile span", $player).removeClass('fa-spin').addClass('fa-bug').removeClass('fa-cog');
    };
    that.cleanupFunc.push(cleanupFunc);

    that.hidePopovers();    
    $(".codeplayer-compile", $player).addClass('active').addClass('btn-danger');
    $(".codeplayer-compile span", $player).addClass('fa-cog').removeClass('fa-bug').addClass('fa-spin');

    that.timer(function() {
      $(".codeplayer-compile", $player).removeClass('active').removeClass('btn-danger');
      $(".codeplayer-compile span", $player).removeClass('fa-spin').addClass('fa-bug').removeClass('fa-cog');

      if (options.popover.text) {

        if (options.success) {
          options.popover.class += " tooltip-success";
          $(".codeplayer-compile", $player).addClass('btn-success');
        }
        else {
          options.popover.class += " tooltip-danger";
          $(".codeplayer-compile", $player).addClass('btn-danger');
        }
        that.getAction('popover')(options.popover, function() {
          $(".codeplayer-compile", $player).removeClass('btn-success').removeClass('btn-danger');
          next();
        })
      }
      else {
        next();
      }
    }, options.wait);
  };

  /**
   * Show pre-compilation message, compile and show post-compilation message.
   *
   * @function readyAndCompile
   * @memberof Player.availableActions#
   * @param {Object} options
   * @param {String} [options.text] Pre-compilation message text.
   * @param {String} [options.text2] Post-compilation message text.
   * @param {bool} [options.success=true] Is compilation successfull or not.
   * @param {int} [options.wait=1000] Time of compilation (in other words, time to delay the next steps).
   * @param {bool} [options.waitForClick=false] Whether or not compilation should start after click on message or button.
   * @param {Function} [next] Function which should be executed after action is finished. If not passed, player's
   * `next()` method will be called instead.
   */
  pl.prototype.availableActions.readyAndCompile = function(options, next) {
    var that = this;
    
    next = next || _.bind(that.next, that);
    options = _.extend({
      success: true,
      wait: 1000,
      waitForClick: false,
      locale: 'en'
    }, options || {});

    if (this.locale && options.locale != this.locale) {
        return next();
    }
    var $player = $(that.editor.display.wrapper).closest('.codeplayer');

    var next_action = function() {
      that.cleanupFunc.push(function(){
        $(".codeplayer-compile", $player).removeClass('blinking');
      });
      $(".codeplayer-compile", $player).addClass('blinking');

      that.getAction('waitForClickOn')({
        selector: ".codeplayer-compile, .tooltip",
        timeout: options.waitForClick ? 0 : 2000
      }, function() {
        $(".codeplayer-compile", $player).removeClass('blinking');
        that.getAction('compile')({
          success: options.success,
          wait: options.wait,
          text: options.text2,
          locale: options.locale
        }, next);
      });
    };

    if (options.text) {
      var popover_options = {
        attachment: "element",
        selector: $('.codeplayer-compile', $player),
        placement: "right",
        wait: 100,
        hide: "none",
        text: options.text,
        locale: options.locale
      };
      that.cleanupFunc.push(function(){
        that.hidePopovers();
      });
      that.getAction('popover')(popover_options, next_action);
    }
    else {
      next_action();
    }
  };

  pl.prototype.availableActions.readyAndCompile.reversable = true;
  pl.prototype.availableActions.readyAndCompile.saveState = pl.prototype.availableActions.popover.saveState;
  pl.prototype.availableActions.readyAndCompile.revertState = function(action) {
    $(".codeplayer-compile").removeClass('blinking');
    pl.prototype.availableActions.popover.revertState.call(this, action);
  }
}));;(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['underscore', 'jquery', '../codeplayer'], factory);
  } else if (typeof exports === 'object') {
    // CommonJS
    factory(require('underscore'), require('jquery'), require('../codeplayer'));
  } else {
    // Browser globals
    factory(root._, (root.jQuery || root.Zepto || root.ender || root.$), root.CodeMirror.player);
  }
}(this, function(_, $, pl) {
  /**
   * Indent selected text by one tab.
   *
   * @function indent
   * @memberof Player.availableActions#
   * @param {Object} options
   * @param {int} [options.delay=500] Delay before and after performing operation.
   * @param {bool} [options.times=1] Number of indentations.
   * @param {Function} [next] Reference to the next action.
   */
  pl.prototype.availableActions.indent = function(options, next) {
    this.doIndent('add', options, next);
  };

  /**
   * Subtract indent from selected text by one tab.
   *
   * @function deindent
   * @memberof Player.availableActions#
   * @param {Object} options
   * @param {int} [options.delay=500] Delay before and after performing operation.
   * @param {bool} [options.times=1] Number of indentations.
   * @param {Function} [next] Reference to the next action.
   */
  pl.prototype.availableActions.deindent = function(options, next) {
    this.doIndent('subtract', options, next);
  };

  pl.prototype.doIndent = function(action, options, next) {
    var that = this;

    next = next || _.bind(that.next, that);
    options = _.extend({
      delay: 500,
      times: 1
    }, options || {});

    var times = options.times;

    function justDoIt() {
      for (var i = 0; i < options.times; i++) {
        that.editor.indentSelection(action);
      }
    }
    
    var state = {
      value: that.editor.getValue(),
      cursor: that.editor.getCursor(),
      selection: that.editor.doc.listSelections()
    };
    this.cleanupFunc.push(function() {
      that.editor.setValue(state.value);
      that.editor.setCursor(state.cursor);
      that.editor.setSelections(state.selection);
      justDoIt()
    });
    
    if (that.fastForward || options.delay == 0) {
      justDoIt();
      next();
    }
    else {
      function perform() {
        try {
          that.editor.indentSelection(action);
        } catch (e) {
        }
        if (--times > 0) {
          that.timer(perform, options.delay);
        } else {
          next();
        }
      }
      that.timer(perform, options.delay);
    }
  };
}));;(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['underscore', 'jquery', '../codeplayer'], factory);
  } else if (typeof exports === 'object') {
    // CommonJS
    factory(require('underscore'), require('jquery'), require('../codeplayer'));
  } else {
    // Browser globals
    factory(root._, (root.jQuery || root.Zepto || root.ender || root.$), root.CodeMirror.player);
  }
}(this, function (_, $, pl) {
  /**
   * Similar to `moveTo` action but executed immediately.
   *
   * @function jumpTo
   * @memberof Player.availableActions#
   * @param {Object} options
   * @param {CodeMirror.Pos} options.pos Target position.
   * @param {int} [options.afterDelay=200] Delay before next action.
   * @param {Function} [next] Reference to the next action.
   */
  pl.prototype.availableActions.jumpTo = function(options, next) {
    var that = this;
    next = next || _.bind(that.next, that);
    options = _.extend({
      afterDelay: 200
    }, options || {});

    if (!options.pos) {
      throw 'No position specified for "jumpTo" action';
    }

    var pos = that.resolvePosition(options.pos);
    that.scrollToTarget(pos.y + that.LINE_HEIGHT);

    that.editor.setCursor(that.makePos(options.pos));
    that.timer(next, options.afterDelay);
  };
}));;(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['underscore', 'jquery', '../codeplayer', 'codemirror', '../utils/syntax'], factory);
  } else if (typeof exports === 'object') {
    // CommonJS
    factory(require('underscore'), require('jquery'), require('../codeplayer'), require('codemirror'), require('../utils/syntax'));
  } else {
    // Browser globals
    factory(root._, (root.jQuery || root.Zepto || root.ender || root.$), root.CodeMirror.player, root.CodeMirror);
  }
}(this, function (_, $, pl, CodeMirror) {
  /**
   * Move caret to a specified position.
   *
   * @function moveTo
   * @memberof Player.availableActions#
   * @param {Object} options
   * @param {CodeMirror.Pos} [options.pos] Target position.
   * 
   * @param {String} [options.location] String locator of the target position.
   * @param {String} [options.parent] String locator of the target position.
   * @param {String} [options.place] String locator of the target position.
   * @param {String} [options.text] String locator of the target position.
   * 
   * @param {int} [options.delay=200] Delay before and after performing operation.
   * @param {Function} [next] Reference to the next action.
   */
  pl.prototype.availableActions.moveTo = function(options, next) {
    var that = this;
    next = next || _.bind(that.next, that);
    options = _.extend({
      pos: null,
      location: '',
      parent: '',
      place: '',
      text: '',
      delay: 80,
      immediate: false // TODO: remove, use delay: 0 instead
    }, options || {});

    var region = {};
    if (options.location || options.place || options.text) {
      region = that.getLocationRange(options.location, options.parent, options.place, options.text);
      region = getText(that.editor, region, options.location, options.parent, options.place, options.text);
      options.pos = region.anchor;
    }

    var curPos = that.editor.getCursor(true);
    // reset selection, if exists
    that.editor.setSelection(curPos, curPos);
    var targetPos = that.makePos(options.pos);

    if (options.immediate || !options.delay) {
      that.editor.setCursor(targetPos);
      next();
      return;
    }

    console.log(targetPos);
    this.cleanupFunc.push(function() {
      that.editor.setCursor(targetPos);
      console.log('x');
      console.log(targetPos);
    });

    var deltaLine = targetPos.line - curPos.line;
    var deltaChar = targetPos.ch - curPos.ch;
    var steps = Math.max(deltaChar, deltaLine);
    // var stepLine = deltaLine / steps;
    // var stepChar = deltaChar / steps;
    var stepLine = deltaLine < 0 ? -1 : 1;
    var stepChar = deltaChar < 0 ? -1 : 1;

    function perform() {
      curPos = that.editor.getCursor(true);
      if (steps > 0 && !(curPos.line == targetPos.line && curPos.ch == targetPos.ch)) {

        if (curPos.line != targetPos.line) {
          curPos.line += stepLine;
        }

        if (curPos.ch != targetPos.ch) {
          curPos.ch += stepChar;
        }

        that.editor.setCursor(curPos);
        that.scrollToTarget(that.editor.getCursor(), 0);
        steps--;
        that.timer(perform, options.delay);
      } else {
        that.editor.setCursor(targetPos);
        that.scrollToTarget(that.editor.getCursor(), 0);
        next();
      }
    }
    that.timer(perform, options.delay);

    // NEW: Scroll to a typing position.
    var pos = that.resolvePosition('caret');
  };

  var getText = function (editor, region, location, parent, place, text) {
    if (!text) {
      return region;
    }

    var result = $.extend({}, region);
    var query = text.replace(RegExp('\\|\\|\\|', 'g'), '');
    var textCur = editor.getSearchCursor(query, result.anchor, true);
    if (!textCur.findNext() || (CodeMirror.cmpPos(textCur.to(), result.head) > 0)) {
      var lc = location ? 'method/class "' + location + '" of the ' : '';
      throw 'Text can not be found in ' + lc + ' source text. Searched for:\n```\n' + query + '\n```\n\n...inside:\n```\n' + editor.doc.getRange(result.anchor, result.head) + '\n```';
    }
    result.anchor = textCur.from();
    var shift = text.indexOf('|||');
    if (shift > -1) {
      result.anchor = editor.findPosH(result.anchor, shift, 'char', false);
    }
    return result;
  };
}));;(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['underscore', 'jquery', '../codeplayer'], factory);
  } else if (typeof exports === 'object') {
    // CommonJS
    factory(require('underscore'), require('jquery'), require('../codeplayer'));
  } else {
    // Browser globals
    factory(root._, (root.jQuery || root.Zepto || root.ender || root.$), root.CodeMirror.player);
  }
}(this, function (_, $, pl) {
  /**
   * Executes predefined CodeMirror command
   *
   * @function run
   * @memberof Player.availableActions#
   * @param {Object} options
   * @param {String} options.command Command to run.
   * @param {int} [options.beforeDelay=500] Delay before performing operation.
   * @param {bool} [options.times=1] Number of times to run.
   * @param {Function} [next] Reference to the next action.
   */
  pl.prototype.availableActions.run = function(options, next) {
    var that = this;
    next = next || _.bind(that.next, that);
    options = _.extend({
      beforeDelay: 0,
      times: 1
    }, options || {});

    var times = options.times;
    function perform() {
      try {
        if (_.isFunction(options.command)) {
          options.command(that.editor, options);
        } else {
          that.editor.execCommand(options.command);
        }
      } catch (e) {}
      if (--times > 0) {
        that.timer(perform, options.beforeDelay);
      } else {
        next();
      }
    }
    that.timer(perform, options.beforeDelay);
  };
}));;(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['underscore', 'jquery', '../codeplayer', 'codemirror', '../utils/syntax'], factory);
  } else if (typeof exports === 'object') {
    // CommonJS
    factory(require('underscore'), require('jquery'), require('../codeplayer'), require('codemirror'), require('../utils/syntax'));
  } else {
    // Browser globals
    factory(root._, (root.jQuery || root.Zepto || root.ender || root.$), root.CodeMirror.player, root.CodeMirror);
  }
}(this, function (_, $, pl, CodeMirror) {
  /**
   * Selects specified text or location.
   *
   * @function select
   * @memberof Player.availableActions#
   * @param {Object} options
   * @param {CodeMirror.Pos} [options.from] Select from. Optional if you select by location.
   * @param {CodeMirror.Pos} [options.to] Select to. Optional if you select by location.
   * 
   * @param {String} [options.location] String locator of the target position.
   * @param {String} [options.parent] String locator of the target position.
   * @param {String} [options.place] String locator of the target position.
   * @param {String} [options.text] String locator of the target position.
   * 
   * @param {int} [options.afterDelay=0] Delay before next action.
   * @param {bool} [options.add=false] If `true`, this will add new selection to the currently selected text in editor.  
   * @param {Function} [next] Reference to the next action.
   */
  pl.prototype.availableActions.select = function(options, next) {
    var that = this;
    next = next || _.bind(that.next, that);
    options = _.extend({
      afterDelay: 0,
      add: false
    }, options || {});

    if (options.location && !options.place) {
      options.place = "whole"
    }
    if (options.location || options.place || options.text) {
      var ranges = [], n, start, end, shift;
      try {
        var location = that.getLocationRange(options.location, options.parent, options.place, options.text);
      }
      catch(e) {
        console.error(e);
        return;
      }
      if (options.text) {
        var query = options.text.replace(/\|\|\|/g, '');
        var cur = that.editor.getSearchCursor(query, location.anchor, true);
        var i = 1;
        while (cur.findNext()) {
          if (location.head && CodeMirror.cmpPos(cur.to(), location.head) > 0) break;
          if (!options.index || (options.index > 0 && i == options.index)) {
            // Select parts of the text if ||| pairs are defined.
            if (options.text.indexOf('|||') > -1) {
              var text = options.text;
              while (text.indexOf('|||') > -1) {
                shift = text.indexOf('|||');
                start = that.editor.findPosH(cur.from(), shift, "char", false);
                text = text.replace('|||', '');

                shift = text.indexOf('|||');
                end = that.editor.findPosH(cur.from(), shift, "char", false);
                text = text.replace('|||', '');

                ranges.push({anchor: start, head: end});
              }
            }
            else {
              ranges.push({anchor: cur.from(), head: cur.to()});
            }

            if (options.index > 0 && i == options.index) {
              break;
            }
          }
          i++;
        }
        if (ranges.length) {
          if (options.add) {
            for (var i = 0; i < ranges.length; i++) {
              that.editor.addSelection(ranges[i].anchor, ranges[i].head);
            }
          }
          else {
            that.editor.setSelections(ranges, 0);
          }
        }
        else {
          console.error('Text can not be found in %s source text. Searched for:\n```\n%s\n```\n\n...inside:\n```\n%s\n```',
            (options.location ? 'method/class "' + options.location + '" of the ' : ''), query, that.editor.doc.getRange(location.anchor, location.head));
          return;
        }
      }
      else {
        if (options.add) {
          that.editor.addSelection(location.anchor, location.head);
        }
        else {
          that.editor.setSelection(location.anchor, location.head);
        }
      }
    }
    else if (options.from && options.to) {
      var from = that.makePos(options.from);
      var to = that.makePos(options.to);
      if (options.add) {
        that.editor.addSelection(from, to);
      }
      else {
        that.editor.setSelection(from, to);
      }
    }

    if (that.editor.getSelections().join('') != "") {
      that.scrollToTarget($('.CodeMirror-selected:first-child', $(that.editor.display.selectionDiv)));
    }
    that.timer(next, options.afterDelay);
  };
}));;(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['underscore', 'jquery', '../codeplayer'], factory);
  } else if (typeof exports === 'object') {
    // CommonJS
    factory(require('underscore'), require('jquery'), require('../codeplayer'));
  } else {
    // Browser globals
    factory(root._, (root.jQuery || root.Zepto || root.ender || root.$), root.CodeMirror.player);
  }
}(this, function (_, $, pl) {
  /**
   * Highlight active step in roadmap.
   *
   * @function setStep
   * @memberof Player.availableActions#
   * @param {Object} options
   * @param {int} [options.step=1] Step to activate (all previous steps will become "completed"). Pass `all` to
   * complete all steps.
   * @param {int} [options.wait=1000] Delay before next action.
   * @param {Function} [next] Reference to the next action.
   */
  pl.prototype.availableActions.setStep = function(options, next) {
    var that = this;
    next = next || _.bind(that.next, that);
    options = _.extend({
      step: 1, // Step to activate (all previous steps will become "completed"). Pass "all" to complete everything
      wait: 1000
    }, options || {});
    options.wait = that.fastForward ? 0 : options.wait;
    var $player = $(that.editor.display.wrapper).closest('.codeplayer');
    var $roadmap = $('.codeplayer-roadmap', $player);

    that.cleanupFunc.push(function() {
      that.setStep(options.step);
    });

    that.step = options.step;

    if (!this.fastForward) {
      that.scrollToTarget($roadmap);
    }

    $roadmap.removeClass('fastForward');
    if (options.step == "all" || (_.isNumber(options.step) && (options.step == -1 || options.step > $('.codeplayer-roadmap .step', $player).length))) {
      $('.step', $roadmap).removeClass('active').removeClass('transitioned').addClass('completed');
      that.timer(function() {
        $roadmap.addClass('completed');
        that.timer(function() {
          next();
        }, options.wait);
      }, options.wait);
    }
    else if (_.isNumber(options.step)) {
      var numberOfSteps = $('.step', $roadmap).length;

      for (var i = 1; i < options.step; i++) {
        $('.step:nth-child(' + i + ')', $roadmap).removeClass('transitioned').removeClass('active').addClass('completed');
      }
      for (var i = options.step + 1; i <= numberOfSteps; i++) {
        $('.step:nth-child(' + i + ')', $roadmap).removeClass('transitioned').removeClass('active').removeClass('completed');
      }
      $('.step:nth-child(' + options.step + ')', $roadmap).removeClass('completed').addClass('active');
      that.timer(function() {
        $('.step:nth-child(' + options.step + ')', $roadmap).addClass('transitioned');
        next();
      }, options.wait);
    }
  };
}));;(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['underscore', 'jquery', '../codeplayer'], factory);
  } else if (typeof exports === 'object') {
    // CommonJS
    factory(require('underscore'), require('jquery'), require('../codeplayer'));
  } else {
    // Browser globals
    factory(root._, (root.jQuery || root.Zepto || root.ender || root.$), root.CodeMirror.player);
  }
}(this, function (_, $, pl) {
  /**
   * Type-in passed text into the editor char-by-char.
   *
   * @function type
   * @memberof Player.availableActions#
   * @param {Object} options
   * @param {String} options.text Text to type. You can pass `←` and `→` characters to imitate `Backspace` and `Delete`
   * keys.
   * @param {int} [options.beforeDelay=0] Delay before printing.
   * @param {int} [options.delay=60] Delay between character typing.
   * @param {CodeMirror.Pos} [options.pos='caret'] Initial typing position.
   * @param {Function} [next] Reference to the next action.
   */
  pl.prototype.availableActions.type = function(options, next) {
    var that = this;
    next = next || _.bind(that.next, that);
    options = _.extend({
      beforeDelay: 0,
      delay: 60,
      pos: 'caret'
    }, options || {});

    if (options.pos !== null && options.pos !== 'caret') {
      that.editor.setCursor(that.makePos(options.pos));
    }

    var chars = options.text.split('');

    function printChar() {
      var ch = chars.length ? chars.shift() : '';

      // NEW: Immitate BACKSPACE and DELETE on arrows.
      if (ch == '←') {
        that.editor.execCommand('delCharBefore');
      }
      else if (ch == '→') {
        that.editor.execCommand('delCharAfter');
      }
      else {
        that.editor.replaceSelection(ch, 'end');
      }
    }

    function printAll() {
      var word = '';
      var chars = options.text.split('');
      do {
        var ch = chars.length ? chars.shift() : '';
        if (ch == '←' || ch == '→') {
          if (word.length) {
            that.editor.replaceSelection(word, 'end');
          }

          if (ch == '←') {
            that.editor.execCommand('delCharBefore');
          }
          else if (ch == '→') {
            that.editor.execCommand('delCharAfter');
          }

          word = '';
        }
        else {
          word += ch;
        }
        if (!chars.length) {
          that.editor.replaceSelection(word, 'end');
          word = '';
        }
      } while (chars.length);
    }

    var state = {
      value: that.editor.getValue(),
      cursor: that.editor.getCursor(),
      selection: that.editor.doc.listSelections()
    };
    this.cleanupFunc.push(function() {
      that.editor.setValue(state.value);
      that.editor.setCursor(state.cursor);
      that.editor.setSelections(state.selection);
      printAll();
    });

    var doPrint = function () {
      if (that.fastForward || options.delay == 0) {
        printAll();
        next();
      }
      else {
        that.timer(function perform() {
          // NEW: Scroll to a typing position.
          var pos = that.resolvePosition('caret');
          that.scrollToTarget(pos.y + that.LINE_HEIGHT, 0);

          printChar();

          if (chars.length) {
            that.timer(perform, options.delay);
          } else {
            next();
          }
        }, options.delay);
      }
    };
    if (that.fastForward || options.beforeDelay == 0) {
      doPrint();
    }
    else {
      that.timer(doPrint, options.beforeDelay);
    }
  };
}));;(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define(['underscore', 'jquery', '../codeplayer'], factory);
  } else if (typeof exports === 'object') {
    // CommonJS
    factory(require('underscore'), require('jquery'), require('../codeplayer'));
  } else {
    // Browser globals
    factory(root._, (root.jQuery || root.Zepto || root.ender || root.$), root.CodeMirror.player);
  }
}(this, function (_, $, pl) {
  /**
   * Wait for a specified timeout.
   *
   * @function wait
   * @memberof Player.availableActions#
   * @param {Object} options
   * @param {int} [options.timeout=100] Time to wait (milliseconds).
   * @param {Function} next Reference to the next action.
   */
  pl.prototype.availableActions.wait = function(options, next) {
    var that = this;
    
    next = next || _.bind(that.next, that);
    options = _.extend({
      timeout: 100
    }, options || {});

    that.timer(next, parseInt(options.timeout, 10));
  };

  /**
   * Wait until a specified element is clicked.
   *
   * @function waitForClickOn
   * @memberof Player.availableActions#
   * @param {Object} options
   * @param {String} options.selector CSS selector of the element.
   * @param {int} [options.timeout=0] Delay before next action.
   * @param {Function} next Reference to the next action.
   */
  pl.prototype.availableActions.waitForClickOn = function(options, next) {
    var that = this;
    
    next = next || _.bind(that.next, that);
    if (that.fastForward) {
      next();
      return;
    }
    options = _.extend({
      selector: '', // Target element.
      timeout: 0    // After this time, next action will be fired anyway.
    }, options || {});

    var nextAction = function() {
      if (t != undefined) {
        clearTimeout(t);
      }
      $(options.selector).off('click', nextAction);
      next();
    };

    $(options.selector).on('click', nextAction);

    if (options.timeout) {
      var t = that.timer(nextAction, options.timeout);
    }
  };
}));