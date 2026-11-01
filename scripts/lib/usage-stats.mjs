// Usage metrics from scanned session logs (see usage.mjs). Pure: no fs, so
// the desktop renderer bundles it too.

export const DAY = 86_400_000;
export const WINDOW_DAYS = 30;

// Which installs each log can speak for. Cursor and Grok keep no log we
// can read, so a skill installed only for them is "not tracked", never
// "unused".
export const TRACKED = { claude: ["claude"], codex: ["codex", "shared"] };
export const LOG_LABEL = { claude: "Claude Code", codex: "Codex" };

/** `plugin:skill`, `apps/web:deploy`, `/skill` → `skill`. */
export function skillNameOf(ref) {
  const s = String(ref).trim().replace(/^\//, "");
  return s.slice(s.lastIndexOf(":") + 1);
}

const k = (tool, name) => `${tool}\u0000${name}`;

/**
 * Flatten scanned sessions into what the metrics need, small enough to
 * hand to the renderer: one row per use, plus per-skill counts of the
 * sessions that offered it and the ones of those that used it.
 */
export function indexUsage(scan) {
  const uses = [];
  const offered = {};
  const sources = scan.sources.map((s) => ({ ...s, sessions: 0, since: null }));
  for (const sess of scan.sessions) {
    const src = sources.find((s) => s.tool === sess.tool);
    if (src && !sess.sidechain) {
      src.sessions++;
      if (sess.start && (!src.since || sess.start < src.since)) src.since = sess.start;
    }
    const usedHere = new Set();
    for (const u of sess.uses) {
      const at = Date.parse(u.at ?? sess.start) || 0;
      uses.push({ name: u.name, tool: sess.tool, at, how: u.how, session: sess.id, ...(u.path ? { path: u.path } : {}) });
      usedHere.add(u.name);
    }
    for (const name of sess.listed ?? []) {
      const o = (offered[k(sess.tool, name)] ??= { offered: 0, used: 0 });
      o.offered++;
      if (usedHere.has(name)) o.used++;
    }
  }
  uses.sort((a, b) => a.at - b.at);
  return { sources, uses, offered };
}

const trackedBy = (log, tools) => TRACKED[log].some((t) => tools.has(t));

/**
 * Metrics for one skill, given every install of it (same name, any tool).
 * Returns { tracked: false } when no readable log covers any install.
 */
export function skillUsage(index, installs, { now = Date.now(), windowDays = WINDOW_DAYS } = {}) {
  const name = installs[0].name;
  // Agents may name a skill by its folder rather than its frontmatter name
  // (Claude Code's listing does), so either one counts.
  const names = new Set([name, ...installs.map((i) => (i.dir ?? "").split(/[\\/]/).pop()).filter(Boolean)]);
  const tools = new Set(installs.map((i) => i.tool));
  const paths = new Set(installs.map((i) => i.path));
  const logs = index.sources.filter((s) => s.sessions > 0 && trackedBy(s.tool, tools)).map((s) => s.tool);
  const untracked = [...tools].filter((t) => !Object.values(TRACKED).flat().includes(t));
  if (!logs.length) return { tracked: false, untracked };

  const uses = index.uses.filter((u) => logs.includes(u.tool) && (names.has(u.name) || (u.path && paths.has(u.path))));
  const since = now - windowDays * DAY;
  const recent = uses.filter((u) => u.at >= since).length;
  const how = { agent: 0, typed: 0, read: 0 };
  const byLog = Object.fromEntries(logs.map((l) => [l, 0]));
  for (const u of uses) {
    how[u.how]++;
    byLog[u.tool]++;
  }

  // Hit rate: Claude Code records which skills each session was offered.
  const o = logs.includes("claude")
    ? [...names].map((n) => index.offered[k("claude", n)]).find(Boolean)
    : null;
  const rep = installs[0];
  const listingTokens = Math.ceil(`- ${name}: ${rep.description ?? ""}`.length / 4);
  const hit = o?.offered
    ? { offered: o.offered, used: o.used, rate: o.used / o.offered, listingTokens, contextTokens: listingTokens * o.offered }
    : null;

  // Uses in equal windows either side of the last edit, so the two counts
  // compare directly. Needs a few days of log on each side.
  const editedAt = Math.max(...installs.map((i) => i.mtimeMs ?? 0));
  const coverage = Math.min(...index.sources.filter((s) => logs.includes(s.tool) && s.since).map((s) => Date.parse(s.since)));
  let edit = null;
  const span = Math.min(windowDays * DAY, editedAt - coverage, now - editedAt);
  if (editedAt && span >= 3 * DAY) {
    edit = {
      editedAt,
      days: Math.round(span / DAY),
      before: uses.filter((u) => u.at >= editedAt - span && u.at < editedAt).length,
      after: uses.filter((u) => u.at >= editedAt && u.at < editedAt + span).length,
    };
  }

  return {
    tracked: true,
    logs,
    untracked,
    total: uses.length,
    recent,
    windowDays,
    lastAt: uses.length ? uses[uses.length - 1].at : null,
    unused: recent === 0,
    how,
    byLog,
    hit,
    edit,
  };
}

export function agoText(ms, now = Date.now()) {
  if (ms == null) return "never";
  const d = Math.floor((now - ms) / DAY);
  if (d <= 0) return "today";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}
