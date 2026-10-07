import { test } from "node:test";
import assert from "node:assert/strict";
import { scan, candidates, wordInfo } from "../src/core/scan.js";
import { formatJslt } from "../src/core/format.js";

test("scan finds lets, defs with params and imports; ignores strings and comments", () => {
  const s = scan('import "lib.jslt" as lib\nlet a = 1\n// let hidden = 2\ndef f(x, y) $x\n"let nope = 3"');
  assert.deepEqual([...s.vars].sort(), ["a", "x", "y"]);
  assert.deepEqual(s.funcs.get("f"), ["x", "y"]);
  assert.equal(s.imports.get("lib"), "lib.jslt");
});

test("candidates: builtins, variables, import aliases, none inside strings", () => {
  const text = 'import "lib.jslt" as lib\nlet total = 1\ndef f(x) $x';
  const files = new Map([["lib.jslt", "def fmt-name(p) $p\ndef other() 1"]]);
  const names = (r) => r.options.map((o) => o.label);
  assert.ok(names(candidates("  upp", text, files)).includes("uppercase"));
  assert.deepEqual(names(candidates("x: $to", text, files)).sort(), ["total", "x"]);
  const lib = candidates("  lib:fm", text, files);
  assert.deepEqual(names(lib), ["fmt-name", "other"]);
  assert.equal(lib.from, "  lib:".length);
  assert.equal(candidates('"upp', text, files), null);
  assert.equal(candidates("// upp", text, files), null);
  assert.equal(candidates("  now", text, files).options.find((o) => o.label === "now").apply, "now()");
});

test("wordInfo: builtin and local def hover, not plain words", () => {
  assert.equal(wordInfo("  uppercase(.a)", 4, "").sig, "uppercase(string)");
  assert.equal(wordInfo("  f(.a)", 2, "def f(x) $x").sig, "def f(x)");
  assert.equal(wordInfo("  .uppercase", 5, ""), null);
  assert.equal(wordInfo("  money(1)", 4, ""), null);
});

test("formatJslt re-indents inside brackets, keeps top-level continuations, is idempotent", () => {
  const src = 'def f(x)\n    if ($x)  "a"\n    else "b"\n\n{\n"a": 1,   \n      "b": [\n1,\n2\n  ],\n    "c": {\n"d": 1\n}\n}';
  const out = formatJslt(src);
  assert.equal(out, 'def f(x)\n    if ($x)  "a"\n    else "b"\n\n{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ],\n  "c": {\n    "d": 1\n  }\n}\n');
  assert.equal(formatJslt(out), out);
  assert.equal(formatJslt('{"a": "}"}'), '{"a": "}"}\n');
});


import { tokenRange, tokenLength } from "../src/core/errors.js";

test("tokenRange covers a whole string, a word or one char, and rejects missing lines", () => {
  const t = '{\n  "key": value-1 }';
  assert.deepEqual(tokenRange(t, 2, 3), { from: 4, to: 9 });
  assert.equal(t.slice(...Object.values(tokenRange(t, 2, 10))), "value-1");
  assert.equal(t.slice(...Object.values(tokenRange(t, 2, 18))), "}");
  assert.equal(tokenRange(t, 5, 1), null);
  assert.equal(tokenLength(""), 0);
});

import { EditorState } from "@codemirror/state";
import { jsltLanguage } from "../src/cm/lang.js";
import { jsltAssist } from "../src/cm/assist.js";

// what the completion source answers when the user has just typed `doc` (cursor at the end)
const completeAfterTyping = (doc) => {
  const files = new Map([["lib.jslt", "def foo(a) $a\ndef bar(a) $a"]]);
  const state = EditorState.create({ doc, extensions: [jsltLanguage, jsltAssist(() => ({ files }))] });
  const source = state.languageDataAt("autocomplete", doc.length)[0];
  return source({ state, pos: doc.length, explicit: false });
};

test("completion opens right after ':' or '$', before any letter is typed", () => {
  const afterColon = completeAfterTyping('import "lib.jslt" as c\nlet t = c:');
  assert.deepEqual(afterColon && afterColon.options.map((o) => o.label).sort(), ["bar", "foo"]);
  const afterDollar = completeAfterTyping("let x = 1\nlet t = $");
  assert.ok(afterDollar && afterDollar.options.some((o) => o.label === "x"));
});

test("completion stays quiet where nothing was typed and no trigger character precedes", () => {
  assert.equal(completeAfterTyping("let t = "), null);
  assert.equal(completeAfterTyping("let t = (1 + "), null);
});

import { usableInput } from "../src/core/scan.js";
import { toDiagnostic } from "../src/cm/lint.js";

// ---- `.` field completion
const sample = {
  header: { event_type: ["x"] },
  message: { booking: { id: 1, "tariff segments": [{ seg: 1 }] }, items: [{ sku: "a", qty: 1 }, { sku: "b", note: "n" }] },
};
const complete = (before, upto = before, text = upto, input = sample) => candidates(before, text, new Map(), { input, upto });
const labels = (r) => r.options.map((o) => o.label);

test("a bare '.' offers the root keys first, then every other key in the input", () => {
  const l = labels(complete("."));
  assert.deepEqual(l.slice(0, 2), ["header", "message"]);
  assert.ok(l.includes("sku") && l.includes("booking"));
  assert.equal(new Set(l).size, l.length);
});

test("'.a.b.' walks the path; array elements contribute the keys of their first 20 items", () => {
  assert.deepEqual(labels(complete(".message.")).slice(0, 2), ["booking", "items"]);
  assert.deepEqual(labels(complete(".message.items[0].")).slice(0, 2), ["sku", "qty"]);
  assert.notEqual(labels(complete(".message.items[0]."))[2], "note"); // [0] is one element; "note" only exists on the second
  assert.deepEqual(labels(complete(".message.items[].")).slice(0, 3), ["sku", "qty", "note"]);
});

test("'$var.' follows 'let var = <path>'", () => {
  const doc = "let m = .message\nlet x = $m.";
  assert.deepEqual(labels(complete("let x = $m.", doc)).slice(0, 2), ["booking", "items"]);
});

test("inside [for (<path>) ...] a bare '.' is the loop element", () => {
  const line = "let r = [for (.message.items) .";
  assert.deepEqual(labels(complete(line)).slice(0, 3), ["sku", "qty", "note"]);
  const header = "let r = [for (.message.";
  assert.deepEqual(labels(complete(header)).slice(0, 2), ["booking", "items"]);
});

test("keys that are not plain words are offered quoted; a typed prefix is kept as the start", () => {
  const seg = complete(".message.booking.").options.find((o) => o.label === "tariff segments");
  assert.equal(seg.apply, '"tariff segments"');
  const r = complete(".message.it");
  assert.equal(r.from, ".message.".length);
});

test("an unresolvable context still offers every key; numbers, '..' and strings do not trigger it", () => {
  assert.ok(labels(complete("let n = size(.).")).includes("sku"));
  assert.equal(complete("let x = 1."), null);
  assert.equal(complete("let x = .."), null);
  assert.equal(complete('let x = "a.'), null);
});

test("without input there is no '.' completion", () => {
  assert.equal(complete(".", ".", ".", null), null);
});

test("usableInput: only a non-empty object or array enables it", () => {
  assert.equal(usableInput(sample), sample);
  assert.deepEqual(usableInput([{ a: 1 }]), [{ a: 1 }]);
  for (const bad of [null, undefined, {}, [], "{\"a\":1}", 3, true]) assert.equal(usableInput(bad), null);
});

// ---- error placement
test("'expected … after …' underlines the token before the line the parser failed on", () => {
  const doc = EditorState.create({ doc: "let a = 1\nlet b = .\nlet c = 2" }).doc;
  const err = { getLine: () => 3, getColumn: () => 1, getMessageWithoutLocation: () => "Parse error: expected a field name after '.'" };
  const d = toDiagnostic(err, doc);
  assert.equal(doc.sliceString(d.from, d.to), ".");
  const other = { ...err, getMessageWithoutLocation: () => "Parse error: unexpected token 'let'" };
  assert.equal(doc.sliceString(toDiagnostic(other, doc).from, toDiagnostic(other, doc).to), "let");
});

test("the editor source opens the popup right after '.' once an input is set, and not after '1.'", () => {
  const files = new Map();
  const source = (doc, input) => {
    const state = EditorState.create({ doc, extensions: [jsltLanguage, jsltAssist(() => ({ files, input }))] });
    return state.languageDataAt("autocomplete", doc.length)[0]({ state, pos: doc.length, explicit: false });
  };
  assert.deepEqual(source("let t = .", sample).options.slice(0, 2).map((o) => o.label), ["header", "message"]);
  assert.equal(source("let t = .", null), null);
  assert.equal(source("let t = 1.", sample), null);
});

test("tokenRange takes the error message: unfinished constructs point at the token above", () => {
  const text = "let a = 1\n// note\nlet b = .\n\nlet c = 2";
  const at = (line, col, msg) => { const r = tokenRange(text, line, col, msg); return r && text.slice(r.from, r.to); };
  assert.equal(at(5, 1, "Parse error: expected a field name after '.'"), ".");
  assert.equal(at(5, 1, "Parse error: unexpected token"), "let");
  assert.equal(at(3, 9, "expected a name after '.'"), ".");   // the failing token is on the same line: unchanged rule applies, token at col 9
});
