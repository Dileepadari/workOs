#!/usr/bin/env node
/**
 * Generates README-light.md from README.md.
 *
 *   node scripts/build-light-readme.mjs
 *
 * GitHub has no theme toggle, so the toggle is a pair of pages that link to
 * each other. They must stay identical apart from the screenshot paths and the
 * toggle line, which is why the light page is generated rather than maintained:
 * edit README.md, run this, commit both. CI regenerates it and fails on a diff.
 *
 * Copy into <repo>/scripts/. The dark-mode `<source>` inside the logo
 * `<picture>` is untouched because it does not use docs/screenshots/.
 *
 * @module docs
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const SRC = path.join(ROOT, "README.md");
const OUT = path.join(ROOT, "README-light.md");

/** Each pair must match at least once, so a renamed marker fails loudly. */
const REQUIRED = [
  [/docs\/screenshots\/dark\//g, "docs/screenshots/light/"],
  [
    '<p><b>Dark mode</b> &middot; <a href="./README-light.md">View this page in light mode</a></p>',
    '<p><b>Light mode</b> &middot; <a href="./README.md">View this page in dark mode</a></p>',
  ],
];

const HEADER =
  "<!-- Generated from README.md by scripts/build-light-readme.mjs. Do not edit by hand. -->\n\n";

let out = fs.readFileSync(SRC, "utf8");
for (const [from, to] of REQUIRED) {
  const before = out;
  out = out.replaceAll(from, to);
  if (before === out) {
    console.error(`README.md is missing the expected marker: ${from}`);
    process.exit(1);
  }
}

fs.writeFileSync(OUT, HEADER + out);
console.log(`Wrote ${path.relative(ROOT, OUT)} from ${path.relative(ROOT, SRC)}`);
