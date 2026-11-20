// Writes the coverage-ranges.jslt that jslt-js ships as a JS string module, so Node (tests) and esbuild (bundles) read it the same way.
import { readFileSync, writeFileSync } from "node:fs";

const text = readFileSync(new URL("../node_modules/jslt-js/examples/coverage-ranges.jslt", import.meta.url), "utf8");
writeFileSync(new URL("../src/core/coverage-ranges-jslt.js", import.meta.url), `export default ${JSON.stringify(text)};\n`);
