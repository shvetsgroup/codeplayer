(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['underscore', 'jquery', '../codeplayer', 'tooltip'], factory);
    } else if (typeof exports === 'object') {
        // CommonJS
        factory(require('underscore'), require('jquery'), require('../codeplayer'), require('tooltip'));
    } else {
        // Browser globals
        factory(root._, (root.jQuery || root.Zepto || root.ender || root.$), root.CodeMirror.player);
    }
}(this, function (_, $, pl) {

    /**
     * Shows a text message.
     *
     * @function popover
     * @memberof Player.availableActions#
     * @param {Object} options
     * @param {String} options.text Popover text.
     * @param {String|int} [options.wait = "click"] Time to wait before launching next action or `click` to only
     * continue after click.
     * @param {String} [options.hide = "same"] Either `same` to match `wait`'s value, or `click` to hide on click,
     * or `none` to remain visible.
     * @param {String} [options.attachment = "element"] Where to attach a tooltip:
     * - `code`: to a code at cursor or selection;
     * - `element`: to specific element on page (`selector` parameter).
     * @param {String|Object} [options.popover.pos = 'caret'] If `attachment` is `code`, you should pass 'caret' or
     * CodeMirror.Pos object to specify location of the popover in editor.
     * @param {String} [options.popover.selector = '.codeplayer-compile'] If `attachment` is `element`, you should pass a
     * CSS selector of the target element.
     * @param {String} [options.popover.placement = "right"] From which side to display a popover (`top`, `bottom`,
     * `left`, `right`).
     * @param {String} [options.popover.class = ""] Pass to add extra classes to the popover element.
     * @param {String} [options.popover.hideOthers = false] Upon hiding the popover, hide all other popovers.
     * @param {Function} [next] Function which should be executed after action is finished. If not passed, player's
     * `next()` method will be called instead.
     */
    pl.prototype.availableActions.popover = function (options, next) {
        var that = this;

        next = next || _.bind(that.next, that);
        options = _.extend({
            wait: 'click',
            hide: 'same',
            attachment: 'code',
            pos: 'caret',
            selector: '',
            placement: 'top',
            class: '',
            hideOthers: false,
            locale: 'en'
        }, options || {});
        if (this.locale && options.locale != this.locale) {
            return next();
        }

        // Detect target element.
        var $element;
        var $selection = $('.CodeMirror-selected:first-child', $(that.editor.display.selectionDiv));
        var $player = $(that.editor.display.wrapper).closest('.codeplayer');

        if (options.attachment == 'element') {
            if (options.selector instanceof jQuery) {
                $element = options.selector;
            }
            else if (options.selector == ".codeplayer-roadmap") {
                $element = $(options.selector, $player);
            }
            else {
                $element = $(options.selector);
            }
        }
        else {
            if (options.attachment == 'code' || that.editor.getSelection() == '' || $selection.offset() == undefined) {
                var pos = that.resolvePosition(options.pos);
                if (options.placement == 'bottom') {
                    pos.y += that.LINE_HEIGHT;
                }
                if (options.placement == 'left' || options.placement == 'right') {
                    pos.y += that.LINE_HEIGHT / 2;
                }
                $element = $('<div class="tooltip-target"></div>');
                $element.css({
                    left: pos.x + "px",
                    top: pos.y + "px"
                });
                this.$container.append($element);
            }
            else if (options.attachment == 'selection') {
                var pos = {x: $selection.offset().left, y: $selection.offset().top};
                if (options.placement == 'top' || options.placement == 'bottom') {
                    pos.x += $selection.width() / 2;
                }
                if (options.placement == 'left' || options.placement == 'right') {
                    pos.y += $selection.height() / 2;
                }
                if (options.placement == 'bottom') {
                    var $bottomMostSelection = $selection;
                    $('.CodeMirror-selected', $(that.editor.display.selectionDiv)).each(function () {
                        if ($(this).offset().top > $bottomMostSelection.offset().top) {
                            $bottomMostSelection = $(this);
                        }
                    });
                    pos.x = $bottomMostSelection.offset().left;
                    pos.y = $bottomMostSelection.offset().top + $bottomMostSelection.height();
                }
                if (options.placement == 'right') {
                    pos.x += $selection.width();
                }
                $element = $('<div class="tooltip-target"></div>');
                $element.css({
                    left: pos.x + "px",
                    top: pos.y + "px"
                });
                this.$container.append($element);
            }
            if (this.$container[0] != $('body')[0]) {
                $element.css({top: (pos.y + this.$container.scrollTop()) + "px"});
            }
        }

        if ($element != null && $element.length) {
            if (options.attachment == 'element' && $element.attr('title')) {
                $element.attr('data-orig-title', $element.attr('title')).removeAttr('title', '');
            }
            $element.tooltip({
                title: options.text,
                placement: options.placement,
                trigger: 'manual',
                html: true,
                constraints: [
                    {
                        to: 'window',
                        attachment: 'together',
                        pin: true
                    }
                ]
            }).tooltip("show");
            that.tooltip_targets.push($element);

            var $tooltip = $('#' + $element.attr('aria-describedby'));
            if (!$tooltip.length) {
                $tooltip = this.$container.find('.tooltip').last();
            }
            $tooltip.addClass('codeplayer-tooltip');
            var $all_tooltips = $('.tooltip.codeplayer-tooltip');
            if ($tooltip.length) {
                $('a', $tooltip).attr('target', '_blank');

                if (options.class) {
                    $tooltip.addClass(options.class);
                }
                that.scrollToTarget($tooltip);

                if (that.fastForward) {
                    options.wait = 0;
                    options.hide = 'same';
                }

                var hideFunc = function () {
                    that.tooltip_targets.splice(_.indexOf(that.tooltip_targets, $element), 1);
                    $element.tooltip("dispose");
                    // This attribute is set by tooltip lib itself and it messes up compilation tooltip texts.
                    $element.removeAttr('data-original-title');
                    if ($element.is('.tooltip-target')) {
                        $element.remove();
                    }
                    else if ($element.attr('data-orig-title')) {
                        $element.attr('title', $element.attr('data-orig-title')).removeAttr('data-orig-title')
                    }

                    if (options.hideOthers) {
                        that.hidePopovers();
                    }
                };

                if (options.hide != 'none') {
                    that.cleanupFunc.push(hideFunc);
                }

                if (_.isNumber(options.wait)) {
                    that.timer(function () {
                        if (options.hide == 'same') {
                            hideFunc();
                        }
                        next();
                    }, options.wait);
                }

                // We should launch next event on clicking any visible popover.
                $all_tooltips.off('click').click(function (e) {
                    if (e.target.tagName == 'A') {
                        return true;
                    }
                    $all_tooltips.off('click');
                    if (options.hide == 'click' || (options.wait == 'click' && options.hide == 'same')) {
                        hideFunc();
                    }
                    if (options.wait == 'click') {
                        next();
                    }
                });
            }
            else {
                next();
            }
        }
    };
    pl.prototype.availableActions.popover.init = function () {
        this.tooltip_targets = [];
    };
    pl.prototype.availableActions.popover.reversable = true;
    pl.prototype.availableActions.popover.saveState = function (action) {
        var popovers = [];
        this.tooltip_targets.forEach(function ($element) {
            popovers.push({
                target: $element.is('.tooltip-target') ? $element.clone() : $element,
                tooltip: $element.data('bs.tooltip').options
            });
        });
        action.state.popovers = popovers;
    };
    pl.prototype.availableActions.popover.revertState = function (action) {
        this.hidePopovers();
        if (action.state.popovers) {
            action.state.popovers.forEach(function (obj) {
                $element = obj.target;
                if ($element.is('.tooltip-target')) {
                    this.$container.append($element);
                }
                this.tooltip_targets.push(obj.target);
                $element.tooltip(obj.tooltip).tooltip("show");
            });
        }
    };

    /**
     * Hide all existing popovers.
     */
    pl.prototype.availableActions.hidePopovers = function (options, next) {
        var that = this;

        next = next || _.bind(that.next, that);
        options = _.extend({
            wait: 100
        }, options || {});

        that.hidePopovers();
        that.timer(next, options.wait);
    };

    pl.prototype.hidePopovers = function () {
        var $element;
        for (var i = this.tooltip_targets.length - 1; i >= 0; i--) {
            $element = this.tooltip_targets[i];
            this.tooltip_targets.splice(i, 1);
            $element.tooltip("dispose");
            // This attribute is set by tooltip lib itself and it messes up compilation tooltip texts.
            $element.removeAttr('data-original-title');
            if ($element.is('.tooltip-target')) {
                $element.remove();
            }
            else if ($element.attr('data-orig-title')) {
                $element.attr('title', $element.attr('data-orig-title')).removeAttr('data-orig-title')
            }
        }
    }
}));