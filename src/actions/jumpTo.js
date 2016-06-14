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
}));