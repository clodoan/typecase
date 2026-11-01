#!/usr/bin/env node

import { spawn } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { discover, displayGroups, where } from "./lib/discover.mjs";
import {
  LOCKFILE, CHANGELOG, writeLock, readLock, diffAgainstLock, appendChangelog, pin,
} from "./lib/lockfile.mjs";
import { htmlReader } from "./lib/html-reader.mjs";
import { scanUsage } from "./lib/usage.mjs";
import { indexUsage, skillUsage, agoText, LOG_LABEL, WINDOW_DAYS } from "./lib/usage-stats.mjs";

const EXIT_OK = 0;
const EXIT_DIFFS = 1;
const EXIT_USAGE = 2;

const isTTY = process.stdout.isTTY;
const c = {
  dim: (s) => (isTTY ? `\x1b[2m${s}\x1b[0m` : s),
  bold: (s) => (isTTY ? `\x1b[1m${s}\x1b[0m` : s),
  red: (s) => (isTTY ? `\x1b[31m${s}\x1b[0m` : s),
  yellow: (s) => (isTTY ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s) => (isTTY ? `\x1b[36m${s}\x1b[0m` : s),
  green: (s) => (isTTY ? `\x1b[32m${s}\x1b[0m` : s),
};

function usage() {
  return `Usage: typecase <command> [args]

Commands:
  ls [--tool t] [--scope s] [--json]   every installed skill: tool, scope, size, description
  where <query...>                     which skill(s) would handle a task, with paths
  show <skill>                         clean terminal render of one skill
  open                                 desktop reader (Electron), or static HTML fallback
  lock [--no-snapshot]                 write ${LOCKFILE} (+ folder snapshots for pin)
  diff [--write-changelog]             what changed since ${LOCKFILE}, one paragraph per skill
  pin <skill>                          restore the locked version of a skill
  usage [skill] [--unused] [--days n]  how often each skill is used, from local
                                       Claude Code and Codex session logs
  -h, --help

Set TYPECASE_LLM_CMD to generate diff paragraphs with an LLM (stdin: change
JSON; stdout: paragraph); otherwise a deterministic summary is used.

Exit codes: 0 ok, 1 diff found changes, 2 usage error.`;
}

function flag(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return { present: false, args };
  const rest = [...args];
  rest.splice(i, 1);
  return { present: true, args: rest };
}

function opt(args, name) {
  const i = args.indexOf(name);
  if (i === -1 || i === args.length - 1) return { value: null, args };
  const rest = [...args];
  const [, value] = rest.splice(i, 2);
  return { value, args: rest };
}

const TOOL_BADGE = { grok: "grok", cursor: "cursor", claude: "claude", codex: "codex", shared: "shared" };

function cmdLs(args) {
  const json = flag(args, "--json");
  const tool = opt(json.args, "--tool");
  const scope = opt(tool.args, "--scope");
  const data = discover();
  let skills = [...data.skills];
  if (tool.value) skills = skills.filter((s) => s.tool === tool.value);
  if (scope.value) skills = skills.filter((s) => s.scope === scope.value);

  if (json.present) {
    console.log(JSON.stringify({ ...data, skills }, null, 2));
    return;
  }
  const groups = displayGroups(skills)
    .map((idxs) => ({ s: skills[idxs[0]], copies: idxs.length, installs: idxs.map((i) => skills[i]) }))
    .sort((a, b) => a.s.tool.localeCompare(b.s.tool) || a.s.scope.localeCompare(b.s.scope) || a.s.name.localeCompare(b.s.name));
  const dupNames = new Set(data.duplicates.filter((d) => !d.identical).map((d) => d.name));
  const overlapNames = new Set(data.overlaps.flatMap((o) => [o.a.name, o.b.name]));
  console.log(
    c.bold(`${groups.length} skills`) +
    c.dim(` (${skills.length} installs) · ${data.roots.filter((r) => r.exists).length} roots scanned`),
  );
  let lastGroup = "";
  for (const { s, copies } of groups) {
    const group = `${s.tool} · ${s.scope}`;
    if (group !== lastGroup) {
      console.log("\n" + c.cyan(group));
      lastGroup = group;
    }
    const marks = [
      copies > 1 ? c.dim(`×${copies}`) : "",
      dupNames.has(s.name) ? c.yellow("dup") : "",
      overlapNames.has(s.name) ? c.yellow("overlap") : "",
      s.riskyTools.length ? c.red(s.riskyTools.join(",")) : "",
      s.error ? c.red("parse-error") : "",
    ].filter(Boolean).join(" ");
    const desc = (s.description || "").slice(0, 86);
    console.log(
      `  ${c.bold(s.name.padEnd(28).slice(0, 28))} ${String(s.tokens).padStart(5)}tok  ${desc}${marks ? "  " + marks : ""}`,
    );
  }
  const collisions = data.duplicates.filter((d) => !d.identical);
  if (collisions.length) {
    console.log("\n" + c.yellow(`same name, different content (${collisions.length}):`));
    for (const d of collisions) {
      console.log(`  ${c.bold(d.name)}`);
      for (const i of d.installs) console.log(c.dim(`    ${i.tool}/${i.scope}  ${i.path}`));
    }
  }
  if (data.overlaps.length) {
    console.log("\n" + c.yellow(`overlapping triggers (${data.overlaps.length}):`));
    for (const o of data.overlaps.slice(0, 12)) {
      console.log(`  ${c.bold(o.a.name)} (${o.a.tool}) ↔ ${c.bold(o.b.name)} (${o.b.tool})  ${c.dim("jaccard " + o.score)}`);
    }
  }
}

function cmdWhere(args) {
  const json = flag(args, "--json");
  const query = json.args.join(" ").trim();
  if (!query) throw new UsageError("where needs a query");
  const results = where(discover(), query).slice(0, 8);
  if (json.present) {
    console.log(JSON.stringify(results.map((r) => ({ name: r.skill.name, tool: r.skill.tool, scope: r.skill.scope, score: r.score, path: r.skill.path })), null, 2));
    return;
  }
  if (!results.length) {
    console.log(c.dim(`no installed skill claims “${query}”`));
    return;
  }
  for (const { skill, score } of results) {
    console.log(`${c.bold(skill.name)} ${c.dim(`(${skill.tool}/${skill.scope}, score ${score})`)}`);
    console.log(`  ${(skill.description || skill.triggers).slice(0, 110)}`);
    console.log(c.dim(`  ${skill.path}`));
  }
}

function findSkill(data, nameArg) {
  const matches = data.skills.filter((s) => s.name === nameArg);
  if (!matches.length) {
    const close = data.skills.filter((s) => s.name.includes(nameArg));
    if (close.length === 1) return close[0];
    throw new UsageError(
      `no skill named "${nameArg}"${close.length ? ` — close: ${close.map((s) => s.name).join(", ")}` : ""}`,
    );
  }
  return matches[0];
}

function cmdShow(args) {
  if (!args[0]) throw new UsageError("show needs a skill name");
  const data = discover();
  const s = findSkill(data, args[0]);
  const rule = c.dim("─".repeat(Math.min(72, process.stdout.columns || 72)));
  console.log(`${c.bold(s.name)}  ${c.dim(`${s.tool} · ${s.scope} · ${s.tokens} tokens`)}`);
  console.log(s.description);
  console.log(rule);
  if (s.triggers) console.log(`${c.cyan("triggers")}  ${s.triggers.slice(0, 400)}`);
  if (s.whenNot) console.log(`${c.cyan("when not")}  ${s.whenNot.slice(0, 300)}`);
  if (s.riskyTools.length) console.log(`${c.red("risky")}     ${s.riskyTools.join(", ")}`);
  if (s.commands.length) console.log(`${c.cyan("commands")}  ${s.commands.join(", ")}`);
  if (s.files.length) console.log(`${c.cyan("files")}     ${s.files.join(", ")}`);
  console.log(`${c.cyan("path")}      ${s.path}`);
  const related = data.overlaps.filter((o) => o.a.name === s.name || o.b.name === s.name);
  for (const o of related) {
    const other = o.a.name === s.name ? o.b : o.a;
    console.log(`${c.yellow("overlaps")}  ${other.name} (${other.tool}) — jaccard ${o.score}`);
  }
  console.log(rule);
  for (const sec of s.sections) {
    if (sec.level > 0) console.log("\n" + c.bold("#".repeat(sec.level) + " " + sec.heading) + c.dim(`  (${sec.tokens} tok)`));
    if (sec.text) console.log(sec.text);
  }
}

function cmdLock(args) {
  const noSnap = flag(args, "--no-snapshot");
  const data = discover();
  const prior = readLock();
  if (prior) {
    const entries = diffAgainstLock(prior, data);
    if (entries.length) appendChangelog(entries);
  }
  const lock = writeLock(data, LOCKFILE, { snapshot: !noSnap.present });
  console.log(`${c.green("locked")} ${Object.keys(lock.skills).length} skills → ${LOCKFILE}${noSnap.present ? "" : c.dim(" (+snapshots)")}`);
}

function cmdDiff(args) {
  const write = flag(args, "--write-changelog");
  const json = flag(write.args, "--json");
  const lock = readLock();
  if (!lock) throw new UsageError(`no ${LOCKFILE} here — run \`typecase lock\` first`);
  const entries = diffAgainstLock(lock, discover());
  if (json.present) {
    console.log(JSON.stringify(entries, null, 2));
  } else if (!entries.length) {
    console.log(c.green(`no changes since ${LOCKFILE} (${lock.generatedAt})`));
  } else {
    console.log(c.bold(`${entries.length} change(s) since ${lock.generatedAt}:`) + "\n");
    for (const e of entries) {
      const tag = e.status === "added" ? c.green("+ added") : e.status === "removed" ? c.red("− removed") : c.yellow("~ changed");
      console.log(`${tag}  ${e.paragraph.replace(/\*\*/g, "")}\n`);
    }
  }
  if (write.present && entries.length) {
    appendChangelog(entries);
    console.log(c.dim(`appended ${entries.length} entries to ${CHANGELOG}`));
  }
  process.exit(entries.length ? EXIT_DIFFS : EXIT_OK);
}

function cmdPin(args) {
  if (!args[0]) throw new UsageError("pin needs a skill name");
  const lock = readLock();
  if (!lock) throw new UsageError(`no ${LOCKFILE} here — run \`typecase lock\` first`);
  const results = pin(lock, discover(), args[0]);
  for (const r of results) {
    console.log(`${c.green("pinned")} ${r.name} → ${r.restored} at ${r.dir}${r.backedUp ? c.dim(` (previous ${r.backedUp} snapshotted)`) : ""}`);
  }
}

function cmdOpen() {
  const appDir = fileURLToPath(new URL("../app", import.meta.url));
  const electron = path.join(appDir, "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron");
  if (existsSync(electron)) {
    const child = spawn(electron, [appDir], {
      detached: true, stdio: "ignore",
      env: { ...process.env, TYPECASE_CWD: process.cwd() },
    });
    child.unref();
    console.log("opened the Typecase app");
    return;
  }
  const data = discover();
  const file = path.join(tmpdir(), "typecase-reader.html");
  writeFileSync(file, htmlReader(data, { lock: readLock() }));
  console.log(`desktop app not installed (cd ${path.relative(process.cwd(), appDir) || "app"} && npm install)`);
  console.log(`static reader written → ${file}`);
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  spawn(opener, [file], { detached: true, stdio: "ignore" }).on("error", () => {});
}

const pct = (x) => `${Math.round(x * 100)}%`;
const kTok = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

function howText(u) {
  return [
    u.how.agent ? `agent ${u.how.agent}` : "",
    u.how.typed ? `you ${u.how.typed}` : "",
    u.how.read ? `read ${u.how.read}` : "",
  ].filter(Boolean).join(" · ") || "—";
}

async function cmdUsage(args) {
  const json = flag(args, "--json");
  const unusedOnly = flag(json.args, "--unused");
  const days = opt(unusedOnly.args, "--days");
  const windowDays = days.value ? Number(days.value) : WINDOW_DAYS;
  if (!(windowDays > 0)) throw new UsageError("--days needs a positive number");
  const nameArg = days.args[0];
  if (nameArg?.startsWith("-")) throw new UsageError(`unknown option for usage: ${nameArg}`);

  const data = discover();
  const index = indexUsage(await scanUsage());
  const byName = new Map();
  for (const s of data.skills.filter((x) => !x.error)) {
    if (!byName.has(s.name)) byName.set(s.name, []);
    byName.get(s.name).push(s);
  }
  const rows = [...byName.entries()]
    .map(([name, installs]) => ({ name, installs, u: skillUsage(index, installs, { windowDays }) }))
    .sort((a, b) => (b.u.recent ?? -1) - (a.u.recent ?? -1) || (b.u.total ?? -1) - (a.u.total ?? -1) || a.name.localeCompare(b.name));

  if (json.present) {
    console.log(JSON.stringify({ sources: index.sources, skills: rows.map(({ name, u }) => ({ name, ...u })) }, null, 2));
    return;
  }

  const live = index.sources.filter((s) => s.sessions > 0);
  console.log(
    c.bold("Usage") + c.dim(" · ") +
    (live.length
      ? live.map((s) => `${s.sessions} ${LOG_LABEL[s.tool]} session${s.sessions === 1 ? "" : "s"} since ${s.since.slice(0, 10)}`).join(c.dim(" · "))
      : c.yellow("no Claude Code or Codex session logs found")),
  );

  if (nameArg) {
    const row = rows.find((r) => r.name === nameArg) ?? rows.find((r) => r.name.includes(nameArg));
    if (!row) throw new UsageError(`no skill named "${nameArg}"`);
    const { u } = row;
    console.log("\n" + c.bold(row.name) + c.dim(`  installed for ${[...new Set(row.installs.map((i) => i.tool))].join(", ")}`));
    if (!u.tracked) {
      console.log(c.dim("  not tracked: no readable session log covers the tools it is installed for"));
      return;
    }
    console.log(`  uses        ${u.recent} in ${windowDays}d · ${u.total} all time · ${u.lastAt ? `last used ${agoText(u.lastAt)}` : "never used"}`);
    console.log(`  started by  ${howText(u)}`);
    console.log(`  by tool     ${Object.entries(u.byLog).map(([l, n]) => `${LOG_LABEL[l]} ${n}`).join(" · ")}${u.untracked.length ? c.dim(` · ${u.untracked.join(", ")} not tracked`) : ""}`);
    if (u.hit) {
      console.log(`  hit rate    used in ${u.hit.used} of ${u.hit.offered} sessions that offered it (${pct(u.hit.rate)})`);
      console.log(`  context     ~${u.hit.listingTokens} tokens of description per session ≈ ${kTok(u.hit.contextTokens)} tokens so far`);
    }
    if (u.edit) {
      console.log(`  last edit   ${new Date(u.edit.editedAt).toISOString().slice(0, 10)}: ${u.edit.before} uses in the ${u.edit.days}d before, ${u.edit.after} in the ${u.edit.days}d after`);
    }
    const overlaps = data.overlaps.filter((o) => o.a.name === row.name || o.b.name === row.name);
    for (const o of overlaps) {
      const other = rows.find((r) => r.name === (o.a.name === row.name ? o.b.name : o.a.name));
      if (other) console.log(`  overlaps    ${other.name}: ${other.u.tracked ? `${other.u.recent} uses in ${windowDays}d` : "not tracked"}`);
    }
    return;
  }

  const tracked = rows.filter((r) => r.u.tracked);
  const unused = tracked.filter((r) => r.u.unused);
  const untracked = rows.filter((r) => !r.u.tracked);

  const used = tracked.filter((r) => r.u.total > 0);
  if (!unusedOnly.present && !used.length) console.log(c.dim("\n  no skill uses recorded yet"));
  if (!unusedOnly.present && used.length) {
    console.log("\n" + c.dim(`  ${"skill".padEnd(28)} ${`${windowDays}d`.padStart(4)} ${"all".padStart(5)}  ${"last".padEnd(9)} ${"hit rate".padEnd(14)} started by`));
    for (const { name, u } of used) {
      const hit = u.hit ? `${pct(u.hit.rate)} of ${u.hit.offered}` : "—";
      console.log(`  ${c.bold(name.padEnd(28).slice(0, 28))} ${String(u.recent).padStart(4)} ${String(u.total).padStart(5)}  ${agoText(u.lastAt).padEnd(9)} ${hit.padEnd(14)} ${howText(u)}`);
    }
    const typedOnly = tracked.filter((r) => r.u.how.typed > 0 && r.u.how.agent === 0 && r.u.how.read === 0);
    if (typedOnly.length) {
      console.log("\n" + c.yellow(`only ever started by you (${typedOnly.length}) — the agent never picks these; their descriptions may not match how you ask:`));
      console.log("  " + typedOnly.map((r) => r.name).join(", "));
    }
  }
  if (!unusedOnly.present) {
    const pairs = data.overlaps
      .map((o) => [rows.find((r) => r.name === o.a.name), rows.find((r) => r.name === o.b.name)])
      .filter(([a, b]) => a?.u.tracked && b?.u.tracked && a.name !== b.name);
    const seen = new Set();
    const uniq = pairs.filter(([a, b]) => {
      const key = [a.name, b.name].sort().join("\0");
      return !seen.has(key) && seen.add(key);
    });
    if (uniq.length) {
      console.log("\n" + c.yellow(`overlaps — which one gets used (${windowDays}d):`));
      for (const [a, b] of uniq.slice(0, 12)) {
        const [w, l] = a.u.recent >= b.u.recent ? [a, b] : [b, a];
        console.log(`  ${c.bold(w.name)} ${w.u.recent}× ↔ ${l.name} ${l.u.recent}×`);
      }
    }
  }

  console.log("\n" + c.yellow(`unused in ${windowDays} days (${unused.length})`) + c.dim(" — candidates to remove:"));
  if (unused.length) {
    for (const { name, u, installs } of unused) {
      const cost = u.hit ? c.dim(`  ~${kTok(u.hit.contextTokens)} tokens of context spent`) : "";
      console.log(`  ${name.padEnd(28)} ${c.dim(`${u.lastAt ? `last used ${agoText(u.lastAt)}` : "never used"} · ${[...new Set(installs.map((i) => i.tool))].join(", ")}`)}${cost}`);
    }
  } else console.log(c.dim("  none"));
  if (untracked.length) {
    console.log(c.dim(`\nnot tracked (${untracked.length}): installed only for tools without readable logs (Cursor, Grok)`));
  }
}

class UsageError extends Error {}

const [cmd, ...rest] = process.argv.slice(2);
try {
  switch (cmd) {
    case "ls": cmdLs(rest); break;
    case "where": cmdWhere(rest); break;
    case "show": cmdShow(rest); break;
    case "lock": cmdLock(rest); break;
    case "diff": cmdDiff(rest); break;
    case "pin": cmdPin(rest); break;
    case "open": cmdOpen(rest); break;
    case "usage": await cmdUsage(rest); break;
    case "-h":
    case "--help":
    case undefined:
      console.log(usage());
      break;
    default:
      throw new UsageError(`unknown command: ${cmd}`);
  }
} catch (err) {
  if (err instanceof UsageError) {
    console.error(`typecase: ${err.message}\n`);
    console.error(usage());
    process.exit(EXIT_USAGE);
  }
  console.error(`typecase: ${err?.stack ?? err}`);
  process.exit(EXIT_USAGE);
}
