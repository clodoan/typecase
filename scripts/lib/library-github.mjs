// GitHub-backed skill library: serves skills straight from a GitHub repo
// over the REST API. Pure fetch — no node: imports — so the same module
// runs locally and on a Cloudflare Worker.
//
// Config: repo "owner/name", optional ref (branch/tag/commit, defaults to
// the repo's default branch), optional subdir, optional token for private
// repos and higher rate limits.

import { parseFrontmatter } from "./skill-text.mjs";

const API = "https://api.github.com";

export function createGithubLibrary({ repo, ref, subdir = "", token, fetchImpl, ttlMs = 60_000 } = {}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? "")) throw new Error(`SKILLS_REPO must be "owner/repo", got: ${repo}`);
  const doFetch = fetchImpl ?? globalThis.fetch.bind(globalThis);
  const prefix = subdir ? subdir.replace(/^\/|\/$/g, "") + "/" : "";
  const cache = new Map();

  async function gh(url, { raw = false } = {}) {
    const headers = {
      accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      "user-agent": "typecase-mcp",
      "x-github-api-version": "2022-11-28",
    };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await doFetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub ${res.status} for ${url.replace(API, "")}: ${(await res.text()).slice(0, 200)}`);
    return raw ? res.text() : res.json();
  }

  async function cached(key, make) {
    const hit = cache.get(key);
    if (hit && hit.until > Date.now()) return hit.value;
    const value = await make();
    cache.set(key, { value, until: Date.now() + ttlMs });
    return value;
  }

  const resolveRef = () =>
    cached("ref", async () => ref ?? (await gh(`${API}/repos/${repo}`)).default_branch);

  const commit = () =>
    cached("commit", async () => (await gh(`${API}/repos/${repo}/commits/${await resolveRef()}`)).sha);

  const tree = () =>
    cached("tree", async () => {
      const t = await gh(`${API}/repos/${repo}/git/trees/${await commit()}?recursive=1`);
      if (t.truncated) throw new Error(`${repo} tree is too large for the GitHub tree API`);
      return t.tree.filter((e) => e.type === "blob").map((e) => e.path);
    });

  const readPath = (p) =>
    cached(`file:${p}`, async () => gh(`${API}/repos/${repo}/contents/${encodeURI(p)}?ref=${await commit()}`, { raw: true }));

  // One skill per folder that holds a SKILL.md under the configured subdir.
  const index = () =>
    cached("index", async () => {
      const paths = await tree();
      const version = (await commit()).slice(0, 7);
      const skills = new Map();
      for (const p of paths) {
        if (!p.startsWith(prefix) || !(p === `${prefix}SKILL.md` || p.endsWith("/SKILL.md"))) continue;
        const dir = p.slice(0, -"SKILL.md".length).replace(/\/$/, "");
        const text = await readPath(p);
        const { frontmatter } = parseFrontmatter(text);
        const name = (frontmatter.name ?? (dir.split("/").pop() || repo.split("/")[1])).trim();
        if (skills.has(name)) continue;
        const dirPrefix = dir ? dir + "/" : "";
        const files = paths
          .filter((x) => x.startsWith(dirPrefix) && !x.slice(dirPrefix.length).includes("node_modules/") && !x.slice(dirPrefix.length).split("/").some((seg) => seg.startsWith(".")))
          .map((x) => x.slice(dirPrefix.length))
          .sort((a, b) => (a === "SKILL.md" ? -1 : b === "SKILL.md" ? 1 : a.localeCompare(b)));
        skills.set(name, {
          name,
          description: (frontmatter.description ?? "").replace(/\s+/g, " ").trim(),
          version,
          dir,
          text,
          files,
        });
      }
      return skills;
    });

  async function find(skillName) {
    const s = (await index()).get(skillName);
    if (!s) throw new Error(`no skill named "${skillName}" in ${repo}`);
    return s;
  }

  return {
    repo,
    async list() {
      return [...(await index()).values()].map(({ name, description, version, files }) => ({ name, description, version, files }));
    },
    async read(skillName) {
      const { name, description, version, text, files } = await find(skillName);
      return { name, description, version, text, files };
    },
    async readFile(skillName, rel) {
      const s = await find(skillName);
      const clean = rel.replace(/\\/g, "/");
      if (clean.split("/").some((seg) => seg === "..") || clean.startsWith("/")) {
        throw new Error(`"${rel}" is outside the ${skillName} skill folder`);
      }
      if (!s.files.includes(clean)) throw new Error(`${skillName} has no file "${rel}"`);
      return { text: await readPath(s.dir ? `${s.dir}/${clean}` : clean) };
    },
  };
}
