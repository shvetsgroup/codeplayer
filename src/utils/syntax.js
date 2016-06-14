(function (root, factory) {
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
}));