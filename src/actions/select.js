(function (root, factory) {
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
}));