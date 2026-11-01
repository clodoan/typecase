import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const ALPHA = `---
name: alpha-review
description: Review pull requests for style and risky changes.
---

# Alpha review

## When to use
When a PR needs a style pass.

## When not to use
Not for generated code.

## Steps
Run \`git diff\` and read every hunk.
`;

const BETA = `---
name: beta-notes
description: Take structured meeting notes.
---

# Beta notes

Write notes with owners and deadlines. See [the helper](run.command).
`;

let home;
let app;
let page;

test.beforeAll(async () => {
  home = mkdtempSync(path.join(tmpdir(), "typecase-smoke-"));
  mkdirSync(path.join(home, ".grok/skills/alpha-review"), { recursive: true });
  mkdirSync(path.join(home, ".claude/skills/beta-notes"), { recursive: true });
  writeFileSync(path.join(home, ".grok/skills/alpha-review/SKILL.md"), ALPHA);
  writeFileSync(path.join(home, ".claude/skills/beta-notes/SKILL.md"), BETA);
  writeFileSync(path.join(home, ".claude/skills/beta-notes/run.command"), "#!/bin/sh\ntouch pwned\n", { mode: 0o755 });

  // One Claude Code session, 40 days ago, that offered beta-notes and in
  // which the user typed /beta-notes: used once, but not in the last 30 days.
  const at = new Date(Date.now() - 40 * 86_400_000).toISOString();
  mkdirSync(path.join(home, ".claude/projects/-work"), { recursive: true });
  writeFileSync(path.join(home, ".claude/projects/-work/s1.jsonl"), [
    { type: "attachment", timestamp: at, attachment: { type: "skill_listing", content: "- beta-notes: Take structured meeting notes." } },
    { type: "user", timestamp: at, cwd: "/work", message: { content: "<command-name>/beta-notes</command-name>" } },
  ].map((r) => JSON.stringify(r)).join("\n"));

  process.env.TYPECASE_HOME = home;
  process.env.TYPECASE_SNAPSHOTS = path.join(home, ".cache/typecase/snapshots");
  const { discover } = await import("../../scripts/lib/discover.mjs");
  const { writeLock } = await import("../../scripts/lib/lockfile.mjs");
  writeLock(discover({ cwd: home }), path.join(home, "skills.lock"));
  writeFileSync(
    path.join(home, ".grok/skills/alpha-review/SKILL.md"),
    ALPHA + "\n## Escalation\nStop and ask before force-pushing anything.\n",
  );

  app = await electron.launch({
    cwd: appDir,
    args: [appDir, "--no-sandbox"],
    // No `cursor` or `code` on PATH, as for an app launched from Finder.
    env: { ...process.env, PATH: "/usr/bin:/bin", TYPECASE_HOME: home, TYPECASE_CWD: home, CLAUDE_CONFIG_DIR: path.join(home, ".claude") },
  });
  page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
});

test.afterAll(async () => {
  await app?.close();
  rmSync(home, { recursive: true, force: true });
});

test("row list renders every fixture skill with count and badges", async () => {
  await expect(page.locator(".skill-row:visible")).toHaveCount(2);
  await expect(page.locator(".count-head h1")).toHaveText("2 Skills");
  await expect(page.locator(".skill-row", { hasText: "alpha-review" }).locator(".badge.changed")).toBeVisible();
});

test("Inter loads from the bundled subsets, core only on a plain view", async () => {
  const faces = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map((f) => ({ family: f.family.replaceAll('"', ""), style: f.style, range: f.unicodeRange, status: f.status }));
  });
  const inter = faces.filter((f) => f.family === "InterVariable");
  expect(inter).toHaveLength(4);
  // Fixture text is plain ASCII with no italics: only the roman core is in
  // use (the italic core's bytes are preloaded, its face activates on first
  // italic text), and neither extended face is ever fetched.
  const isCore = (f) => f.range.startsWith("U+20-7E");
  expect(inter.filter((f) => f.status === "loaded").map((f) => [f.style, isCore(f)])).toEqual([["normal", true]]);
  expect(inter.filter((f) => !isCore(f)).map((f) => f.status)).toEqual(["unloaded", "unloaded"]);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/^InterVariable,/);
});

test("search palette finds and opens a skill", async () => {
  await page.keyboard.press("ControlOrMeta+KeyK");
  await expect(page.locator(".palette")).toBeVisible();
  await page.locator("#palette-input").fill("meeting notes");
  await expect(page.locator(".palette-row.selected .name")).toHaveText("beta-notes");
  await page.keyboard.press("Enter");
  await expect(page.locator(".detail-hero")).toHaveText("beta-notes");
  await expect(page.locator(".row", { hasText: "Installed at" })).toContainText("beta-notes/SKILL.md");
  await expect(page.locator(".body-sections")).toContainText("Write notes with owners and deadlines.");
});

test("a relative link in a skill reveals the file instead of launching it", async () => {
  await app.evaluate(({ shell }) => {
    globalThis.shellCalls = [];
    shell.openPath = async (p) => { globalThis.shellCalls.push(["openPath", p]); return ""; };
    shell.showItemInFolder = (p) => { globalThis.shellCalls.push(["showItemInFolder", p]); };
  });
  await page.locator(".body-sections a", { hasText: "the helper" }).click();
  const target = path.join(home, ".claude/skills/beta-notes/run.command");
  await expect.poll(() => app.evaluate(() => globalThis.shellCalls)).toEqual([["showItemInFolder", target]]);
});

test("the renderer runs sandboxed", async () => {
  const sandboxed = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().sandbox);
  expect(sandboxed).toBe(true);
});

test("History tab shows the plain-language change paragraph", async () => {
  await page.keyboard.press("Escape");
  await page.locator(".skill-row", { hasText: "alpha-review" }).click();
  await expect(page.locator(".detail-hero")).toHaveText("alpha-review");
  await page.locator('#segmented button[data-tab="history"]').click();
  await expect(page.locator(".history-entry .para").first()).toContainText("Escalation");
  await expect(page.locator(".diff-list li.added")).toContainText("Escalation");
});

test("sidebar: short list, one selection, no empty items", async () => {
  // Filtering hides cached row nodes instead of rebuilding the list,
  // so count only visible rows.
  await page.keyboard.press("Escape");
  await expect(page.locator(".nav-item")).toHaveText([/All Skills\s*2/, /Unused\s*1/, /Changed\s*1/, /Grok\s*1/, /Claude Code\s*1/]);

  await page.locator(".nav-item", { hasText: "Claude Code" }).click();
  await expect(page.locator(".skill-row:visible")).toHaveCount(1);
  await expect(page.locator(".skill-row:visible .r-name")).toHaveText("beta-notes");

  // Picking a flag replaces the tool selection.
  await page.locator(".nav-item", { hasText: "Changed" }).click();
  await expect(page.locator(".nav-item[aria-current]")).toHaveCount(1);
  await expect(page.locator(".skill-row:visible .r-name")).toHaveText("alpha-review");

  await page.locator(".nav-item", { hasText: "All Skills" }).click();
  await expect(page.locator(".skill-row:visible")).toHaveCount(2);
});

test("usage from session logs: Unused item, row cell and detail metrics", async () => {
  await page.keyboard.press("Escape");
  const unused = page.locator(".nav-item", { hasText: "Unused" });
  await expect(unused).toContainText("1");
  await expect(page.locator(".skill-row", { hasText: "beta-notes" }).locator(".r-use")).toHaveText("0× · 1mo ago");
  // Grok keeps no readable log, so its skill is "not tracked", not unused.
  await expect(page.locator(".skill-row", { hasText: "alpha-review" }).locator(".r-use")).toHaveText("—");

  await unused.click();
  await expect(page.locator(".skill-row:visible")).toHaveCount(1);
  await page.locator(".skill-row:visible").click();
  const usage = page.locator("section.usage");
  await expect(usage.locator(".row", { hasText: "Last 30 days" })).toContainText("0 uses · 1 all time Unused, so a candidate to remove.");
  await expect(usage.locator(".row", { hasText: "Last used" })).toContainText("1mo ago");
  await expect(usage.locator(".row", { hasText: "Started by" })).toContainText("you, typing /beta-notes, 1× The agent never picks it on its own");
  await expect(usage.locator(".row", { hasText: "Hit rate" })).toContainText("100% · used in 1 of 1 session that offered it");
});
