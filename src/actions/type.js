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
}));