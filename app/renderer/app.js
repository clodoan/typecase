/* Typecase renderer. All data comes from the main process over the
   preload bridge; this file is pure presentation + navigation state.

   Rendering discipline: every derived set (changed keys, overlap paths,
   name collisions, per-group flags, sidebar counts) is computed ONCE
   per data payload into `model`. Lists render as single HTML strings
   with one delegated listener per surface. A state change re-renders
   only the surface it affects; the sidebar is built once per payload
   and only its active highlight is synced afterwards. */

const TOOLS = [
  { id: "grok", label: "Grok" },
  { id: "cursor", label: "Cursor" },
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "shared", label: "Shared" },
];
const SCOPES = [
  { id: "user", label: "User" },
  { id: "project", label: "Project" },
  { id: "plugin", label: "Plugin" },
];

const TOOL_ICONS = {
  grok: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M3 13 13 3M9.5 3H13v3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cursor: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M4 2.5 12.5 8 8.3 9.1 6.4 13.5Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  claude: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M8 2v12M3 5l10 6M13 5 3 11" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  codex: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="m3 4.5 4 3.5-4 3.5M8.5 12H13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  shared: '<svg viewBox="0 0 16 16" width="13" height="13"><circle cx="5.5" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="10.5" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
};
const LIB_ICONS = {
  all: '<svg viewBox="0 0 16 16" width="13" height="13"><rect x="2.5" y="2.5" width="11" height="11" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  active: '<svg viewBox="0 0 16 16" width="13" height="13"><circle cx="8" cy="8" r="5.3" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>',
  changed: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M13 8A5 5 0 1 1 8 3h3M9 1l2.2 2L9 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  overlaps: '<svg viewBox="0 0 16 16" width="13" height="13"><circle cx="6" cy="8" r="3.8" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="10" cy="8" r="3.8" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
};

let data = null;
let model = null;
const state = {
  library: "all",       // all | active | changed | overlaps
  tool: null,
  scope: null,
  collection: null,     // root dir
  chips: { risky: false, overlaps: false, changed: false },
  density: "cozy",
  theme: localStorage.getItem("typecase-theme") || "system",
  view: "grid",         // grid | detail
  groupKey: null,
  tab: "rendered",
  showFrontmatter: false,
  focusIndex: -1,
};

const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const keyOf = (s) => `${s.tool}:${s.scope}:${s.name}:${s.path}`;
const lockKeyOf = (s) => `${s.tool}:${s.scope}:${s.name}`; // matches lockfile.mjs keyOf

const darkMQ = matchMedia("(prefers-color-scheme: dark)");
const THEME_ICONS = {
  system: '<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 2.8v10.4A5.2 5.2 0 0 0 8 2.8Z" fill="currentColor"/></svg>',
  light: '<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="3.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.2v2M8 12.8v2M1.2 8h2M12.8 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M12.8 3.2l-1.4 1.4M4.6 11.4l-1.4 1.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  dark: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M13 9.6A5.6 5.6 0 0 1 6.4 3a5.6 5.6 0 1 0 6.6 6.6Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
};

function applyTheme() {
  const resolved = state.theme === "system" ? (darkMQ.matches ? "dark" : "light") : state.theme;
  document.documentElement.dataset.theme = resolved;
  localStorage.setItem("typecase-theme", state.theme);
  const btn = $("#theme-btn");
  btn.innerHTML = THEME_ICONS[state.theme];
  btn.title = `Theme: ${state.theme}`;
}
darkMQ.addEventListener("change", () => { if (state.theme === "system") applyTheme(); });

/* ---------- model: derived once per data payload ---------- */

function buildModel() {
  const skills = data.skills;
  const changedKeys = new Set((data.changes ?? []).filter((c) => c.status !== "removed").map((c) => c.key));
  const changeByKey = new Map((data.changes ?? []).map((c) => [c.key, c]));
  const overlapPaths = new Set();
  for (const o of data.overlaps) { overlapPaths.add(o.a.path); overlapPaths.add(o.b.path); }
  const collisionNames = new Set(data.duplicates.filter((d) => !d.identical).map((d) => d.name));
  const overlapsBySkillPath = new Map();
  for (const o of data.overlaps) {
    for (const end of [o.a.path, o.b.path]) {
      if (!overlapsBySkillPath.has(end)) overlapsBySkillPath.set(end, []);
      overlapsBySkillPath.get(end).push(o);
    }
  }

  const groups = [];
  for (const idxs of data.displayGroups ?? skills.map((_, i) => [i])) {
    const installs = idxs.map((i) => skills[i]);
    const rep = installs[0];
    if (rep.error) continue;
    groups.push({
      key: keyOf(rep),
      rep,
      installs,
      copies: installs.length,
      changed: installs.some((s) => changedKeys.has(lockKeyOf(s))),
      overlap: installs.some((s) => overlapPaths.has(s.path)),
      collision: collisionNames.has(rep.name),
      risky: rep.riskyTools.length > 0,
      tools: [...new Set(installs.map((s) => s.tool))],
      scopes: [...new Set(installs.map((s) => s.scope))],
      roots: [...new Set(installs.map((s) => s.root))],
    });
  }
  groups.sort((a, b) => a.rep.name.localeCompare(b.rep.name));

  const count = (pred) => groups.reduce((n, g) => n + (pred(g) ? 1 : 0), 0);
  return {
    groups,
    byKey: new Map(groups.map((g) => [g.key, g])),
    changeByKey,
    overlapsBySkillPath,
    counts: {
      all: groups.length,
      changed: count((g) => g.changed),
      overlaps: count((g) => g.overlap),
      tools: new Map(TOOLS.map((t) => [t.id, count((g) => g.tools.includes(t.id))])),
      scopes: new Map(SCOPES.map((sc) => [sc.id, count((g) => g.scopes.includes(sc.id))])),
      roots: new Map(data.roots.filter((r) => r.exists).map((r) => [r.dir, count((g) => g.roots.includes(r.dir))])),
    },
  };
}

function visibleGroups() {
  let out = model.groups;
  if (state.library === "changed") out = out.filter((g) => g.changed);
  if (state.library === "overlaps") out = out.filter((g) => g.overlap);
  if (state.tool) out = out.filter((g) => g.tools.includes(state.tool));
  if (state.scope) out = out.filter((g) => g.scopes.includes(state.scope));
  if (state.collection) out = out.filter((g) => g.roots.includes(state.collection));
  if (state.chips.risky) out = out.filter((g) => g.risky);
  if (state.chips.overlaps) out = out.filter((g) => g.overlap);
  if (state.chips.changed) out = out.filter((g) => g.changed);
  return out;
}

/** The install whose tool/scope/root matches the active filter. */
function repFor(g) {
  if (state.tool) return g.installs.find((s) => s.tool === state.tool) ?? g.rep;
  if (state.scope) return g.installs.find((s) => s.scope === state.scope) ?? g.rep;
  if (state.collection) return g.installs.find((s) => s.root === state.collection) ?? g.rep;
  return g.rep;
}

function fuzzyScore(query, s) {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const name = s.name.toLowerCase();
  const hay = `${s.description ?? ""} ${s.triggers ?? ""}`.toLowerCase();
  if (name === q) return 100;
  if (name.includes(q)) return 60 - name.indexOf(q);
  // subsequence on name
  let i = 0;
  for (const ch of name) if (ch === q[i]) i++;
  if (i === q.length) return 30;
  if (hay.includes(q)) return 15;
  const words = q.split(/\s+/);
  const hits = words.filter((w) => hay.includes(w) || name.includes(w)).length;
  return hits === words.length ? 8 : hits > 0 ? 2 : -1;
}

/* ---------- sidebar: built once per payload, active state synced ---------- */

function navButton({ nav, icon, label, count, special }) {
  return `<button class="nav-item${special ? " special" : ""}" data-nav="${esc(nav)}">
    ${icon ?? ""}<span>${esc(label)}</span>${count != null ? `<span class="count">${count}</span>` : ""}
  </button>`;
}

function renderSidebar() {
  const { counts } = model;
  let html = `<div class="nav-heading">Library</div>`;
  const lib = [
    { id: "all", label: "All Skills", count: counts.all },
    { id: "active", label: "Active", count: counts.all },
    { id: "changed", label: "Changed since lock", count: counts.changed, special: true },
    { id: "overlaps", label: "Overlaps", count: counts.overlaps, special: true },
  ];
  for (const l of lib) {
    html += navButton({ nav: `lib:${l.id}`, icon: LIB_ICONS[l.id], label: l.label, count: l.count, special: l.special });
  }

  html += `<div class="nav-heading">Tools</div>`;
  for (const t of TOOLS) {
    const count = counts.tools.get(t.id) ?? 0;
    if (!count && t.id === "shared") continue;
    html += navButton({ nav: `tool:${t.id}`, icon: TOOL_ICONS[t.id], label: t.label, count });
  }

  html += `<div class="nav-heading">Collections</div>`;
  for (const r of data.roots.filter((x) => x.exists && (counts.roots.get(x.dir) ?? 0) > 0)) {
    const short = r.dir.replace(data.cwd, "·").replace(/^\/(home|Users)\/[^/]+/, "~");
    html += navButton({ nav: `root:${r.dir}`, icon: TOOL_ICONS[r.tool] ?? LIB_ICONS.all, label: short, count: counts.roots.get(r.dir) });
  }

  html += `<div class="nav-heading">Sources</div>`;
  for (const sc of SCOPES) {
    html += navButton({ nav: `scope:${sc.id}`, icon: LIB_ICONS.active, label: sc.label, count: counts.scopes.get(sc.id) ?? 0 });
  }

  $("#sidenav").innerHTML = html;
  syncSidebar();
}

function syncSidebar() {
  for (const el of document.querySelectorAll("#sidenav .nav-item")) {
    const [kind, ...restParts] = el.dataset.nav.split(":");
    const id = restParts.join(":");
    let active = false;
    if (kind === "lib") active = state.library === id && !state.tool && !state.scope && !state.collection;
    else if (kind === "tool") active = state.tool === id;
    else if (kind === "root") active = state.collection === id;
    else if (kind === "scope") active = state.scope === id;
    el.classList.toggle("active", active);
  }
}

$("#sidenav").addEventListener("click", (e) => {
  const item = e.target.closest(".nav-item");
  if (!item) return;
  const [kind, ...restParts] = item.dataset.nav.split(":");
  const id = restParts.join(":");
  Object.assign(state, { view: "grid", groupKey: null, tab: "rendered", focusIndex: -1 });
  if (kind === "lib") Object.assign(state, { library: id, tool: null, scope: null, collection: null });
  else if (kind === "tool") Object.assign(state, { library: "all", tool: id, scope: null, collection: null });
  else if (kind === "root") Object.assign(state, { library: "all", tool: null, scope: null, collection: id });
  else if (kind === "scope") Object.assign(state, { library: "all", tool: null, scope: id, collection: null });
  syncSidebar();
  renderContent();
});

/* ---------- rows ---------- */

function toolLabel(id) { return TOOLS.find((t) => t.id === id)?.label ?? id; }

function badgesHtml(g) {
  const out = [];
  if (g.copies > 1) out.push(`<span class="badge copies">×${g.copies}</span>`);
  if (g.risky) out.push('<span class="badge risky">risky</span>');
  if (g.collision) out.push('<span class="badge dup">dup</span>');
  else if (g.overlap) out.push('<span class="badge overlap">overlap</span>');
  if (g.changed) out.push('<span class="badge changed">changed</span>');
  return out.join("");
}

/* Row elements are built ONCE per data payload; filtering and
   navigation toggle visibility on the cached nodes instead of
   re-parsing thousands of nodes per interaction. */
let rowsCache = null; // { wrapEl, headEl, subEl, listEl, emptyEl, byKey }

function buildRowsCache() {
  // Compact single-line rows: shared <use> icons and no inter-tag
  // whitespace keep the one-time parse cost of large lists low.
  let rows = "";
  for (const g of model.groups) {
    const rep = g.rep;
    rows += `<div class="skill-row" tabindex="0" data-key="${esc(g.key)}">` +
      `<span class="r-name">${esc(rep.name)}</span>` +
      `<span class="r-desc">${esc(rep.description || "—")}</span>` +
      `<span class="r-badges">${badgesHtml(g)}</span>` +
      `<span class="r-tool"><svg viewBox="0 0 16 16" width="13" height="13"><use href="#ti-${esc(rep.tool)}"/></svg><span></span></span>` +
      `<span class="r-tok">~${rep.tokens}</span></div>`;
  }
  const wrapEl = document.createElement("div");
  wrapEl.innerHTML =
    `<div class="count-head"><h1></h1><span class="sub"></span></div>` +
    `<div class="rows-list" id="rows">${rows}<div class="empty-hint" hidden></div></div>`;
  const byKey = new Map();
  for (const el of wrapEl.querySelectorAll(".skill-row")) byKey.set(el.dataset.key, el);
  rowsCache = {
    wrapEl,
    headEl: wrapEl.querySelector("h1"),
    subEl: wrapEl.querySelector(".sub"),
    listEl: wrapEl.querySelector("#rows"),
    emptyEl: wrapEl.querySelector(".empty-hint"),
    byKey,
  };
}

function renderRows() {
  if (!rowsCache) buildRowsCache();
  const { wrapEl, headEl, subEl, listEl, emptyEl, byKey } = rowsCache;
  const groups = visibleGroups();
  const visible = new Set(groups.map((g) => g.key));

  for (const [key, el] of byKey) el.hidden = !visible.has(key);
  for (const g of groups) {
    const el = byKey.get(g.key);
    el.classList.remove("focused");
    const rep = repFor(g);
    const cell = g.tools.length === 1
      ? `${toolLabel(rep.tool)} · ${rep.scope}`
      : g.tools.map(toolLabel).join(" · ");
    const cellEl = el.querySelector(".r-tool span");
    if (cellEl.textContent !== cell) cellEl.textContent = cell;
  }

  headEl.textContent = `${groups.length} Skill${groups.length === 1 ? "" : "s"}`;
  subEl.textContent =
    state.tool ? toolLabel(state.tool)
    : state.scope ? SCOPES.find((s) => s.id === state.scope).label
    : state.collection ? "Collection"
    : state.library === "changed" ? "Changed since lock"
    : state.library === "overlaps" ? "Overlapping"
    : "All";
  emptyEl.hidden = groups.length > 0;
  if (!groups.length) {
    emptyEl.innerHTML = `Nothing here. ${
      state.library === "changed" ? "Run <code>typecase lock</code>, edit a skill, and changes will appear." : "Try clearing filters."
    }`;
  }
  listEl.classList.toggle("compact", state.density === "compact");

  const content = $("#content");
  if (wrapEl.parentNode !== content) content.replaceChildren(wrapEl);
  $("#segmented-wrap").hidden = true;
}

/* ---------- detail ---------- */

function openDetail(key) {
  state.view = "detail";
  state.groupKey = key;
  state.tab = "rendered";
  state.showFrontmatter = false;
  renderContent();
}

function closeDetail() {
  state.view = "grid";
  state.groupKey = null;
  renderContent();
}

function row(label, valueHtml, muted = false) {
  return valueHtml
    ? `<div class="row"><div class="label">${esc(label)}</div><div class="value${muted ? " muted" : ""}">${valueHtml}</div></div>`
    : "";
}

function renderDetail() {
  const g = model.byKey.get(state.groupKey);
  if (!g) { closeDetail(); return; }
  const s = repFor(g);

  $("#content").innerHTML = `<div class="detail">
    <div class="detail-top">
      <button class="back-btn" data-action="back">‹ Skills</button>
      <div class="spacer"></div>
      <button class="icon-btn${state.showFrontmatter ? " active" : ""}" data-action="toggle-fm" title="Raw frontmatter">i</button>
    </div>
    <div class="detail-hero">${esc(s.name)}</div>
    <div class="detail-sub">${esc(s.description || "")}</div>
    <div class="detail-badges">${badgesHtml(g)}</div>
    ${state.showFrontmatter ? `<div class="frontmatter-pop">${esc(JSON.stringify(s.frontmatter, null, 2))}</div>` : ""}
    <div id="tab-body"></div>
  </div>`;

  const body = $("#tab-body");
  if (state.tab === "rendered") renderTabRendered(body, g, s);
  else if (state.tab === "source") renderTabSource(body, s);
  else renderTabHistory(body, g, s);

  const seg = $("#segmented-wrap");
  seg.hidden = false;
  for (const b of seg.querySelectorAll("button"))
    b.classList.toggle("active", b.dataset.tab === state.tab);
}

function renderTabRendered(body, g, s) {
  const whenUse = s.sections.find((x) => /when to use|^use/i.test(x.heading))?.text ?? "";
  const toolChips = s.commands.map((c) => {
    const risky = s.riskyTools.some((r) => c.includes(r) || r.includes(c.split(/\s/)[0]));
    return `<span class="tool-chip${risky ? " risky" : ""}">${esc(c)}${risky ? " ⚠" : ""}</span>`;
  }).join("");
  const riskyOnly = s.riskyTools
    .filter((r) => !s.commands.some((c) => c.includes(r)))
    .map((r) => `<span class="tool-chip risky">${esc(r)} ⚠</span>`).join("");
  const myOverlaps = g.installs.flatMap((inst) => model.overlapsBySkillPath.get(inst.path) ?? []);
  const overlapLinks = myOverlaps.map((o) => {
    const other = g.installs.some((inst) => inst.path === o.a.path) ? o.b : o.a;
    const otherGroup = model.groups.find((x) => x.installs.some((inst) => inst.path === other.path));
    return `<li><a class="link-skill" data-action="goto" data-key="${esc(otherGroup?.key ?? "")}">${esc(other.name)}</a> <span class="mono" style="color:var(--ink-3)">(${Math.round(o.score * 100)}% shared vocabulary, ${esc(other.tool)})</span></li>`;
  }).join("");
  const collision = data.duplicates.find((d) => !d.identical && d.name === s.name);
  const dupLine = collision
    ? `<li>Same name, different content in ${collision.installs.filter((i) => i.path !== s.path).map((i) => `${esc(i.tool)} · ${esc(i.scope)}`).join(", ")}</li>`
    : "";

  const lockEntry = data.lock?.skills?.[lockKeyOf(s)];
  const lockHtml = lockEntry
    ? `locked <span class="mono">${esc(lockEntry.hash.slice(0, 12))}</span>${lockEntry.hash === s.hash ? " · unchanged" : ` · now <span class="mono">${esc(s.hash.slice(0, 12))}</span> (drifted)`}${lockEntry.source?.kind === "git" ? ` · ${esc(lockEntry.source.remote ?? "git")}@${esc((lockEntry.source.commit ?? "").slice(0, 7))}` : lockEntry.source?.version ? ` · v${esc(lockEntry.source.version)}` : ""}`
    : `not locked — run <code>typecase lock</code>`;

  const paths = g.installs.map((inst) => `
    <li class="path-row"><span class="mono">${esc(inst.path)}</span>
      <button class="mini-btn" data-action="reveal" data-path="${esc(inst.path)}">Reveal in Finder</button>
    </li>`).join("");

  body.innerHTML = `
    <div class="rows">
      ${row("Triggers", esc(s.triggers) || null)}
      ${whenUse ? row("When to use", esc(whenUse)) : ""}
      ${row("When not to use", s.whenNot ? esc(s.whenNot) : "<span class='value muted'>not declared</span>")}
      ${row("Tools it can call", toolChips || riskyOnly ? `<div class="tool-chips">${toolChips}${riskyOnly}</div>` : "<span class='value muted'>none mentioned</span>")}
      ${row("Files referenced", s.files.length ? `<ul>${s.files.map((f) => `<li class="mono">${esc(f)}</li>`).join("")}</ul>` : "<span class='value muted'>none</span>")}
      ${row(g.copies > 1 ? `Path (×${g.copies} identical installs)` : "Path", `<ul>${paths}</ul><button class="mini-btn" data-action="editor" data-dir="${esc(s.dir)}">Open in Cursor</button>`)}
      ${(overlapLinks || dupLine) ? row("Overlaps with", `<ul>${dupLine}${overlapLinks}</ul>`) : ""}
      ${row("Version / lock", lockHtml)}
      ${row("Size", `~${s.tokens} tokens · ${s.sections.length} sections`)}
    </div>`;
}

async function renderTabSource(body, s) {
  body.innerHTML = `<div class="source-block">Loading…</div>`;
  try {
    const raw = await window.typecase.raw(s.path);
    body.querySelector(".source-block").textContent = raw;
  } catch (e) {
    body.querySelector(".source-block").textContent = `Could not read ${s.path}: ${e.message}`;
  }
}

function diffItemHtml(c) {
  switch (c.kind) {
    case "section-added": return `<li class="added">New section “${esc(c.heading)}”</li>`;
    case "section-removed": return `<li class="removed">Section “${esc(c.heading)}” removed</li>`;
    case "section-changed": return `<li class="changed">Section “${esc(c.heading)}” rewritten</li>`;
    case "description": return `<li class="changed">Description changed</li>`;
    case "triggers": return `<li class="changed">Triggers changed</li>`;
    case "when-not": return `<li class="changed">“When not to use” changed</li>`;
    case "commands": return `<li class="changed">Commands: ${c.added?.length ? `+${c.added.map(esc).join(", ")}` : ""} ${c.removed?.length ? `−${c.removed.map(esc).join(", ")}` : ""}</li>`;
    case "risky-tools": return `<li class="removed">Risky tools: ${c.added?.length ? `+${c.added.map(esc).join(", ")}` : ""} ${c.removed?.length ? `−${c.removed.map(esc).join(", ")}` : ""}</li>`;
    case "files": return `<li class="changed">Files referenced: ${(c.added ?? []).length} added, ${(c.removed ?? []).length} removed</li>`;
    default: return `<li>${esc(c.kind)}</li>`;
  }
}

function renderTabHistory(body, g, s) {
  // Prefer the install that actually changed; identical copies share
  // content but may be locked under different keys.
  const changedInstall = g.installs.find((inst) => model.changeByKey.has(lockKeyOf(inst))) ?? s;
  const change = model.changeByKey.get(lockKeyOf(changedInstall));
  const lockEntry = data.lock?.skills?.[lockKeyOf(changedInstall)] ?? data.lock?.skills?.[lockKeyOf(s)];

  let html = "";
  if (!data.lock) {
    html = `<div class="empty-hint">No <code>skills.lock</code> in ${esc(data.cwd)} yet. Run <code>typecase lock</code> to pin every installed skill, then this tab shows what changed and why it matters.</div>`;
  } else {
    if (change) {
      html += `<div class="history-entry">
        <h3>Since lock <span class="hash">${esc(change.fromHash ?? "")}${change.toHash ? " → " + esc(change.toHash) : ""}</span></h3>
        <div class="para">${esc((change.paragraph ?? "").replace(/\*\*/g, ""))}</div>
        ${change.changes?.length ? `<ul class="diff-list">${change.changes.map(diffItemHtml).join("")}</ul>` : ""}
      </div>`;
    } else {
      html += `<div class="empty-hint">Unchanged since lock${lockEntry ? ` (<span class="mono">${esc(lockEntry.hash.slice(0, 12))}</span>, ${esc(new Date(data.lock.generatedAt).toLocaleString())})` : ""}.</div>`;
    }
    if (lockEntry) {
      html += `<div class="history-entry">
        <h3>Locked version <span class="hash">${esc(lockEntry.hash.slice(0, 12))}</span></h3>
        <div class="para">Pinned ${esc(new Date(data.lock.generatedAt).toLocaleString())} · ${
          lockEntry.source?.kind === "git"
            ? `from ${esc(lockEntry.source.remote ?? "git")} @ ${esc((lockEntry.source.commit ?? "").slice(0, 7))}`
            : lockEntry.source?.version ? `plugin v${esc(lockEntry.source.version)}` : "local install"
        } · ~${lockEntry.tokens} tokens. Restore with <code>typecase pin ${esc(s.name)}</code>.</div>
      </div>`;
    }
  }
  const relevant = (data.changelog || "")
    .split(/^## /m).slice(1)
    .filter((block) => block.includes(`**${s.name}**`))
    .map((block) => {
      const [date, ...lines] = block.split("\n");
      const mine = lines.filter((l) => l.includes(`**${s.name}**`)).map((l) => l.replace(/^- /, ""));
      return `<div class="history-entry"><h3>${esc(date.trim())}</h3>${mine.map((m) => `<div class="para">${esc(m.replace(/\*\*/g, ""))}</div>`).join("")}</div>`;
    }).join("");
  if (relevant) html += relevant;
  body.innerHTML = html;
}

/* ---------- content: one delegated listener ---------- */

$("#content").addEventListener("click", (e) => {
  const action = e.target.closest("[data-action]");
  if (action) {
    const kind = action.dataset.action;
    if (kind === "back") closeDetail();
    else if (kind === "toggle-fm") { state.showFrontmatter = !state.showFrontmatter; renderContent(); }
    else if (kind === "reveal") window.typecase.reveal(action.dataset.path);
    else if (kind === "editor") window.typecase.openEditor(action.dataset.dir);
    else if (kind === "goto" && action.dataset.key) openDetail(action.dataset.key);
    return;
  }
  const rowEl = e.target.closest(".skill-row");
  if (rowEl) openDetail(rowEl.dataset.key);
});

/* ---------- keyboard ---------- */

function moveFocus(delta) {
  const rows = [...document.querySelectorAll("#rows .skill-row:not([hidden])")];
  if (!rows.length) return;
  state.focusIndex = Math.max(0, Math.min(rows.length - 1, (state.focusIndex < 0 ? 0 : state.focusIndex + delta)));
  rows.forEach((r, i) => r.classList.toggle("focused", i === state.focusIndex));
  rows[state.focusIndex].scrollIntoView({ block: "nearest" });
}

document.addEventListener("keydown", (e) => {
  const paletteOpen = !$("#palette-backdrop").hidden;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    paletteOpen ? closePalette() : openPalette();
    return;
  }
  if (paletteOpen) return;
  if ((e.metaKey || e.ctrlKey) && e.key === "\\") { e.preventDefault(); $("#toggle-sidebar").click(); return; }
  if (state.view === "detail") {
    if (e.key === "Escape") closeDetail();
    if (e.key === "1") setTab("rendered");
    if (e.key === "2") setTab("source");
    if (e.key === "3") setTab("history");
    return;
  }
  if (e.target.tagName === "INPUT") return;
  if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); moveFocus(1); }
  else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); moveFocus(-1); }
  else if (e.key === "Enter" && state.focusIndex >= 0) {
    const rowEl = document.querySelectorAll("#rows .skill-row:not([hidden])")[state.focusIndex];
    if (rowEl) openDetail(rowEl.dataset.key);
  }
});

/* ---------- command palette ---------- */

let paletteSel = 0;
function openPalette() {
  $("#palette-backdrop").hidden = false;
  const input = $("#palette-input");
  input.value = "";
  paletteSel = 0;
  renderPalette("");
  input.focus();
}
function closePalette() { $("#palette-backdrop").hidden = true; }

function paletteMatches(q) {
  return model.groups
    .map((g) => ({ g, score: fuzzyScore(q, g.rep) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.g.rep.name.localeCompare(b.g.rep.name))
    .slice(0, 12);
}

function renderPalette(q) {
  const matches = paletteMatches(q);
  paletteSel = Math.min(paletteSel, Math.max(0, matches.length - 1));
  $("#palette-results").innerHTML = matches.map((m, i) => `
    <div class="palette-row${i === paletteSel ? " selected" : ""}" data-key="${esc(m.g.key)}">
      <span class="name">${esc(m.g.rep.name)}</span>
      <span class="d">${esc(m.g.rep.description ?? "")}</span>
      <span class="t">${esc(toolLabel(m.g.rep.tool))} · ${esc(m.g.rep.scope)}</span>
    </div>`).join("");
}

$("#palette-results").addEventListener("click", (e) => {
  const rowEl = e.target.closest(".palette-row");
  if (!rowEl) return;
  closePalette();
  openDetail(rowEl.dataset.key);
});
$("#palette-input").addEventListener("input", (e) => { paletteSel = 0; renderPalette(e.target.value); });
$("#palette-input").addEventListener("keydown", (e) => {
  const matches = paletteMatches(e.target.value);
  if (e.key === "Escape") closePalette();
  else if (e.key === "ArrowDown") { e.preventDefault(); paletteSel = Math.min(paletteSel + 1, matches.length - 1); renderPalette(e.target.value); }
  else if (e.key === "ArrowUp") { e.preventDefault(); paletteSel = Math.max(paletteSel - 1, 0); renderPalette(e.target.value); }
  else if (e.key === "Enter" && matches[paletteSel]) { closePalette(); openDetail(matches[paletteSel].g.key); }
});
$("#palette-backdrop").addEventListener("click", (e) => { if (e.target.id === "palette-backdrop") closePalette(); });

/* ---------- toolbar wiring ---------- */

function setTab(tab) {
  state.tab = tab;
  renderContent();
}

$("#toggle-sidebar").addEventListener("click", () => $("#app").classList.toggle("sidebar-hidden"));
$("#density-btn").addEventListener("click", () => {
  state.density = state.density === "cozy" ? "compact" : "cozy";
  $("#density-btn").classList.toggle("active", state.density === "compact");
  $("#rows")?.classList.toggle("compact", state.density === "compact");
});
for (const b of document.querySelectorAll(".chip"))
  b.addEventListener("click", () => {
    state.chips[b.dataset.chip] = !state.chips[b.dataset.chip];
    b.classList.toggle("active", state.chips[b.dataset.chip]);
    renderContent();
  });
$("#theme-btn").addEventListener("click", () => {
  const order = ["system", "light", "dark"];
  state.theme = order[(order.indexOf(state.theme) + 1) % order.length];
  applyTheme();
});
$("#search-pill").addEventListener("click", openPalette);
for (const b of document.querySelectorAll("#segmented button"))
  b.addEventListener("click", () => setTab(b.dataset.tab));

/* ---------- render root ---------- */

function renderContent() {
  const t0 = performance.now();
  if (state.view === "detail") renderDetail();
  else renderRows();
  const stats = (window.__renderStats ??= { count: 0, lastMs: 0 });
  stats.count++;
  stats.lastMs = performance.now() - t0;
}

async function load() {
  const t0 = performance.now();
  data = await window.typecase.data();
  const t1 = performance.now();
  if (data.platform === "darwin") document.body.classList.add("mac");
  model = buildModel();
  rowsCache = null;
  renderSidebar();
  renderContent();
  const t2 = performance.now();
  window.__perf = { ipcMs: t1 - t0, firstRenderMs: t2 - t1 };
}

window.typecase.onSkillsChanged(async () => {
  data = await window.typecase.data();
  model = buildModel();
  rowsCache = null;
  renderSidebar();
  renderContent();
});

applyTheme();
load();
