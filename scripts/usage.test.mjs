import { test, before } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseClaudeSession, parseCodexSession, scanUsage } from "./lib/usage.mjs";
import { indexUsage, skillUsage, skillNameOf, agoText, DAY } from "./lib/usage-stats.mjs";

const CLI = fileURLToPath(new URL("./typecase.mjs", import.meta.url));
const NOW = Date.parse("2026-11-01T12:00:00Z");
const iso = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();
const jsonl = (records) => records.map((r) => JSON.stringify(r)).join("\n") + "\n";

// Record shapes as observed in Claude Code transcripts.
const listing = (daysAgo, names) => ({
  type: "attachment", timestamp: iso(daysAgo),
  attachment: { type: "skill_listing", content: names.map((n) => `- ${n}: does ${n} things`).join("\n") },
});
const agentUse = (daysAgo, skill) => ({
  type: "assistant", timestamp: iso(daysAgo),
  message: { content: [{ type: "text", text: "loading" }, { type: "tool_use", name: "Skill", input: { skill } }] },
});
const typedUse = (daysAgo, name) => ({
  type: "user", timestamp: iso(daysAgo), cwd: "/work/proj",
  message: { content: `<command-message>${name}</command-message>\n<command-name>/${name}</command-name>` },
});

let home;
before(() => {
  home = mkdtempSync(path.join(tmpdir(), "typecase-usage-"));
  process.env.TYPECASE_HOME = home;
  delete process.env.CLAUDE_CONFIG_DIR;
  delete process.env.CODEX_HOME;
  delete process.env.TYPECASE_USAGE_CACHE;
  process.on("exit", () => rmSync(home, { recursive: true, force: true }));
});

test("skillNameOf strips plugin and directory prefixes", () => {
  assert.equal(skillNameOf("anthropic-skills:pdf"), "pdf");
  assert.equal(skillNameOf("apps/web:deploy"), "deploy");
  assert.equal(skillNameOf("/review"), "review");
});

test("Claude Code: listing, agent and typed uses count; echoes and mentions do not", () => {
  const text = jsonl([
    listing(2, ["alpha", "beta", "plugin-x:gamma"]),
    typedUse(2, "beta"),
    agentUse(2, "plugin-x:gamma"),
    // A tool result that quotes a transcript, and a Bash call that greps
    // for "Skill", must not look like uses.
    { type: "user", timestamp: iso(2), toolUseResult: { stdout: "x" }, message: { content: [{ type: "tool_result", content: "<command-name>/alpha</command-name>" }] } },
    { type: "assistant", timestamp: iso(2), message: { content: [{ type: "tool_use", name: "Bash", input: { command: `grep '"Skill"' log` } }] } },
    "not json at all",
  ]);
  const s = parseClaudeSession(text);
  assert.deepEqual(s.listed.sort(), ["alpha", "beta", "gamma"]);
  assert.deepEqual(s.uses.map((u) => [u.name, u.how]), [["beta", "typed"], ["gamma", "agent"]]);
  assert.equal(s.cwd, "/work/proj");
  assert.equal(s.start, iso(2));

  assert.equal(parseClaudeSession(text, { sidechain: true }).listed, null, "sub-agent logs stay out of hit rate");
  assert.equal(parseClaudeSession(jsonl([agentUse(1, "alpha")])).listed, null, "no listing → unknown, not empty");
});

test("Codex: only a tool call that reads SKILL.md is a use", () => {
  const skill = "/h/.codex/skills/c-skill/SKILL.md";
  const text = jsonl([
    { timestamp: iso(3), type: "session_meta", payload: { cwd: "/work", instructions: `skills: c-skill (${skill}), d-skill (/h/.agents/skills/d-skill/SKILL.md)` } },
    { timestamp: iso(3), type: "response_item", payload: { type: "function_call", name: "shell", arguments: JSON.stringify({ command: ["bash", "-lc", `sed -n 1,200p ${skill}`] }) } },
    { timestamp: iso(3), type: "response_item", payload: { type: "function_call_output", output: `read ${skill}` } },
  ]);
  const s = parseCodexSession(text);
  assert.deepEqual(s.uses.map((u) => [u.name, u.path, u.how]), [["c-skill", skill, "read"]]);
  assert.equal(s.listed, null);
});

function fakeIndex() {
  const sessions = [];
  // 10 sessions offer alpha/beta/folder-name; alpha used in 3 of them.
  for (let i = 0; i < 10; i++) {
    const uses = [];
    if (i < 3) uses.push({ name: "alpha", at: iso(45 - i * 12), how: "agent" }); // 45, 33, 21 days ago
    if (i === 5) uses.push({ name: "beta", at: iso(50), how: "typed" });
    sessions.push({ tool: "claude", id: `s${i}`, start: iso(60 - i), listed: ["alpha", "beta", "folder-name"], uses });
  }
  sessions.push({ tool: "claude", id: "sub", sidechain: true, start: iso(1), listed: null, uses: [{ name: "alpha", at: iso(1), how: "agent" }] });
  sessions.push({ tool: "codex", id: "c1", start: iso(5), listed: null, uses: [{ name: "c-skill", path: "/h/.agents/skills/c-skill/SKILL.md", at: iso(4), how: "read" }] });
  return indexUsage({
    sources: [{ tool: "claude", dir: "/x", exists: true }, { tool: "codex", dir: "/y", exists: true }],
    sessions,
  });
}

const install = (name, tool, extra = {}) => ({
  name, tool, path: `/h/${tool}/${name}/SKILL.md`, dir: `/h/${tool}/${name}`, description: "d".repeat(36), mtimeMs: 0, ...extra,
});

test("skillUsage: counts, recency, hit rate and context cost", () => {
  const idx = fakeIndex();
  assert.equal(idx.sources.find((s) => s.tool === "claude").sessions, 10, "sub-agent logs are not sessions");
  const u = skillUsage(idx, [install("alpha", "claude")], { now: NOW });
  assert.equal(u.tracked, true);
  assert.equal(u.total, 4);
  assert.equal(u.recent, 2, "21 days ago and the sub-agent use 1 day ago");
  assert.equal(u.unused, false);
  assert.equal(u.lastAt, NOW - DAY);
  assert.deepEqual(u.how, { agent: 4, typed: 0, read: 0 });
  assert.deepEqual(u.hit && [u.hit.offered, u.hit.used], [10, 3]);
  assert.equal(u.hit.listingTokens, Math.ceil("- alpha: ".concat("d".repeat(36)).length / 4));
  assert.equal(u.hit.contextTokens, u.hit.listingTokens * 10);
});

test("skillUsage: unused, typed-only, folder names, untracked tools, shared installs", () => {
  const idx = fakeIndex();
  const beta = skillUsage(idx, [install("beta", "claude")], { now: NOW });
  assert.equal(beta.unused, true);
  assert.deepEqual(beta.how, { agent: 0, typed: 1, read: 0 });

  // Claude Code's listing names this skill by its folder.
  const folder = skillUsage(idx, [install("frontmatter-name", "claude", { dir: "/h/claude/folder-name" })], { now: NOW });
  assert.equal(folder.hit.offered, 10);

  const cursorOnly = skillUsage(idx, [install("alpha", "cursor")], { now: NOW });
  assert.deepEqual(cursorOnly, { tracked: false, untracked: ["cursor"] });

  const shared = skillUsage(idx, [install("c-skill", "shared", { path: "/h/.agents/skills/c-skill/SKILL.md" }), install("c-skill", "cursor")], { now: NOW });
  assert.equal(shared.recent, 1);
  assert.deepEqual(shared.byLog, { codex: 1 });
  assert.deepEqual(shared.untracked, ["cursor"]);
  assert.equal(shared.hit, null, "Codex logs carry no listing");
});

test("skillUsage: uses in equal windows before and after the last edit", () => {
  const idx = fakeIndex();
  // Edited 25 days ago; logs start 60 days ago → 25-day windows each side.
  const u = skillUsage(idx, [install("alpha", "claude", { mtimeMs: NOW - 25 * DAY })], { now: NOW });
  assert.deepEqual(u.edit && [u.edit.days, u.edit.before, u.edit.after], [25, 2, 2]);
  const fresh = skillUsage(idx, [install("alpha", "claude", { mtimeMs: NOW - DAY })], { now: NOW });
  assert.equal(fresh.edit, null, "too soon after the edit to compare");
});

test("agoText", () => {
  assert.equal(agoText(null, NOW), "never");
  assert.equal(agoText(NOW - 2 * 3600e3, NOW), "today");
  assert.equal(agoText(NOW - 3 * DAY, NOW), "3d ago");
  assert.equal(agoText(NOW - 65 * DAY, NOW), "2mo ago");
});

test("scanUsage caches sessions and keeps them after the agent deletes its log", async () => {
  const proj = path.join(home, ".claude/projects/-work-proj");
  mkdirSync(path.join(proj, "s1/subagents"), { recursive: true });
  const file = path.join(proj, "s1.jsonl");
  writeFileSync(file, jsonl([listing(1, ["alpha"]), agentUse(1, "alpha")]));
  writeFileSync(path.join(proj, "s1/subagents/agent-1.jsonl"), jsonl([listing(1, ["alpha"]), agentUse(1, "alpha")]));
  const cachePath = path.join(home, "usage-cache.json");

  const first = await scanUsage({ cachePath });
  assert.equal(first.sessions.length, 2);
  assert.equal(first.sessions.filter((s) => s.sidechain).length, 1);
  const cached = readFileSync(cachePath, "utf8");
  assert.doesNotMatch(cached, /does alpha things/, "no message text in the cache");

  rmSync(file);
  const second = await scanUsage({ cachePath });
  assert.ok(second.sessions.some((s) => s.id === "s1" && s.uses.length === 1), "deleted log still counted");

  // A changed file is reparsed.
  const sub = path.join(proj, "s1/subagents/agent-1.jsonl");
  writeFileSync(sub, jsonl([agentUse(1, "alpha"), agentUse(1, "alpha")]));
  utimesSync(sub, new Date(), new Date(Date.now() + 5000));
  const third = await scanUsage({ cachePath });
  assert.equal(third.sessions.find((s) => s.sidechain).uses.length, 2);
  rmSync(path.join(home, ".claude"), { recursive: true, force: true });
});

test("CLI: usage lists used, unused and untracked skills", () => {
  const skill = (rel, name) => {
    const dir = path.join(home, rel, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name} helper. Use for ${name}.\n---\n\n# ${name}\n`);
  };
  skill(".claude/skills", "used-one");
  skill(".claude/skills", "idle-one");
  skill(".cursor/skills", "cursor-one");
  const proj = path.join(home, ".claude/projects/-p");
  mkdirSync(proj, { recursive: true });
  const day = (d) => new Date(Date.now() - d * DAY).toISOString();
  writeFileSync(path.join(proj, "a.jsonl"), jsonl([
    { ...listing(0, ["used-one", "idle-one"]), timestamp: day(2) },
    { ...agentUse(0, "used-one"), timestamp: day(2) },
    { ...typedUse(0, "used-one"), timestamp: day(1) },
  ]));

  const run = (args) => spawnSync(process.execPath, [CLI, ...args], { cwd: home, encoding: "utf8", env: { ...process.env, TYPECASE_HOME: home } });
  const all = run(["usage"]);
  assert.equal(all.status, 0, all.stderr);
  assert.match(all.stdout, /1 Claude Code session since/);
  assert.match(all.stdout, /used-one\s+2\s+2\s+1d ago\s+100% of 1\s+agent 1 · you 1/);
  assert.match(all.stdout, /unused in 30 days \(1\)[\s\S]*idle-one/);
  assert.match(all.stdout, /not tracked \(1\)/);

  const one = run(["usage", "idle-one"]);
  assert.match(one.stdout, /used in 0 of 1 sessions that offered it \(0%\)/);

  const json = JSON.parse(run(["usage", "--json"]).stdout);
  assert.equal(json.skills.find((s) => s.name === "used-one").recent, 2);
  assert.equal(run(["usage", "--days", "nope"]).status, 2);
});
