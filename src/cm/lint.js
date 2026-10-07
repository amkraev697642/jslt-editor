import { tokenRange } from "../core/errors.js";

// JsltException (1-based line/column, point only) → CodeMirror diagnostic spanning the token at that point.
export function toDiagnostic(err, doc) {
  const line = typeof err.getLine === "function" ? err.getLine() : -1;
  const msg = typeof err.getMessageWithoutLocation === "function" ? err.getMessageWithoutLocation() : err.message;
  if (line < 1 || line > doc.lines) return { from: 0, to: Math.min(1, doc.length), severity: "error", message: msg };
  const r = tokenRange(doc.toString(), line, err.getColumn(), msg);
  const from = r ? r.from : Math.min(doc.line(line).from + Math.max(err.getColumn() - 1, 0), doc.line(line).to);
  return { from, to: r ? r.to : from + 1, severity: "error", message: msg };
}
