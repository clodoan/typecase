// Filesystem-backed skill library: one folder (usually a checkout of the
// user's skills repo) that contains skill folders with SKILL.md files.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { sourceOf } from "./lockfile.mjs";
import { parseFrontmatter } from "./skill-text.mjs";

function walkForSkills(dir, maxDepth = 5, depth = 0, out = []) {
  if (depth > maxDepth || !existsSync(dir)) return out;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === "SKILL.md") out.push(full);
    else if (entry.isDirectory() || entry.isSymbolicLink()) walkForSkills(full, maxDepth, depth + 1, out);
  }
  return out;
}

function skillFiles(dir) {
  const files = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(path.relative(dir, full).split(path.sep).join("/"));
    }
  };
  walk(dir);
  files.sort((a, b) => (a === "SKILL.md" ? -1 : b === "SKILL.md" ? 1 : a.localeCompare(b)));
  return files;
}

function versionString(dir) {
  const source = sourceOf({ dir });
  if (source.kind === "git") return source.ref ?? source.commit?.slice(0, 7) ?? null;
  if (source.kind === "plugin") return source.version ? `v${source.version}` : null;
  return null;
}

export function createFsLibrary(libraryDir) {
  const root = path.resolve(libraryDir);

  function scan() {
    const byName = new Map();
    for (const file of walkForSkills(root)) {
      const dir = path.dirname(file);
      const raw = readFileSync(file, "utf8");
      const { frontmatter } = parseFrontmatter(raw);
      const skillName = (frontmatter.name ?? path.basename(dir)).trim();
      if (byName.has(skillName)) continue; // first install wins, like discover()
      byName.set(skillName, {
        name: skillName,
        description: (frontmatter.description ?? "").replace(/\s+/g, " ").trim(),
        version: versionString(dir),
        dir,
        text: raw,
        files: skillFiles(dir),
      });
    }
    return byName;
  }

  function find(skillName) {
    const s = scan().get(skillName);
    if (!s) throw new Error(`no skill named "${skillName}" in ${root}`);
    return s;
  }

  return {
    root,
    async list() {
      return [...scan().values()].map(({ name, description, version, files }) => ({ name, description, version, files }));
    },
    async read(skillName) {
      const { name, description, version, text, files, dir } = find(skillName);
      return { name, description, version, text, files, dir };
    },
    async readFile(skillName, rel) {
      const s = find(skillName);
      const full = path.resolve(s.dir, rel);
      if (path.relative(s.dir, full).startsWith("..") || path.isAbsolute(path.relative(s.dir, full))) {
        throw new Error(`"${rel}" is outside the ${skillName} skill folder`);
      }
      if (!s.files.includes(rel.split(path.sep).join("/"))) throw new Error(`${skillName} has no file "${rel}"`);
      return { text: readFileSync(full, "utf8") };
    },
  };
}
