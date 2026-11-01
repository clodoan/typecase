// Skill usage from the agents' own session logs, read locally.
//
// | Tool        | Log                                          | What counts as a use                         |
// | ----------- | -------------------------------------------- | -------------------------------------------- |
// | Claude Code | $CLAUDE_CONFIG_DIR/projects/<proj>/<id>.jsonl | a `Skill` tool call (agent) or a typed       |
// |             | (default ~/.claude/projects)                 | `/name` command; `skill_listing` records say |
// |             |                                              | which skills the session was offered         |
// | Codex       | $CODEX_HOME/sessions/**/*.jsonl              | a tool call whose arguments name a skill's   |
// |             | (default ~/.codex/sessions)                  | SKILL.md (Codex loads a skill by reading it) |
//
// Neither format is documented; both are observed and may change. Lines
// that don't parse, or records of a shape we don't know, are skipped.
//
// Only skill names, timestamps, the session id and its working directory
// are kept. Message text never leaves the log file. The cache
// (~/.cache/typecase/usage.json) keeps sessions after the agent deletes
// its own old logs, so history outlasts the agents' retention windows.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { home } from "./paths.mjs";
import { skillNameOf } from "./usage-stats.mjs";

const CACHE_VERSION = 1;

export function usageCachePath() {
  return process.env.TYPECASE_USAGE_CACHE ?? path.join(home(), ".cache", "typecase", "usage.json");
}

export function logSources() {
  const h = home();
  return [
    { tool: "claude", dir: path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(h, ".claude"), "projects"), parse: parseClaudeSession },
    { tool: "codex", dir: path.join(process.env.CODEX_HOME ?? path.join(h, ".codex"), "sessions"), parse: parseCodexSession },
  ];
}

function tryJSON(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

const TIMESTAMP_RE = /"timestamp":"([^"]+)"/;
const CWD_RE = /"cwd":"((?:[^"\\]|\\.)*)"/;

function sessionFrame(lines) {
  const first = lines.find((l) => TIMESTAMP_RE.test(l));
  const last = lines.findLast((l) => TIMESTAMP_RE.test(l));
  const cwdLine = lines.find((l) => CWD_RE.test(l));
  return {
    start: first ? first.match(TIMESTAMP_RE)[1] : null,
    end: last ? last.match(TIMESTAMP_RE)[1] : null,
    cwd: cwdLine ? tryJSON(`"${cwdLine.match(CWD_RE)[1]}"`) : null,
  };
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => (c?.type === "text" ? c.text : "")).join("\n");
  return "";
}

/**
 * One Claude Code transcript → { listed, uses }. `listed` is null when the
 * session carried no skill listing (sub-agent logs, older versions), so it
 * stays out of hit-rate math instead of counting as "offered, not used".
 */
export function parseClaudeSession(text, { sidechain = false } = {}) {
  const lines = text.split("\n");
  const listed = new Set();
  const uses = [];
  for (const line of lines) {
    // Cheap prefilter: transcripts are large and almost every line is
    // irrelevant. Only these three record kinds matter.
    if (!line.includes('"Skill"') && !line.includes("skill_listing") && !line.includes("command-name")) continue;
    const d = tryJSON(line);
    if (!d) continue;
    if (d.type === "attachment" && d.attachment?.type === "skill_listing" && typeof d.attachment.content === "string") {
      for (const m of d.attachment.content.matchAll(/^- (\S+?)(?: \(|: |$)/gm)) listed.add(skillNameOf(m[1]));
    } else if (d.type === "assistant" && Array.isArray(d.message?.content)) {
      for (const c of d.message.content) {
        if (c?.type === "tool_use" && c.name === "Skill" && typeof c.input?.skill === "string") {
          uses.push({ name: skillNameOf(c.input.skill), at: d.timestamp ?? null, how: "agent" });
        }
      }
    } else if (d.type === "user" && !d.toolUseResult) {
      // A typed `/name` loads the skill directly, without a Skill tool call,
      // so the two never double-count. Built-ins (/clear, /help) are
      // dropped later because no installed skill has their name.
      const m = textOf(d.message?.content).match(/<command-name>\/?([^<\s]+)<\/command-name>/);
      if (m) uses.push({ name: skillNameOf(m[1]), at: d.timestamp ?? null, how: "typed" });
    }
  }
  return { ...sessionFrame(lines), listed: sidechain || !listed.size ? null : [...listed], uses };
}

const SKILL_PATH_RE = /((?:~|\.{1,2}|[A-Za-z]:)?[^\s"'`\\]*[\\/])([^\s"'`\\/]+)[\\/]SKILL\.md/g;

/**
 * One Codex session log → { listed: null, uses }. Codex lists skills (with
 * their paths) in its instructions, so a path anywhere in the log means
 * nothing; only a tool call that reads the file is a use.
 */
export function parseCodexSession(text) {
  const lines = text.split("\n");
  const uses = [];
  for (const line of lines) {
    if (!line.includes("SKILL.md")) continue;
    const d = tryJSON(line);
    const payload = d?.payload ?? d;
    const kind = String(payload?.type ?? "");
    if (!kind.endsWith("_call") || kind.endsWith("_output")) continue;
    const raw = payload.arguments ?? payload.action ?? payload.input ?? payload;
    const args = typeof raw === "string" ? raw : JSON.stringify(raw);
    const seen = new Set();
    for (const m of args.replaceAll("\\\\", "/").matchAll(SKILL_PATH_RE)) {
      const p = `${m[1]}${m[2]}/SKILL.md`;
      if (seen.has(p)) continue;
      seen.add(p);
      uses.push({ name: m[2], path: p, at: d.timestamp ?? null, how: "read" });
    }
  }
  return { ...sessionFrame(lines), listed: null, uses };
}

function walkJsonl(dir, depth = 0, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && depth < 6) walkJsonl(full, depth + 1, out);
    else if (e.isFile() && e.name.endsWith(".jsonl")) out.push({ file: full, depth });
  }
  return out;
}

function readCache(cachePath) {
  try {
    const cache = JSON.parse(readFileSync(cachePath, "utf8"));
    if (cache.version === CACHE_VERSION && cache.sessions) return cache;
  } catch {}
  return { version: CACHE_VERSION, sessions: {} };
}

/**
 * Scan every log source, reparsing only files whose size or mtime changed
 * since the cached copy. Sessions whose log has since been deleted stay
 * in the cache. Yields to the event loop between files so the Electron
 * main process keeps answering while a first scan runs.
 */
export async function scanUsage({ cachePath = usageCachePath(), sources = logSources(), write = true } = {}) {
  const cache = readCache(cachePath);
  let dirty = false;
  const scanned = [];
  for (const src of sources) {
    const files = existsSync(src.dir) ? walkJsonl(src.dir) : [];
    scanned.push({ tool: src.tool, dir: src.dir, exists: existsSync(src.dir), files: files.length });
    for (const { file, depth } of files) {
      let st;
      try {
        st = statSync(file);
      } catch {
        continue;
      }
      const prev = cache.sessions[file];
      if (prev && prev.size === st.size && prev.mtimeMs === st.mtimeMs) continue;
      let text;
      try {
        text = await readFile(file, "utf8");
      } catch {
        continue;
      }
      // Claude Code keeps sub-agent logs in a folder next to the session.
      const sidechain = src.tool === "claude" && depth > 1;
      const parsed = src.parse(text, { sidechain });
      cache.sessions[file] = {
        tool: src.tool,
        id: path.basename(file, ".jsonl"),
        size: st.size,
        mtimeMs: st.mtimeMs,
        sidechain,
        ...parsed,
        start: parsed.start ?? new Date(st.mtimeMs).toISOString(),
      };
      dirty = true;
    }
  }
  if (dirty && write) {
    mkdirSync(path.dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, JSON.stringify(cache) + "\n");
  }
  return { sources: scanned, sessions: Object.values(cache.sessions) };
}
