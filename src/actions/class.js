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
}));