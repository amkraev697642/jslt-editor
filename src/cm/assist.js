import { hoverTooltip } from "@codemirror/view";
import { jsltLanguage } from "./lang.js";
import { candidates, wordInfo } from "../core/scan.js";

// getCtx() -> {files: Map(name -> text), input?: the parsed input JSON for `.` completion}
export function jsltAssist(getCtx) {
  return [
    jsltLanguage.data.of({
      autocomplete(cx) {
        const line = cx.state.doc.lineAt(cx.pos);
        const ctx = getCtx();
        const r = candidates(line.text.slice(0, cx.pos - line.from), cx.state.doc.toString(), ctx.files, { input: ctx.input, upto: cx.state.doc.sliceString(0, cx.pos) });
        // an empty prefix opens the popup only right after `:` (alias functions), `$` (variables) or `.` (fields)
        if (!r || (!cx.explicit && cx.pos - line.from - r.from < 1 && !/[:$.]/.test(line.text[r.from - 1] || ""))) return null;
        return { from: line.from + r.from, options: r.options, validFor: /^[\w-]*$/ };
      },
    }),
    hoverTooltip((view, pos) => {
      const line = view.state.doc.lineAt(pos);
      const w = wordInfo(line.text, pos - line.from, view.state.doc.toString());
      if (!w) return null;
      return {
        pos: line.from + w.from, end: line.from + w.to, above: true,
        create() {
          const dom = document.createElement("div");
          dom.className = "jslt-tip";
          dom.innerHTML = "<code></code><div></div>";
          dom.firstChild.textContent = w.sig;
          dom.lastChild.textContent = w.doc;
          return { dom };
        },
      };
    }),
  ];
}
