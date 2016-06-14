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
}));