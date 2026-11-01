// Guards the committed Inter subsets (app/renderer/fonts) against drift.
// Plain node:test, no font tools: run with `node --test app/tests/fonts-manifest.mjs`.
// When this fails, rerun app/build/fonts/subset-inter.py (see renderer/fonts/README.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.dirname(app);
const fonts = path.join(app, "renderer", "fonts");
const manifest = JSON.parse(readFileSync(path.join(fonts, "manifest.json"), "utf8"));
const RERUN = "rerun app/build/fonts/subset-inter.py";

// Same sources the script scans for UI text.
const UI_SOURCES = [
  ["app/renderer", /^index\.html$/],
  ["app/renderer/src", /\.(m?js)$/],
  ["scripts/lib", /^(lockfile|usage-stats|discover)\.mjs$/],
];
const uiFiles = UI_SOURCES.flatMap(([dir, re]) =>
  readdirSync(path.join(repo, dir)).filter((f) => re.test(f)).map((f) => path.join(repo, dir, f)));
const styleSources = [path.join(app, "renderer/src/styles.mjs"), path.join(app, "renderer/base.css")];

test("every non-ASCII UI character is in a subset (or known to be missing from Inter)", () => {
  for (const [name, f] of Object.entries(manifest.files)) assert.ok(f.codepoints.length, `${name} is empty`);
  for (const style of ["normal", "italic"]) {
    const covered = new Set(Object.values(manifest.files).filter((f) => f.style === style).flatMap((f) => f.codepoints));
    const lacking = new Set(manifest.uiLacking[style]);
    for (const file of uiFiles) {
      for (const ch of new Set(readFileSync(file, "utf8"))) {
        const cp = ch.codePointAt(0);
        if (cp <= 0x7e || covered.has(cp) || lacking.has(cp)) continue;
        assert.fail(`${path.relative(repo, file)} uses ${ch} (U+${cp.toString(16).toUpperCase()}), not in the ${style} subsets: ${RERUN}`);
      }
    }
  }
});

test("font weights stay inside the subset's wght range", () => {
  const [lo, hi] = manifest.axes.wght;
  for (const file of styleSources) {
    const css = readFileSync(file, "utf8");
    for (const m of css.matchAll(/font-?weight:\s*"?(\d+|lighter|bolder|bold|normal)"?/gi)) {
      const w = { normal: 400, bold: 700 }[m[1]] ?? Number(m[1]);
      assert.ok(!Number.isNaN(w), `${path.basename(file)}: relative weight "${m[1]}" — check it stays in ${lo}-${hi}, then update this test`);
      assert.ok(w >= lo && w <= hi, `${path.basename(file)} uses font-weight ${w}, outside ${lo}-${hi}: ${RERUN} with a wider AXIS_LIMITS`);
    }
  }
});

test("no OpenType feature is turned on that the subsets dropped", () => {
  for (const file of styleSources) {
    const css = readFileSync(file, "utf8");
    const bad = css.match(/font-?feature-?settings|font-?variation-?settings|font-?variant(?!-?numeric)[-A-Za-z]*\s*:/i);
    assert.equal(bad, null, `${path.basename(file)} sets ${bad?.[0]}: check the feature is in FEATURES (${manifest.features.join(" ")}) and ${RERUN}`);
    for (const m of css.matchAll(/font-?variant-?numeric:\s*"?([^",;}]+)/gi)) {
      assert.equal(m[1].trim(), "tabular-nums", `${path.basename(file)}: font-variant-numeric ${m[1]} needs its feature kept: ${RERUN}`);
    }
  }
});

test("inter.css, preloads and files match the manifest", () => {
  const css = readFileSync(path.join(fonts, "inter.css"), "utf8");
  const html = readFileSync(path.join(app, "renderer/index.html"), "utf8");
  const woff2 = readdirSync(fonts).filter((f) => f.endsWith(".woff2")).sort();
  assert.deepEqual(woff2, Object.keys(manifest.files).sort(), `fonts folder and manifest disagree: ${RERUN}`);
  for (const [name, f] of Object.entries(manifest.files)) {
    assert.equal(statSync(path.join(fonts, name)).size, f.bytes, `${name} was changed by hand: ${RERUN}`);
    assert.ok(css.includes(`url("${name}")`) && css.includes(`unicode-range: ${f.unicodeRange};`), `inter.css is out of date for ${name}: ${RERUN}`);
    const preloaded = html.includes(`href="fonts/${name}"`);
    assert.equal(preloaded, f.part === "core", `${name} should ${f.part === "core" ? "" : "not "}be preloaded in index.html`);
  }
});
