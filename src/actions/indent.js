(function(root, factory) {
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
}));