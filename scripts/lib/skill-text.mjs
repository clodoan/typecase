// Pure text helpers shared by the Node CLI and the Cloudflare Worker.
// No node: imports here — this module must run on Workers as-is.

/** Minimal YAML subset: `key: value`, `key: >-` folded blocks, lists. */
export function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { frontmatter: {}, body: text };
  const fm = {};
  const lines = m[1].split(/\r?\n/);
  let key = null;
  let folded = false;
  for (const line of lines) {
    const kv = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (kv && !line.startsWith(" ")) {
      key = kv[1].toLowerCase();
      const value = kv[2].trim();
      folded = value === ">-" || value === ">" || value === "|" || value === "|-";
      fm[key] = folded ? "" : value.replace(/^["']|["']$/g, "");
    } else if (key && (line.startsWith("  ") || line.trim() === "")) {
      const chunk = line.trim();
      if (chunk.startsWith("- ")) {
        fm[key] = (fm[key] ? fm[key] + "; " : "") + chunk.slice(2);
      } else if (chunk) {
        fm[key] = (fm[key] ? fm[key] + " " : "") + chunk;
      }
    }
  }
  return { frontmatter: fm, body: text.slice(m[0].length) };
}

/** MCP prompt names: letters, digits, _ and - only. */
export function promptName(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "skill";
}
