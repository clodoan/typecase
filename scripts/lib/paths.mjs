import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const TOOLS = ["grok", "cursor", "claude", "codex", "shared"];

function gitRoot(from) {
  let dir = path.resolve(from);
  while (true) {
    if (existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function walkUp(cwd, rel) {
  const stop = gitRoot(cwd) ?? cwd;
  const dirs = [];
  let dir = path.resolve(cwd);
  while (true) {
    dirs.push(path.join(dir, rel));
    if (dir === stop) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dirs;
}

export function home() {
  return process.env.TYPECASE_HOME ?? homedir();
}

function subdirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

/**
 * The Cursor plugin cache keeps every downloaded revision of a plugin
 * (`cache/<marketplace>/<id>/<rev>/`), so scanning the whole cache
 * shows one copy of each skill per cached revision. Only the newest
 * revision per plugin (dir mtime) is the one Cursor serves; scan that.
 */
export function newestPluginRevisionDirs(cacheDir) {
  const newest = [];
  for (const marketplace of subdirs(cacheDir)) {
    for (const plugin of subdirs(marketplace)) {
      let best = null;
      let bestM = -Infinity;
      for (const rev of subdirs(plugin)) {
        let m;
        try {
          m = statSync(rev).mtimeMs;
        } catch {
          continue;
        }
        if (m > bestM) { bestM = m; best = rev; }
      }
      if (best) newest.push(best);
    }
  }
  return newest;
}

export function skillRoots({ cwd = process.cwd() } = {}) {
  const h = home();
  const roots = [];
  const add = (tool, scope, dir, note = "") => {
    const root = { tool, scope, dir: path.resolve(dir), note };
    roots.push(root);
    return root;
  };

  for (const dir of walkUp(cwd, ".grok/skills")) add("grok", "project", dir);
  add("grok", "user", path.join(process.env.GROK_HOME ?? path.join(h, ".grok"), "skills"));
  add("grok", "plugin", path.join(h, ".grok", "plugins"), "plugin skills/ dirs");
  add("grok", "plugin", path.join(cwd, ".grok", "plugins"), "project plugin skills/ dirs");

  for (const dir of walkUp(cwd, ".cursor/skills")) add("cursor", "project", dir);
  add("cursor", "user", path.join(h, ".cursor", "skills"));
  const cursorCache = path.join(h, ".cursor", "plugins", "cache");
  add("cursor", "plugin", cursorCache, "observed marketplace cache layout; newest revision per plugin")
    .dirs = newestPluginRevisionDirs(cursorCache);

  for (const dir of walkUp(cwd, ".claude/skills")) add("claude", "project", dir);
  add("claude", "user", path.join(h, ".claude", "skills"));
  add("claude", "plugin", path.join(h, ".claude", "plugins"), "plugin skills/ dirs");

  add("codex", "user", path.join(process.env.CODEX_HOME ?? path.join(h, ".codex"), "skills"), "recursive per docs");
  add("codex", "admin", "/etc/codex/skills");

  // Shared AGENTS.md-family dirs [AGENTS] — read by Grok, Cursor, Codex.
  for (const dir of walkUp(cwd, ".agents/skills")) add("shared", "project", dir);
  add("shared", "user", path.join(h, ".agents", "skills"));

  for (const cfg of [path.join(cwd, "typecase.json"), path.join(h, ".config", "typecase", "typecase.json")]) {
    if (!existsSync(cfg)) continue;
    try {
      const extra = JSON.parse(readFileSync(cfg, "utf8"));
      for (const p of extra.paths ?? []) {
        add(p.tool ?? "shared", p.scope ?? "user", path.resolve(path.dirname(cfg), p.dir), `from ${cfg}`);
      }
    } catch (err) {
      roots.push({ tool: "shared", scope: "user", dir: cfg, note: `config parse error: ${err.message}`, error: true });
    }
  }

  // De-duplicate identical dirs (e.g. cwd == git root).
  const seen = new Set();
  return roots.filter((r) => {
    const key = `${r.tool}:${r.dir}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
