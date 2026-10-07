// Editor snippets in TextMate syntax (${1:placeholder}, $0): one list for the VS Code extension and the TextMate bundle.
export const SNIPPETS = [
  { name: "let", prefix: "let", description: "Variable", body: "let ${1:name} = ${2:expression}" },
  { name: "def", prefix: "def", description: "Function declaration", body: "def ${1:name}(${2:arg})\n  ${0:expression}" },
  { name: "if", prefix: "if", description: "Conditional", body: "if (${1:condition}) ${2:then} else ${0:otherwise}" },
  { name: "for", prefix: "for", description: "Transform an array", body: "[for (${1:.items}) ${0:.}]" },
  { name: "forobj", prefix: "forobj", description: "Transform an object", body: "{for (${1:.object}) ${2:.key} : ${0:.value}}" },
  { name: "import", prefix: "import", description: "Import a module", body: 'import "${1:lib.jslt}" as ${0:lib}' },
  { name: "object", prefix: "obj", description: "Object that copies the other keys", body: '{\n  "${1:key}": ${2:.value},\n  * : .\n}' },
  { name: "fallback", prefix: "fallback", description: "First non-null value", body: 'fallback(${1:.a}, ${0:"default"})' },
];
