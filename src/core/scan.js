import { FUNCTION_DOCS, KEYWORDS, CONSTANTS } from "./docs.js";

const blank = (s) => s.replace(/\/\/[^\n]*|"(?:\\.|[^"\\\n])*"/g, (m) => m.replace(/[^\n]/g, " "));

// Names declared in a source text. ponytail: no scoping, every let/def/param in the file is offered everywhere.
export function scan(text) {
  const code = blank(text);
  const vars = new Set(), funcs = new Map(), imports = new Map(), lets = new Map();
  for (const m of code.matchAll(/\blet\s+([A-Za-z_][\w-]*)\s*=([^\n]*)/g)) { vars.add(m[1]); if (!lets.has(m[1])) lets.set(m[1], m[2].trim()); }
  for (const m of code.matchAll(/\bdef\s+([A-Za-z_][\w-]*)\s*\(([^)]*)\)/g)) {
    const params = m[2].split(",").map((p) => p.trim()).filter(Boolean);
    funcs.set(m[1], params);
    params.forEach((p) => vars.add(p));
  }
  for (const m of text.matchAll(/\bimport\s+"([^"]+)"\s+as\s+([A-Za-z_][\w-]*)/g)) imports.set(m[2], m[1]);
  return { vars, funcs, imports, lets };
}

const inStringOrComment = (line) => {
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === "\\") i++; else if (c === '"') q = false; }
    else if (c === '"') q = true;
    else if (c === "/" && line[i + 1] === "/") return true;
  }
  return q;
};

const fnOption = (name, sig, doc, type = "function") => ({
  label: name, type, detail: sig.slice(name.length), info: doc, apply: sig.endsWith("()") ? name + "()" : name + "(",
});

// ---- `.` field completion against the input JSON the host passed to setInput
// ponytail: no real scoping of lets; a `$var` is resolved from its first `let` against the context at the cursor.

// Only a non-empty object or array switches field completion on.
export const usableInput = (v) => (v && typeof v === "object" && Object.keys(v).length ? v : null);

const SEGMENT = /(\.[\w-]+|\[[^\[\]]*\])$/;

// The path ending `head`: {v: variable name | null, segs, rest: the text before it}.
function chain(head) {
  const segs = [];
  let rest = head, m;
  while ((m = SEGMENT.exec(rest))) { segs.unshift(m[1]); rest = rest.slice(0, m.index); }
  const v = /\$([\w-]+)$/.exec(rest);
  return v ? { v: v[1], segs, rest: rest.slice(0, v.index) } : { v: null, segs, rest };
}

function walk(value, segs) {
  for (const s of segs) {
    if (value === null || typeof value !== "object") return undefined;
    if (s[0] === ".") value = Array.isArray(value) ? undefined : value[s.slice(1)];
    else { const n = /^\[\s*(\d+)\s*\]$/.exec(s); if (!Array.isArray(value)) return undefined; if (n) value = value[+n[1]]; }
  }
  return value;
}

// value of a whole path text such as `.items`, `$b.items[0]`, `.` (context = what a bare `.` means there)
function evalPath(text, context, lets, depth = 0) {
  const c = chain(text.trim());
  if (c.rest.trim() || depth > 5) return undefined;
  if (!c.v) return walk(context, c.segs);
  const rhs = lets.get(c.v);
  return rhs === undefined ? undefined : walk(evalPath(rhs, context, lets, depth + 1), c.segs);
}

// What a bare `.` means at the end of `upto`: the element of the innermost enclosing [for (path) ...] / {for (path) ...}, else the input.
function contextAt(upto, input, lets) {
  const code = blank(upto), stack = [];
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === "(" || c === "[" || c === "{") stack.push({ at: i, header: c === "(" && /[\[{]\s*for\s*$/.test(code.slice(0, i)), loop: null });
    else if (c === ")" || c === "]" || c === "}") {
      const f = stack.pop();
      if (f && f.header && stack.length) stack[stack.length - 1].loop = code.slice(f.at + 1, i);
    }
  }
  let context = input;
  for (const f of stack) {
    if (f.loop === null) continue;
    const v = evalPath(f.loop, context, lets);
    // a loop visits every element: the context is their merge; an object loops over {key, value} entries
    context = Array.isArray(v) ? Object.assign({}, ...v.slice(0, 20).filter((e) => e && typeof e === "object" && !Array.isArray(e))) : v && typeof v === "object" ? { key: "", value: "" } : undefined;
  }
  return context;
}

function keysOf(v) {
  if (Array.isArray(v)) return [...new Set(v.slice(0, 20).flatMap((e) => (e && typeof e === "object" && !Array.isArray(e) ? Object.keys(e) : [])))];
  return v && typeof v === "object" ? Object.keys(v) : [];
}

function allKeys(v, out = new Set(), depth = 0) {
  if (!v || typeof v !== "object" || depth > 12 || out.size >= 500) return out;
  for (const e of Array.isArray(v) ? v.slice(0, 20) : (Object.keys(v).forEach((k) => out.add(k)), Object.values(v))) allKeys(e, out, depth + 1);
  return out;
}

const typeOf = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);
const fieldOption = (key, value, boost) => ({
  label: key, type: "property", detail: value === undefined ? "" : " " + typeOf(value), boost, apply: /^[\w-]+$/.test(key) ? key : JSON.stringify(key),
});

// dotAt = index of the `.` being completed in `before`.
function fieldCandidates(before, dotAt, { input, upto }, lets) {
  const head = before.slice(0, dotAt);
  if (!input || /\.$/.test(head) || /(^|[^\w$-])\d+$/.test(head)) return null; // `..` and `1.` are not field access
  const context = contextAt(upto ?? before, input, lets);
  const c = chain(head);
  let base;
  if (c.v) base = evalPath("$" + c.v, context, lets);
  else if (c.segs.length ? /[\w)\]"'-]$/.test(c.rest) || c.segs[0][0] !== "." : /[\w)\]"'-]$/.test(c.rest)) base = undefined;
  else base = context;
  const scoped = base === undefined ? undefined : walk(base, c.segs);
  const options = [], seen = new Set();
  const valueOf = (k) => (Array.isArray(scoped) ? scoped.find((e) => e && typeof e === "object" && k in e) : scoped)?.[k];
  const add = (k, boost) => { if (!seen.has(k) && options.length < 500) { seen.add(k); options.push(fieldOption(k, boost ? valueOf(k) : undefined, boost)); } };
  keysOf(scoped).forEach((k) => add(k, 10));
  allKeys(input).forEach((k) => add(k, 0));
  return options.length ? { from: dotAt + 1, options } : null;
}

// before = text of the cursor line up to the cursor; files = Map(name -> text);
// ctx = {input, upto}: the parsed input JSON (or null) and the document text up to the cursor.
// Returns {from, options} with `from` an offset into `before`, or null.
export function candidates(before, text, files, ctx = {}) {
  if (inStringOrComment(before)) return null;
  const here = scan(text);
  let m = /\$([\w-]*)$/.exec(before);
  if (m) return { from: m.index + 1, options: [...here.vars].map((v) => ({ label: v, type: "variable" })) };
  m = /([A-Za-z_][\w-]*):([\w-]*)$/.exec(before);
  if (m && here.imports.has(m[1])) {
    const lib = scan(files.get(here.imports.get(m[1])) || "");
    return { from: m.index + m[1].length + 1, options: [...lib.funcs].map(([n, ps]) => fnOption(n, `${n}(${ps.join(", ")})`, "from " + here.imports.get(m[1]))) };
  }
  m = /\.([\w-]*)$/.exec(before);
  if (m) return fieldCandidates(before, m.index, ctx, here.lets);
  m = /[A-Za-z_][\w-]*$/.exec(before);
  if (!m) return null;
  const options = [
    ...Object.entries(FUNCTION_DOCS).map(([n, [sig, doc]]) => fnOption(n, sig, doc)),
    ...[...here.funcs].map(([n, ps]) => fnOption(n, `${n}(${ps.join(", ")})`, "defined in this file")),
    ...[...here.imports.keys()].map((a) => ({ label: a, type: "namespace", detail: " " + here.imports.get(a), apply: a + ":" })),
    ...KEYWORDS.map((k) => ({ label: k, type: "keyword" })),
    ...CONSTANTS.map((k) => ({ label: k, type: "constant" })),
  ];
  return { from: m.index, options };
}

// Hover text for the word at `col` of `line`: {from, to, sig, doc} or null.
export function wordInfo(line, col, text) {
  let a = col, b = col;
  while (a > 0 && /[\w-]/.test(line[a - 1])) a--;
  while (b < line.length && /[\w-]/.test(line[b])) b++;
  const w = line.slice(a, b);
  if (!w || line[a - 1] === "$") return null;
  const d = FUNCTION_DOCS[w];
  if (d && /^\s*\(/.test(line.slice(b))) return { from: a, to: b, sig: d[0], doc: d[1] };
  const ps = scan(text).funcs.get(w);
  return ps && /^\s*\(/.test(line.slice(b)) ? { from: a, to: b, sig: `def ${w}(${ps.join(", ")})`, doc: "defined in this file" } : null;
}
