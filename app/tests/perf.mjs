import { _electron as electron } from "@playwright/test";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const WORDS = ("anvil basalt cobalt dynamo ember fathom gantry hollow ingot jetty keel lumen mortar nimbus onyx " +
  "pylon quarry rivet sprocket tundra umber vellum wharf xenon yoke zephyr brine crag dune eyrie").split(" ");

function generateSyntheticHome(count) {
  const home = `/tmp/typecase-${count}`;
  const marker = path.join(home, ".generated");
  if (existsSync(marker)) return home;
  // Every description token carries the skill index so no two skills
  // share trigger vocabulary; a realistic home does not have 1000
  // mutually overlapping skills, and all-pairs overlap would swamp the
  // payload with O(n^2) overlap entries instead of measuring rendering.
  for (let i = 0; i < count; i++) {
    const a = `${WORDS[i % WORDS.length]}${i}`;
    const b = `${WORDS[(i * 7 + 3) % WORDS.length]}${i}`;
    const c = `${WORDS[(i * 11 + 5) % WORDS.length]}${i}`;
    const dir = path.join(home, ".cursor", "skills", `skill-${i}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "SKILL.md"), `---
name: skill-${i}
description: ${a} ${b} ${c} handling${i}. Use when ${a} ${c} appears${i}.
---

# skill-${i}

## Procedure${i}

Handle the ${a} ${b} workload end to end, case${i}.

## Notes${i}

Keep ${b} output under budget${i}.
`);
  }
  writeFileSync(marker, String(count));
  return home;
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

let home;
let cwd;
if (process.argv[2] === "--synthetic") {
  home = generateSyntheticHome(Number(process.argv[3] ?? 1000));
  cwd = home;
} else {
  home = process.argv[2];
  cwd = process.argv[3] ?? home;
  if (!home) {
    console.error("usage: node tests/perf.mjs <home> [cwd] | --synthetic <n>");
    process.exit(2);
  }
}

const app = await electron.launch({
  cwd: appDir,
  args: [appDir, "--no-sandbox"],
  env: { ...process.env, TYPECASE_HOME: home, TYPECASE_CWD: cwd },
});
const page = await app.firstWindow();
await page.waitForSelector(".skill-row", { timeout: 60000 });

const boot = await page.evaluate(() => window.__perf ?? null);
const rowCount = await page.locator(".skill-row").count();

const clickAndMeasure = (wanted) => page.evaluate(async (label) => {
  const items = [...document.querySelectorAll(".filter-chip")];
  const target = items.find((el) => el.textContent.includes(label));
  if (!target) throw new Error(`filter chip not found: ${label}`);
  const stats = window.__renderStats ?? { count: 0 };
  const start = stats.count;
  target.click();
  for (let i = 0; i < 400 && window.__renderStats.count === start; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  if (window.__renderStats.count === start) throw new Error("render never ran");
  return window.__renderStats.lastMs;
}, wanted);

const reRender = async (label) => {
  const runs = [];
  for (let i = 0; i < 7; i++) {
    runs.push(await clickAndMeasure(label));
    await clickAndMeasure(label === "All" ? "Cursor" : "All");
  }
  return runs;
};

const toolFilter = await reRender("Cursor");
// reRender("Cursor") ends on All; clicking the active chip is a no-op, so
// step to Cursor first or the first "All" click never renders.
await clickAndMeasure("Cursor");
const backToAll = await reRender("All");

console.log(JSON.stringify({
  home,
  rows: rowCount,
  ipcAndCollectMs: boot ? Number(boot.ipcMs.toFixed(1)) : null,
  firstRenderMs: boot ? Number(boot.firstRenderMs.toFixed(1)) : null,
  toolFilterReRenderMs: { median: Number(median(toolFilter).toFixed(2)), runs: toolFilter.map((x) => Number(x.toFixed(2))) },
  backToAllReRenderMs: { median: Number(median(backToAll).toFixed(2)), runs: backToAll.map((x) => Number(x.toFixed(2))) },
}, null, 2));

await app.close();
