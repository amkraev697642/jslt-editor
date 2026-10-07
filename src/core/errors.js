// Length of the token at the start of `rest`: a whole string literal, a word (with - and $), or one character.
export function tokenLength(rest) {
  const m = /^"(?:\\.|[^"\\\n])*"|^[\w$-]+|^[^\n]/.exec(rest);
  return m ? m[0].length : 0;
}

// "expected X after Y" is reported on the first token of a later line when the construct is unfinished above it.
const UNFINISHED = /\bexpected\b.*\bafter\b/;

// 1-based line/column -> {from, to} covering the token there, or null when the line does not exist.
// With the error message, an "expected … after …" error that starts its line points at the last token above instead.
export function tokenRange(text, line, col, message = "") {
  let start = 0;
  for (let i = 1; i < line; i++) {
    start = text.indexOf("\n", start) + 1;
    if (!start) return null;
  }
  const from = start + Math.max(col - 1, 0);
  if (UNFINISHED.test(message) && !text.slice(start, from).trim()) {
    const above = text.slice(0, start).split("\n");
    above.pop();
    let off = start;
    for (let n = above.length - 1; n >= 0; n--) {
      off -= above[n].length + 1;
      const t = above[n].trimEnd();
      if (!t || t.trimStart().startsWith("//")) continue;
      const last = /"(?:\\.|[^"\\\n])*"$|[\w$-]+$|\S$/.exec(t)[0];
      return { from: off + t.length - last.length, to: off + t.length };
    }
  }
  const len = tokenLength(text.slice(from));
  return len ? { from, to: from + len } : null;
}
