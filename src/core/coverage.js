import { compile, readTree, toJS } from "jslt-js";
import rangesJslt from "./coverage-ranges-jslt.js";

// a coverage dump {points, sources?, imports?} (the jslt Coverage toJson) or a plain points array -> the points of one source, all when source is undefined
export function coveragePoints(coverage, source) {
  const points = Array.isArray(coverage) ? coverage : coverage.points;
  return source === undefined ? points : points.filter((p) => String(p.source) === source);
}

let ranges = null; // the shared coverage-ranges.jslt of jslt-js, compiled on first use

// points: {source, line, column, endLine, endColumn, kind, outcome, hit}, 1-based, end inclusive, outcome true/false for a condition else null
// -> [{from, to, cls, title}] outermost first; cls cov-miss (never ran), cov-part (condition ran one way only), cov-hit
export function coverageRanges(text, points, source = String(points[0]?.source ?? null)) {
  ranges ??= compile(rangesJslt, "coverage-ranges.jslt");
  const out = toJS(ranges.applyInput(readTree(JSON.stringify({ source, text, points }))));
  return out.sort((a, b) => a.from - b.from || b.to - a.to);
}

// "45 of 55 positions, 3 of 6 branch outcomes covered" for all the points
export function coverageSummary(points) {
  const n = [0, 0, 0, 0];
  for (const p of points) {
    const base = p.outcome == null ? 0 : 2;
    n[base + 1]++;
    if (p.hit) n[base]++;
  }
  return `${n[0]} of ${n[1]} positions, ${n[2]} of ${n[3]} branch outcomes covered`;
}
