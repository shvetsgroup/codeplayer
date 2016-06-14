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
}));