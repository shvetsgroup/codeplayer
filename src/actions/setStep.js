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
   * Highlight active step in roadmap.
   *
   * @function setStep
   * @memberof Player.availableActions#
   * @param {Object} options
   * @param {int} [options.step=1] Step to activate (all previous steps will become "completed"). Pass `all` to
   * complete all steps.
   * @param {int} [options.wait=1000] Delay before next action.
   * @param {Function} [next] Reference to the next action.
   */
  pl.prototype.availableActions.setStep = function(options, next) {
    var that = this;
    next = next || _.bind(that.next, that);
    options = _.extend({
      step: 1, // Step to activate (all previous steps will become "completed"). Pass "all" to complete everything
      wait: 1000
    }, options || {});
    options.wait = that.fastForward ? 0 : options.wait;
    var $player = $(that.editor.display.wrapper).closest('.codeplayer');
    var $roadmap = $('.codeplayer-roadmap', $player);

    that.cleanupFunc.push(function() {
      that.setStep(options.step);
    });

    that.step = options.step;

    if (!this.fastForward) {
      that.scrollToTarget($roadmap);
    }

    $roadmap.removeClass('fastForward');
    if (options.step == "all" || (_.isNumber(options.step) && (options.step == -1 || options.step > $('.codeplayer-roadmap .step', $player).length))) {
      $('.step', $roadmap).removeClass('active').removeClass('transitioned').addClass('completed');
      that.timer(function() {
        $roadmap.addClass('completed');
        that.timer(function() {
          next();
        }, options.wait);
      }, options.wait);
    }
    else if (_.isNumber(options.step)) {
      var numberOfSteps = $('.step', $roadmap).length;

      for (var i = 1; i < options.step; i++) {
        $('.step:nth-child(' + i + ')', $roadmap).removeClass('transitioned').removeClass('active').addClass('completed');
      }
      for (var i = options.step + 1; i <= numberOfSteps; i++) {
        $('.step:nth-child(' + i + ')', $roadmap).removeClass('transitioned').removeClass('active').removeClass('completed');
      }
      $('.step:nth-child(' + options.step + ')', $roadmap).removeClass('completed').addClass('active');
      that.timer(function() {
        $('.step:nth-child(' + options.step + ')', $roadmap).addClass('transitioned');
        next();
      }, options.wait);
    }
  };
}));