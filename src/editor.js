// The ready-made editor (jslt-editor, and the single-file jslt-editor/standalone): CodeMirror, JSON and XML modes and a theme are included,
// so a page needs one <script> and no bundler. Exposes globalThis.JsltEditor.
import { basicSetup, EditorView } from "codemirror";
import { Compartment, EditorState, Prec, StateEffect, StateField } from "@codemirror/state";
import { Decoration, keymap } from "@codemirror/view";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { linter, setDiagnostics } from "@codemirror/lint";
import { usableInput } from "./core/scan.js";
import { oneDark } from "@codemirror/theme-one-dark";
import { jsltLanguage, jsltHighlight, jsltAssist, toDiagnostic, jsonSyntaxErrors } from "./cm/index.js";
import { formatJslt } from "./core/format.js";
import { tokenRange } from "./core/errors.js";
import { coveragePoints, coverageRanges, coverageSummary } from "./core/coverage.js";

export { formatJslt, toDiagnostic, tokenRange, coveragePoints, coverageRanges, coverageSummary };
export { FUNCTION_DOCS } from "./core/docs.js";

// A layer of mark decorations replaced as a whole by its effect and mapped through edits; decorate(range) -> Decoration.mark
const markLayer = (decorate) => {
  const effect = StateEffect.define();
  const field = StateField.define({
    create: () => Decoration.none,
    update(set, tr) {
      set = set.map(tr.changes);
      for (const e of tr.effects) if (e.is(effect)) set = Decoration.set(e.value.map((r) => decorate(r).range(r.from, r.to)), true);
      return set;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
  return { effect, field };
};

// Highlighted ranges (search hits and the like): setMarks([{from, to, cls?}]), cls defaults to "find-hit".
const { effect: marksEffect, field: marksField } = markLayer((r) => Decoration.mark({ class: r.cls || "find-hit" }));

// Coverage ranges from coverageRanges(): setCoverage(points); a layer of its own so it and setMarks do not replace each other.
const { effect: coverageEffect, field: coverageField } = markLayer((r) => Decoration.mark({ class: r.cls, attributes: { title: r.title } }));
const coverageTheme = EditorView.baseTheme({
  ".cov-hit": { backgroundColor: "#c8e6c9" },
  ".cov-miss": { backgroundColor: "#ffcdd2" },
  ".cov-part": { backgroundColor: "#fff59d" },
  "&dark .cov-hit": { backgroundColor: "#1b5e20" },
  "&dark .cov-miss": { backgroundColor: "#8e2420" },
  "&dark .cov-part": { backgroundColor: "#7a6b00" },
});

// language: "jslt" | "json" | "xml" | "text". getFiles() -> Map(name -> text) for import completion.
// swallowKeys: keys (e.g. "Mod-Enter", "Mod-f") the editor must not act on, so the host page can; they still bubble up.
// One editor can show many documents: newState() builds a per-document state (own undo history, selection) and
// setState() swaps it in, the usual CodeMirror pattern for tabs.
export function createEditor({ parent, doc = "", language = "text", readOnly = false, dark = false, onChange, getFiles = () => new Map(), swallowKeys = [] }) {
  const theme = new Compartment(), lang = new Compartment(), access = new Compartment();
  let input = null; // the parsed input JSON, for `.` completion (see setInput)
  let evaluate = null; // host JSLT engine, for completion past function calls (see setEvaluator)
  const modes = {
    jslt: () => [jsltLanguage, jsltHighlight, jsltAssist(() => ({ files: getFiles(), input, evaluate }))],
    json: () => [json(), linter(jsonSyntaxErrors)],
    xml: () => xml(),
    text: () => [],
  };
  const accessExt = (ro) => [EditorState.readOnly.of(ro), EditorView.editable.of(!ro)];
  const newState = (o = {}) => EditorState.create({
    doc: o.doc ?? "",
    extensions: [
      Prec.highest(keymap.of(swallowKeys.map((key) => ({ key, run: () => true })))),
      basicSetup,
      marksField,
      coverageField,
      coverageTheme,
      theme.of(state.dark ? oneDark : []),
      lang.of(modes[o.language || "text"]()),
      access.of(accessExt(!!o.readOnly)),
      EditorView.updateListener.of((u) => { if (u.docChanged && onChange) onChange(u.state.doc.toString(), u); }),
    ],
  });
  const state = { dark };
  const view = new EditorView({ parent, state: newState({ doc, language, readOnly }) });
  const api = {
    view,
    getText: () => view.state.doc.toString(),
    setText: (text) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }),
    newState,
    getState: () => view.state,
    setState: (s) => view.setState(s),
    setLanguage: (name) => view.dispatch({ effects: lang.reconfigure(modes[name]()) }),
    setReadOnly: (ro) => view.dispatch({ effects: access.reconfigure(accessExt(ro)) }),
    setDark(on) {
      state.dark = on;
      view.dispatch({ effects: theme.reconfigure(on ? oneDark : []) });
    },
    // The input JSON the transform runs on, already parsed (never text), for `.` completion. Returns whether completion is on:
    // false (and off) for null, undefined, an empty object/array or anything that is not an object or array.
    setInput(value) { input = usableInput(value); return input !== null; },
    // fn(program, input) -> the plain JS value of running `program` (the file's leading import/let/def statements plus one expression)
    // on `input`, or undefined; it may throw. Lets `.` completion follow `$var`s and calls such as `c:booking(.).`. null turns it off.
    setEvaluator(fn) { evaluate = typeof fn === "function" ? fn : null; },
    // errors: JsltException or [{from, to, message, severity?}]; pass null/[] to clear
    setErrors(errors) {
      const list = !errors ? [] : Array.isArray(errors) ? errors : [toDiagnostic(errors, view.state.doc)];
      view.dispatch(setDiagnostics(view.state, list.map((d) => ({ severity: "error", ...d }))));
    },
    setMarks: (list) => view.dispatch({ effects: marksEffect.of(list) }),
    // a coverage dump or points (see coveragePoints) of the text now in the editor, of the dump's source when given -> green/yellow/red ranges with a hover summary; null clears. Returns the summary line.
    setCoverage(coverage, source) {
      const points = coverage ? coveragePoints(coverage, source) : null;
      view.dispatch({ effects: coverageEffect.of(points ? coverageRanges(view.state.doc.toString(), points, source) : []) });
      return points ? coverageSummary(points) : "";
    },
    // 1-based line/column -> {from, to} of the token there
    // (an "expected … after …" message moves the range to the last token above, where the construct was left unfinished)
    rangeAt: (line, col, message) => tokenRange(view.state.doc.toString(), line, col, message),
    getSelection: () => ({ from: view.state.selection.main.from, to: view.state.selection.main.to }),
    getScroll: () => view.scrollDOM.scrollTop,
    setScroll: (top) => { view.scrollDOM.scrollTop = top; },
    format() {
      const text = view.state.doc.toString(), out = formatJslt(text);
      if (out !== text) api.setText(out);
    },
    // Scrolls pos into view without moving the selection or focus.
    scrollTo: (pos) => view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: "center" }) }),
    reveal(from, to = from) {
      view.dispatch({ selection: { anchor: from, head: to }, effects: EditorView.scrollIntoView(from, { y: "center" }) });
      view.focus();
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
  return api;
}
