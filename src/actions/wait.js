(function (root, factory) {
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