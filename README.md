# jslt-editor

An embeddable editor for [JSLT](https://github.com/schibsted/jslt), the JSON query and transformation language:

- syntax highlighting
- completion for the built-in functions and your own `let` / `def` / imported functions
- hover docs
- formatting
- error markers for [`jslt-js`](https://www.npmjs.com/package/jslt-js) exceptions

It is built on [CodeMirror 6](https://codemirror.net/), which is included, so there is nothing else to install. Try it in the
[playground](https://amkraev697642.github.io/jslt-playground/).

## Use it

```js
import { createEditor } from "jslt-editor";

const editor = createEditor({
  parent: document.getElementById("editor"),
  language: "jslt",            // "jslt" | "json" | "xml" | "text"
  doc: '{ "name": uppercase(.name) }',
  onChange: (text) => console.log(text),
});

editor.setErrors(someJsltException);   // underlines the token at its line/column
editor.format();
```

Without a bundler, one script tag (pin the version and add an `integrity` hash when loading from a CDN):

```html
<script src="https://cdn.jsdelivr.net/npm/jslt-editor@0.1.0/dist/jslt-editor.standalone.js"></script>
<script>
  JsltEditor.createEditor({ parent: document.body, language: "jslt", doc: ".a" });
</script>
```

`createEditor` returns `{ view, getText, setText, setLanguage, setReadOnly, setDark, setErrors, setMarks, setCoverage, format, reveal,
scrollTo, rangeAt, getSelection, setInput, newState / setState (one editor, many documents) , focus, destroy }`.
`getFiles: () => Map(name -> text)` lets completion see `import "name" as alias` files.

`editor.setInput(value)` switches on `.` field completion: pass the **parsed** input JSON the transform runs on (never text, and not a
half-edited state). It returns `true` for a non-empty object or array; `null`, `undefined`, an empty object/array or any other value
turns the completion off and returns `false`. The editor works out what a `.` refers to: the root, `.a.b.`, `.a[0].`, `$var.` (from
`let var = <path>`) and the element of an enclosing `[for (<path>) ...]`; only the keys of that context are offered.

`editor.setEvaluator(fn)` lets completion follow what keys alone cannot: `$var`s bound to function calls and call results such as
`c:booking(.).`. `fn(program, input)` must return the plain JS value of running `program` (the file's leading `import` / `let` / `def`
statements plus one expression) on `input` (the object from `setInput`), or `undefined`; it may throw. It runs synchronously, at most once
per distinct program and completion, and only for text that does not resolve statically. `.`-relative text inside a `[for ...]` over a
resolved element is not evaluated (the header's `let`s are written against the root `.`). `setEvaluator(null)` turns it off.

## Coverage

`editor.setCoverage(coverage, source?)` paints which parts of the text ran. `coverage` is the dump that `Coverage.toJson()` of the
[jslt](https://github.com/schibsted/jslt) Java library or of [jslt-js](https://www.npmjs.com/package/jslt-js) produces (parsed), or just its
`points`. Each point is `{ source, line, column, endLine, endColumn, kind, outcome, hit }`: lines and columns are 1-based, the end is
inclusive, and `outcome` is `true` or `false` for the two outcomes of a condition (the test of an `if`, a `for` filter, the left of
`and` / `or`) and `null` for an expression. A dump covers a root and its imports, so pass the `source` whose text is in the editor.

```js
const dump = JSON.parse(coverageJson);
const summary = editor.setCoverage(dump, "order.jslt"); // "45 of 55 positions, 3 of 6 branch outcomes covered"
editor.setCoverage(null);                               // clear
```

Green (`cov-hit`) ran, red (`cov-miss`) never ran, yellow (`cov-part`) is a condition that ran only one way. Ranges nest like the
expressions do, and hovering one shows how much of it was covered and what was missed ("2 of 3 positions, 1 of 2 branch outcomes
covered; missed 1:16 LiteralExpression"). The colours are classes you can restyle, with a light and a dark default. Coverage is a layer of
its own, so it does not replace `setMarks`. It follows edits, but is not recomputed: pass new points after a run.

The ranges come from `coverage-ranges.jslt`, an example in plain JSLT that ships with [jslt-js](https://www.npmjs.com/package/jslt-js) and is
used unchanged by the Java library, so every tool shows a dump the same way. jslt-js is bundled into the editor to run it, which adds about
80 KB to the standalone build; `jslt-editor/codemirror` does not include it.

For an imported file, open its text in the editor (`newState` / `setState`) and pass that file's name as `source`, so a root and its
imports are one document each; `dump.imports` says which file imports which. `coveragePoints(coverage, source)`, `coverageRanges(text,
points)` and `coverageSummary(points)` (from `jslt-editor/core`) do the same without an editor.

## What completes

| You type | Offered | Needs |
|---|---|---|
| a word | built-in functions (with signature and doc), `def`s of the file, import aliases, keywords, `true` / `false` / `null` | nothing |
| `alias:` | functions of the imported file, with their parameters | `getFiles` |
| `$` | the `let` variables and function parameters in the file | nothing |
| `.` | field names, scoped to what the `.` refers to (below) | `setInput` |

Field completion lists the keys of the resolved object (with the value's type); a bare `.` gives the first level of the input. What a `.` refers to:

- the root, or `.a.b.` / `.a[0].` (first element of an array of objects)
- `$var.` where `let var = <path>`
- the element of an enclosing `[for (<path>) ...]`, also nested
- `$var.` bound to a function call, and call results such as `c:booking(.).`: only with `setEvaluator`
- anything unresolved: every key found anywhere in the input, so the popup is not empty

Nothing completes inside strings or comments. Hovering a function call shows its signature and doc (built-ins and `def`s of the file).

## Entry points

| Import | What it is |
|---|---|
| `jslt-editor` | The ready-made editor above (ESM, CodeMirror bundled in). |
| `jslt-editor/standalone` | The same editor as one script that sets `JsltEditor`. |
| `jslt-editor/codemirror` | Only the CodeMirror extensions (`jsltLanguage`, `jsltHighlight`, `jsltAssist`, `toDiagnostic`, `jsonSyntaxErrors`) for apps that already use CodeMirror; `@codemirror/language`, `@codemirror/view` and `@lezer/highlight` are peer dependencies. |
| `jslt-editor/core` | Framework-free logic (function docs, `scan`, `candidates`, `wordInfo`, `formatJslt`, `tokenRange`, `coverageRanges`, `coverageSummary`), usable in Node. |

```js
import { EditorView, basicSetup } from "codemirror";
import { jsltLanguage, jsltHighlight, jsltAssist } from "jslt-editor/codemirror";

new EditorView({
  parent: document.body,
  extensions: [basicSetup, jsltLanguage, jsltHighlight, jsltAssist(() => ({ files: new Map() }))],
});
```

Token colours are CSS classes (`tok-c tok-s tok-key tok-n tok-kw tok-v tok-f tok-b tok-a`); style them with your own variables.

## License

Apache-2.0
