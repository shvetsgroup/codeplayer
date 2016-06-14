CodePlayer is a javascript library which allows playing educational code scenarios in the web browser. Scenarios look
and feel like videos except that everything is executed over real web editor with a real code.

A picture is worth a thousand words, so [try the demo](http://shvetsgroup.github.io/codeplayer/demo/).

## Scenarios

Scenario is a set of actions such as typing, text selection, moving cursor, tooltips and others. Actions are either
auto-played or triggered by user.

By the way, scenarios and interface can be translated and played in other languages.

Scenario is a JSON file with a list of actions. You could craft scenarios by hands, but that quickly becomes too tedious
job for a non-trivial scenario. That's why I've created an editor, to streamline the scenarios production.

[CodePlayer.tv](http://shvetsgroup.github.io/codeplayer.tv/)

## Usage

### Requirements

CodePlayer has a decent list of requirements. Here they are:

- CodeMirror (the backbone of the plugin)
- jQuery
- Underscore
- Twitter Boostrap 3 (CodePlayer relies on its styling by default. The tooltips also won't work without it.)
- FontAwesome (Used to insert icons into player controls)

### Inside HTML code

1. Download the plugin and include the required css and js files into the html page (see demo page source for example).
2. Here's the code you need to display a player on a page:
```javascript
<div id="codeplayer"></div>
<script>
    var div = document.getElementById('codeplayer');
    var scenario = { ... } // Scenario JSON file.
    var options = { ... } // CodePlayer options + all standard CodeMirror options.
    CodeMirror.player.create(div, scenario, options);
</script>
```

### Options

**locale** : string _(default: 'en')_

If your scenario is multilingual, this parameter will pick the language. Note that local can not be changed during
playback, so you will need to re-render a player instance.

**translation** : object _(default: empty)_

Here you can pass a simple JSON object to override standard controls captions and titles. Example:

```json
{
    "Play": "Начать",
    "Replay": "Начать заново",
    "Next": "Вперед",
    "Back": "Назад",
    "Stop": "Стоп",
    "Click on these blue things to continue.": "Кликайте на эти синие штуки для продолжения.",
    "Show difference": "Показать разницу",
    "Compile and test": "Компиляция и тестирование"
}
```

**merge** : boolean _(default: false)_

Whether or not show the diff viewer after scenario is finished. This option requires [Merge addon for Codemirror](https://codemirror.net/demo/merge.html).

## Acknowledgment

This library was created for [www.refactoring.guru](http://refactoring.guru) by @neochief.

If you need a similar library, but simpler, take a look at [CodeMirror Movie](http://emmet.io/blog/codemirror-movie/).