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

`createEditor` returns `{ view, getText, setText, setLanguage, setReadOnly, setDark, setErrors, setMarks, format, reveal,
scrollTo, rangeAt, getSelection, setInput, newState / setState (one editor, many documents) , focus, destroy }`.
`getFiles: () => Map(name -> text)` lets completion see `import "name" as alias` files.

`editor.setInput(value)` switches on `.` field completion: pass the **parsed** input JSON the transform runs on (never text, and not a
half-edited state). It returns `true` for a non-empty object or array; `null`, `undefined`, an empty object/array or any other value
turns the completion off and returns `false`. The editor works out what a `.` refers to: the root, `.a.b.`, `.a[0].`, `$var.` (from
`let var = <path>`) and the element of an enclosing `[for (<path>) ...]`; keys of that context come first, every other key of the input after them.

`editor.setEvaluator(fn)` lets completion follow what keys alone cannot: `$var`s bound to function calls and call results such as
`c:booking(.).`. `fn(program, input)` must return the plain JS value of running `program` (the file's leading `import` / `let` / `def`
statements plus one expression) on `input` (the object from `setInput`), or `undefined`; it may throw. It runs synchronously, at most once
per distinct program and completion, and only for text that does not resolve statically. `.`-relative text inside a `[for ...]` over a
resolved element is not evaluated (the header's `let`s are written against the root `.`). `setEvaluator(null)` turns it off.

## What completes

| You type | Offered | Needs |
|---|---|---|
| a word | built-in functions (with signature and doc), `def`s of the file, import aliases, keywords, `true` / `false` / `null` | nothing |
| `alias:` | functions of the imported file, with their parameters | `getFiles` |
| `$` | the `let` variables and function parameters in the file | nothing |
| `.` | field names, scoped to what the `.` refers to (below) | `setInput` |

Field completion lists the keys of the resolved object first (with the value's type), then every other key of the input. What a `.` refers to:

- the root, or `.a.b.` / `.a[0].` (first element of an array of objects)
- `$var.` where `let var = <path>`
- the element of an enclosing `[for (<path>) ...]`, also nested
- `$var.` bound to a function call, and call results such as `c:booking(.).`: only with `setEvaluator`
- anything still unresolved: the root input

Nothing completes inside strings or comments. Hovering a function call shows its signature and doc (built-ins and `def`s of the file).

## Entry points

| Import | What it is |
|---|---|
| `jslt-editor` | The ready-made editor above (ESM, CodeMirror bundled in). |
| `jslt-editor/standalone` | The same editor as one script that sets `JsltEditor`. |
| `jslt-editor/codemirror` | Only the CodeMirror extensions (`jsltLanguage`, `jsltHighlight`, `jsltAssist`, `toDiagnostic`, `jsonSyntaxErrors`) for apps that already use CodeMirror; `@codemirror/language`, `@codemirror/view` and `@lezer/highlight` are peer dependencies. |
| `jslt-editor/core` | Framework-free logic (function docs, `scan`, `candidates`, `wordInfo`, `formatJslt`, `tokenRange`), usable in Node. |

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
