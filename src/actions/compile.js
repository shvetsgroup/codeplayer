(function (root, factory) {
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
}));