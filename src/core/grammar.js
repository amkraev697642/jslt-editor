import { FUNCTION_DOCS } from "./docs.js";

const ID = "[A-Za-z_][\\w-]*";
const STR = '"(?:[^"\\\\\\n]|\\\\.)*"';
const BOUNDARY = "(?<![\\w$-])"; // JSLT names may contain "-", so \b alone would split "a-if"
const words = (list) => `${BOUNDARY}(?:${list.join("|")})(?![\\w-])`;

// TextMate grammar for JSLT, generated from the same function list the editor uses (core/docs.js).
// Consumed by the VS Code extension and the TextMate bundle; the build scripts write it out as JSON / plist.
export function textmateGrammar() {
  return {
    name: "JSLT",
    scopeName: "source.jslt",
    fileTypes: ["jslt"],
    patterns: [
      { include: "#comment" }, { include: "#import" }, { include: "#def" }, { include: "#let" },
      { include: "#accessor" }, { include: "#key" }, { include: "#string" }, { include: "#constant" },
      { include: "#keyword" }, { include: "#variable" }, { include: "#call" }, { include: "#number" },
      { include: "#identifier" }, { include: "#operator" }, { include: "#punctuation" },
    ],
    repository: {
      comment: { name: "comment.line.double-slash.jslt", match: "//.*$" },
      escape: { name: "constant.character.escape.jslt", match: "\\\\." },
      string: {
        name: "string.quoted.double.jslt", begin: '"', end: '"',
        beginCaptures: { 0: { name: "punctuation.definition.string.begin.jslt" } },
        endCaptures: { 0: { name: "punctuation.definition.string.end.jslt" } },
        patterns: [{ include: "#escape" }],
      },
      // an object key: a string directly followed by ":"
      key: { match: `(${STR})(\\s*)(:)`, captures: { 1: { name: "support.type.property-name.jslt" }, 3: { name: "punctuation.separator.key-value.jslt" } } },
      // .name and ."quoted name"
      accessor: {
        patterns: [
          { match: `(\\.)(\\s*)(${STR})`, captures: { 1: { name: "punctuation.accessor.jslt" }, 3: { name: "variable.other.property.jslt" } } },
          { match: `(\\.)(${ID})`, captures: { 1: { name: "punctuation.accessor.jslt" }, 2: { name: "variable.other.property.jslt" } } },
        ],
      },
      import: {
        match: `${BOUNDARY}(import)\\s+(${STR})\\s+(as)\\s+(${ID})`,
        captures: { 1: { name: "keyword.other.import.jslt" }, 2: { name: "string.quoted.double.jslt" }, 3: { name: "keyword.other.import.jslt" }, 4: { name: "entity.name.namespace.jslt" } },
      },
      def: {
        match: `${BOUNDARY}(def)\\s+(${ID})\\s*\\(([^)]*)\\)`,
        captures: {
          1: { name: "keyword.other.def.jslt" }, 2: { name: "entity.name.function.jslt" },
          3: { patterns: [{ match: ID, name: "variable.parameter.jslt" }] },
        },
      },
      let: { match: `${BOUNDARY}(let)\\s+(${ID})`, captures: { 1: { name: "keyword.other.let.jslt" }, 2: { name: "variable.other.definition.jslt" } } },
      constant: { name: "constant.language.jslt", match: words(["true", "false", "null"]) },
      keyword: {
        patterns: [
          { name: "keyword.control.jslt", match: words(["if", "else", "for"]) },
          { name: "keyword.operator.logical.jslt", match: words(["and", "or"]) },
        ],
      },
      variable: { name: "variable.other.readwrite.jslt", match: `\\$${ID}` },
      call: {
        patterns: [
          { name: "support.function.builtin.jslt", match: `${BOUNDARY}(?:${Object.keys(FUNCTION_DOCS).join("|")})(?=\\s*\\()` },
          { match: `(${ID})(:)(${ID})(?=\\s*\\()`, captures: { 1: { name: "entity.name.namespace.jslt" }, 2: { name: "punctuation.separator.namespace.jslt" }, 3: { name: "entity.name.function.call.jslt" } } },
          { name: "entity.name.function.call.jslt", match: `${BOUNDARY}${ID}(?=\\s*\\()` },
        ],
      },
      number: { name: "constant.numeric.jslt", match: `${BOUNDARY}-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?(?![\\w-])` },
      // consumes names so that "x-1" is one identifier (as in the JSLT lexer), not "x" and a number
      identifier: { name: "meta.identifier.jslt", match: ID },
      operator: {
        patterns: [
          { name: "keyword.operator.comparison.jslt", match: "==|!=|<=|>=|<|>" },
          { name: "keyword.operator.arithmetic.jslt", match: "[-+*/|]" },
          { name: "keyword.operator.key-value.jslt", match: ":" },
        ],
      },
      punctuation: {
        patterns: [
          { name: "punctuation.separator.comma.jslt", match: "," },
          { name: "meta.brace.jslt", match: "[{}\\[\\]()]" },
        ],
      },
    },
  };
}
