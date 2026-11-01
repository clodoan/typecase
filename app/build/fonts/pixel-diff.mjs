// Pixel-diff the app with the official Inter files (A) against the subset
// files in renderer/fonts (B), and report which font files each view loads.
// Run by hand after app/build/fonts/subset-inter.py:
//
//   .venv/bin/python app/build/fonts/subset-inter.py --baseline /tmp/inter-baseline
//   (cd app && npm run build)
//   xvfb-run -a node app/build/fonts/pixel-diff.mjs /tmp/inter-baseline [out-dir] [subset-dir]   # Linux; plain `node` on macOS
//
// subset-dir defaults to app/renderer/fonts; pass another script output
// (subset-inter.py --split ascii --out DIR) to try a different split.
//
// Both copies render the same fixture skills (code, italics, bold inside
// italics and headings, accented Latin, CJK, scripts outside the subset,
// UI symbols) in the same views, at device scale 1 and 2.

import { _electron as electron } from "@playwright/test";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoDir = path.dirname(appDir);
const [baselineDir, outArg, subsetArg] = process.argv.slice(2);
if (!baselineDir) {
  console.error("usage: node app/build/fonts/pixel-diff.mjs <baseline-fonts-dir> [out-dir]");
  process.exit(2);
}
const out = path.resolve(outArg ?? path.join(tmpdir(), "typecase-font-diff"));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// ---- two app copies that differ only in their fonts ----
function appCopy(name, fontsFrom, { stripPreload }) {
  const dir = path.join(out, `app-${name}`);
  cpSync(appDir, dir, { recursive: true, filter: (src) => !/node_modules|[/\\]dist[/\\]release|test-results/.test(src) });
  symlinkSync(path.join(appDir, "node_modules"), path.join(dir, "node_modules"));
  // main.mjs imports ../scripts/lib; give the copy the same sibling.
  const fonts = path.join(dir, "renderer", "fonts");
  rmSync(fonts, { recursive: true, force: true });
  cpSync(fontsFrom, fonts, { recursive: true });
  if (stripPreload) {
    const html = path.join(dir, "renderer", "index.html");
    writeFileSync(html, readFileSync(html, "utf8").replace(/^\s*<link rel="preload"[^\n]*\n/gm, ""));
  }
  return dir;
}
mkdirSync(path.join(out, "scripts"), { recursive: true });
cpSync(path.join(repoDir, "scripts", "lib"), path.join(out, "scripts", "lib"), { recursive: true });
const A = appCopy("A-official", path.resolve(baselineDir), { stripPreload: true });
const B = appCopy("B-subset", path.resolve(subsetArg ?? path.join(appDir, "renderer", "fonts")), { stripPreload: false });

// ---- fixture content ----
const home = mkdtempSync(path.join(tmpdir(), "typecase-font-home-"));
const DAY = 86_400_000;
function skill(rel, name, description, body) {
  const dir = path.join(home, rel, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`);
}
skill(".claude/skills", "code-and-italics", "Code blocks, *emphasis* and tables — the “typical” skill body…", `# Code and italics

Plain text with *italic words*, **bold words**, ***bold italic***, and *italic with **bold inside** it*.
Arrows -> and <- and => get Inter's contextual forms; so do A-B, (HELLO) and 12:30.
Numbers 0123456789, \`inline code\`, a [link](https://example.com) and "straight" vs “curly” ‘quotes’ – en — em…

## A heading with **bold** and *italic* and ***both***

### Smaller heading *in italics*

| Name | **Bold header** | *Italic header* | Count |
| --- | --- | --- | ---: |
| alpha | *x* **y** | ***z*** | 1,204 |
| beta | ~~strike~~ | \`code\` | 98.6 |

> A quote with *emphasis* and **strength**.

- first item with *italic*
- second item with **bold**
  1. nested ordered
  2. nested *ordered*

\`\`\`bash
git diff main...HEAD   # “mono” stays the system mono font
echo "→ done"
\`\`\`

Soft hyphen: incomprehensi­bilities incomprehensi­bilities incomprehensi­bilities incomprehensi­bilities.`);
skill(".claude/skills", "accents-latin", "Café, naïve, Łódź, Dvořák, Øresund and Ærø — Latin-1 and Latin Extended-A.", `# Accents: Thé, Vá, Tō, Wó

Français : « Où est la crème brûlée ? » — l’œuvre de Molière, déjà vu, naïveté.
Deutsch: Größenwahn, Übermaß, Ärger, Öl, „Anführungszeichen“.
Español: ¿Qué tal? ¡Mañana! El niño comió piña.
Polski: Zażółć gęślą jaźń. Łódź, Kraków, Gdańsk.
Čeština: Příliš žluťoučký kůň úpěl ďábelské ódy.
Magyar: Árvíztűrő tükörfúrógép. Türkçe: ığdır, şişli, Çağrı.
Nordic: Øresund, Ærø, Åland, Þórr, smørrebrød.

*Italic accents: été, Ähre, Łuk, Ŧest, Ŋa* and **bold: ÀÉÎÕÜ àéîõü ĀĒĪŌŪ**.

## Kerning across letters: AVÀ Té Tě Vó Wá Yé Tô Pí Fé LÝ ’T

Symbols: © ® ° ± ² ³ µ ¶ § ¼ ½ ¾ ¿ ¡ ¢ £ ¥ € × ÷ · ¬ ª º`);
skill(".claude/skills", "cjk-mixed", "日本語と中文 mixed with English: system fonts draw the CJK.", `# CJK 混在テキスト

これは日本語の文章です。Inter draws the Latin, the system draws 漢字 and かな.

中文段落：简体中文和繁體中文 mixed with *italic English* and **bold English**.

한국어 문장도 있습니다 — with an em dash and “quotes”.`);
skill(".codex/skills", "outside-subset", "Ελληνικά, Кириллица and Tiếng Việt: outside Latin-1 and Latin Extended-A.", `# Outside the subset

Ελληνικά: Γειά σου κόσμε, αβγδε.
Русский: Съешь же ещё этих мягких французских булок.
Tiếng Việt: Tôi có thể ăn thủy tinh mà không hại gì.`);
skill(".cursor/skills", "symbols-ui", "UI symbols: ⌘ ⌥ ⇧ ↩ → ← ≈ − × ⚠", `# Symbols

Keys ⌘K ⌥ ⇧ ↩; arrows → ←; math ≈ − × ÷ ±; warning ⚠ and 10× · 2d ago.`);
// Usage logs so the Usage section and list column render numbers.
const proj = path.join(home, ".claude/projects/-work");
mkdirSync(proj, { recursive: true });
const iso = (d) => new Date(Date.now() - d * DAY).toISOString();
writeFileSync(path.join(proj, "s1.jsonl"), [
  { type: "attachment", timestamp: iso(3), attachment: { type: "skill_listing", content: "- code-and-italics: x\n- accents-latin: x\n- cjk-mixed: x" } },
  { type: "assistant", timestamp: iso(3), message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "code-and-italics" } }] } },
  { type: "user", timestamp: iso(2), message: { content: "<command-name>/accents-latin</command-name>" } },
].map((r) => JSON.stringify(r)).join("\n"));
// A lock, then a change, so History has a paragraph with curly quotes.
process.env.TYPECASE_HOME = home;
process.env.TYPECASE_SNAPSHOTS = path.join(home, ".cache/typecase/snapshots");
const { discover } = await import(path.join(repoDir, "scripts/lib/discover.mjs"));
const { writeLock } = await import(path.join(repoDir, "scripts/lib/lockfile.mjs"));
writeLock(discover({ cwd: home }), path.join(home, "skills.lock"));
const changed = path.join(home, ".claude/skills/code-and-italics/SKILL.md");
writeFileSync(changed, readFileSync(changed, "utf8") + "\n## Escalation\n\nStop and ask before force-pushing.\n");
const fixed = new Date(Date.now() - 10 * DAY);
utimesSync(changed, fixed, fixed);

// ---- views ----
const openSkill = (name) => async (page) => {
  await page.locator(".skill-row", { hasText: name }).first().click();
  await page.waitForSelector(".md-body h1");
};
const VIEWS = {
  "list": async () => {},
  "list-dark": async (page) => {
    await page.keyboard.press("ControlOrMeta+KeyK");
    await page.locator("#palette-input").fill("dark theme");
    await page.keyboard.press("Enter");
  },
  "palette": async (page) => {
    await page.keyboard.press("ControlOrMeta+KeyK");
    await page.locator("#palette-input").fill("e");
  },
  "unused": async (page) => { await page.locator(".nav-item", { hasText: "Unused" }).click(); },
  "detail-code-and-italics": openSkill("code-and-italics"),
  "detail-accents-latin": openSkill("accents-latin"),
  "detail-cjk-mixed": openSkill("cjk-mixed"),
  "detail-outside-subset": openSkill("outside-subset"),
  "detail-symbols-ui": openSkill("symbols-ui"),
  "source-tab": async (page) => {
    await openSkill("accents-latin")(page);
    await page.locator('#segmented [data-tab="source"]').click();
  },
  "history-tab": async (page) => {
    await openSkill("code-and-italics")(page);
    await page.locator('#segmented [data-tab="history"]').click();
    await page.waitForSelector(".history-entry");
  },
};

let launches = 0;
async function launch(appCopyDir, scale, fixtureHome = home) {
  // A fresh profile per launch, so theme and storage never leak between
  // views or between the two copies.
  const profile = path.join(out, "profiles", String(launches++));
  return electron.launch({
    cwd: appCopyDir,
    args: [appCopyDir, "--no-sandbox", `--force-device-scale-factor=${scale}`, `--user-data-dir=${profile}`],
    env: { ...process.env, TYPECASE_HOME: fixtureHome, TYPECASE_CWD: fixtureHome, CLAUDE_CONFIG_DIR: path.join(fixtureHome, ".claude"), CODEX_HOME: path.join(fixtureHome, ".codex"), TZ: "UTC" },
  });
}

async function shoot(appCopyDir, scale, view, file) {
  const app = await launch(appCopyDir, scale);

  const page = await app.firstWindow();
  const fontRequests = [];
  page.on("request", (r) => { if (r.url().endsWith(".woff2")) fontRequests.push(decodeURIComponent(path.basename(new URL(r.url()).pathname))); });
  // Size the real window (setViewportSize would reset the device scale).
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1180, 1700));
  await page.waitForFunction(() => window.innerHeight === 1700);
  await page.waitForSelector(".skill-row");
  await page.waitForFunction(() => document.querySelector(".r-use")?.textContent !== "");
  await VIEWS[view](page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: file });
  const faces = await page.evaluate(() => [...document.fonts].map((f) => ({ src: f.style + " " + f.unicodeRange.slice(0, 12), status: f.status })));
  await app.close();
  return { fontRequests: [...new Set(fontRequests)].sort(), faces };
}

// Compare in Electron's own canvas so the harness needs no image library.
async function compare(pairs) {
  const app = await launch(B, 1);
  const page = await app.firstWindow();
  const results = [];
  for (const { a, b, diff } of pairs) {
    const r = await page.evaluate(async ([aUrl, bUrl]) => {
      const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
      const [ia, ib] = await Promise.all([load(aUrl), load(bUrl)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return { sizeMismatch: true };
      const w = ia.width, h = ia.height;
      const ctx = (img) => { const c = new OffscreenCanvas(w, h); const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
      const da = ctx(ia), db = ctx(ib);
      const out = new OffscreenCanvas(w, h), ox = out.getContext("2d"), od = ox.createImageData(w, h);
      let n = 0, maxDelta = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let p = 0; p < da.length; p += 4) {
        const d = Math.max(Math.abs(da[p] - db[p]), Math.abs(da[p + 1] - db[p + 1]), Math.abs(da[p + 2] - db[p + 2]));
        const gray = (da[p] + da[p + 1] + da[p + 2]) / 3;
        od.data[p] = od.data[p + 1] = od.data[p + 2] = 255 - (255 - gray) * 0.25;
        od.data[p + 3] = 255;
        if (d > 0) {
          n++; maxDelta = Math.max(maxDelta, d);
          const px = (p / 4) % w, py = Math.floor(p / 4 / w);
          x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
          od.data[p] = 255; od.data[p + 1] = 0; od.data[p + 2] = 0;
        }
      }
      ox.putImageData(od, 0, 0);
      const blob = await out.convertToBlob({ type: "image/png" });
      const bytes = [...new Uint8Array(await blob.arrayBuffer())];
      return { pixels: w * h, diff: n, maxDelta, bbox: n ? [x0, y0, x1, y1] : null, png: n ? bytes : null };
    }, [`file://${a}`, `file://${b}`]);
    if (r.png) writeFileSync(diff, Buffer.from(r.png));
    delete r.png;
    results.push(r);
  }
  await app.close();
  return results;
}

const sizeOf = (copy, name) => statSync(path.join(copy, "renderer", "fonts", name)).size;
const report = [];
for (const scale of [1, 2]) {
  for (const view of Object.keys(VIEWS)) {
    const fa = path.join(out, `${view}@${scale}x-A.png`);
    const fb = path.join(out, `${view}@${scale}x-B.png`);
    const la = await shoot(A, scale, view, fa);
    const lb = await shoot(B, scale, view, fb);
    report.push({ view, scale, a: fa, b: fb, diffPng: path.join(out, `${view}@${scale}x-diff.png`), loadsA: la, loadsB: lb });
  }
}
// Noise floor: the official build against itself. Pixels that differ
// here differ from run to run, whatever the fonts.
const noise = [];
for (const scale of [1, 2]) {
  for (const view of Object.keys(VIEWS)) {
    const again = path.join(out, `${view}@${scale}x-A2.png`);
    await shoot(A, scale, view, again);
    noise.push({ view, scale, a: path.join(out, `${view}@${scale}x-A.png`), b: again, diff: path.join(out, `${view}@${scale}x-noise.png`) });
  }
}
const diffs = await compare(report.map((r) => ({ a: r.a, b: r.b, diff: r.diffPng })));
const noiseDiffs = await compare(noise);

console.log(`\nfixture home: ${home}\nscreenshots: ${out}\n`);
console.log("view".padEnd(26) + "scale  diff px     max Δ  bbox                  A vs A px    A font bytes  B font bytes  B files");
for (const [i, r] of report.entries()) {
  const d = diffs[i];
  const bytesA = r.loadsA.fontRequests.reduce((n, f) => n + sizeOf(A, f), 0);
  const bytesB = r.loadsB.fontRequests.reduce((n, f) => n + sizeOf(B, f), 0);
  console.log(
    r.view.padEnd(26) + `${r.scale}x`.padEnd(7) +
    String(d.sizeMismatch ? "SIZE" : d.diff).padStart(7) + String(d.maxDelta ?? "").padStart(10) + "  " +
    (d.bbox ? d.bbox.join(",") : "—").padEnd(22) + String(noiseDiffs[i].diff).padStart(9) +
    String(bytesA).padStart(13) + String(bytesB).padStart(14) + "  " + r.loadsB.fontRequests.join(" "),
  );
}
writeFileSync(path.join(out, "report.json"), JSON.stringify(report.map((r, i) => ({ ...r, ...diffs[i] })), null, 1));
const failed = diffs.filter((d) => d.sizeMismatch || d.diff > 0).length;
console.log(`\n${failed} of ${diffs.length} screenshots differ`);

// ---- which files each view loads, on content that does / doesn't need
// the extended files (a fresh window per view, so nothing carries over) ----
const plain = mkdtempSync(path.join(tmpdir(), "typecase-font-plain-"));
const plainSkill = (name, body) => {
  const dir = path.join(plain, ".claude/skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: Plain ASCII description for ${name}.\n---\n\n${body}\n`);
};
plainSkill("plain-ascii", "# Plain\n\nOnly ASCII here, with \"quotes\" and -- dashes.");
plainSkill("plain-italic", "# Italic\n\nSome *italic* and ***bold italic*** text.");
plainSkill("plain-accents", "# Accents\n\nCafé, Łódź, Dvořák.");
plainSkill("plain-symbols", "# Symbols\n\nThe arrow → and the warning ⚠.");
const LOAD_VIEWS = {
  "list": async () => {},
  "detail plain-ascii": async (page) => { await page.locator(".skill-row", { hasText: "plain-ascii" }).click(); await page.waitForSelector(".md-body h1"); },
  "detail plain-italic": async (page) => { await page.locator(".skill-row", { hasText: "plain-italic" }).click(); await page.waitForSelector(".md-body h1"); },
  "detail plain-accents": async (page) => { await page.locator(".skill-row", { hasText: "plain-accents" }).click(); await page.waitForSelector(".md-body h1"); },
  "detail plain-symbols": async (page) => { await page.locator(".skill-row", { hasText: "plain-symbols" }).click(); await page.waitForSelector(".md-body h1"); },
};
console.log("\nfont files loaded per view (plain fixture):");
console.log("view".padEnd(24) + "A bytes".padStart(9) + "  A files".padEnd(48) + "B bytes".padStart(9) + "  B files");
const loads = [];
for (const [view, go] of Object.entries(LOAD_VIEWS)) {
  const row = { view };
  for (const [label, copy] of [["A", A], ["B", B]]) {
    const app = await launch(copy, 1, plain);
    const page = await app.firstWindow();
    const files = new Set();
    page.on("request", (r) => { if (r.url().endsWith(".woff2")) files.add(path.basename(new URL(r.url()).pathname)); });
    await page.waitForSelector(".skill-row");
    await go(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    row[label] = [...files].sort();
    row[label + "bytes"] = row[label].reduce((n, f) => n + sizeOf(copy, f), 0);
    await app.close();
  }
  loads.push(row);
  console.log(view.padEnd(24) + String(row.Abytes).padStart(9) + ("  " + row.A.join(" ")).padEnd(48) + String(row.Bbytes).padStart(9) + "  " + row.B.join(" "));
}
writeFileSync(path.join(out, "loads.json"), JSON.stringify(loads, null, 1));
