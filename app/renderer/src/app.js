/* Typecase renderer. All data comes from the main process over the
   preload bridge; this file is pure presentation + navigation state.

   Styling is StyleX (compiled by rollup into dist/app.css): semantic
   class names (skill-row, nav-item, …) stay on elements for tests and
   event delegation, the compiled classes carry all presentation.

   Rendering discipline: every derived set (changed keys, overlap paths,
   name collisions, per-group flags, sidebar counts) is computed ONCE
   per data payload into `model`. Lists render as single HTML strings
   with one delegated listener per surface. A state change re-renders
   only the surface it affects; the sidebar is built once per payload
   and only its active highlight is synced afterwards. */

import * as stylex from "@stylexjs/stylex";

import { HEADING_ID_PREFIX, MARKDOWN_ROOT, renderSkillMarkdown } from "./markdown.mjs";
import { installShortcuts, shortcutText } from "./shortcuts.mjs";
import { styles } from "./styles.mjs";
import { darkTheme } from "./themes.mjs";

const cx = (...xs) => stylex.attrs(...xs).class ?? "";

/* Static class strings, computed once. */
const C = {
  navHeading: cx(styles.navHeading),
  navItem: cx(styles.navItem, styles.item),
  navItemActive: cx(styles.navItem, styles.item, styles.itemActive),
  navLabel: cx(styles.navLabel),
  navCount: cx(styles.navCount),
  navIcon: cx(styles.navIcon),

  countHead: cx(styles.countHead),
  countH1: cx(styles.countHeadH1),
  countSub: cx(styles.countHeadSub),
  rowsList: cx(styles.rowsList),
  skillRow: cx(styles.skillRow),
  skillRowFocused: cx(styles.skillRow, styles.skillRowFocused),
  rName: cx(styles.rName),
  rDesc: cx(styles.rDesc),
  rBadges: cx(styles.rBadges),
  rTool: cx(styles.rTool),
  rToolIcon: cx(styles.rToolIcon),
  rTok: cx(styles.rTok),

  badge: cx(styles.badge),

  detail: cx(styles.detail),
  detailTop: cx(styles.detailTop),
  spacer: cx(styles.spacer),
  iconBtn: cx(styles.iconBtn),
  iconBtnActive: cx(styles.iconBtn, styles.iconBtnActive),
  detailHero: cx(styles.detailHero),
  detailSub: cx(styles.detailSub),
  detailBadges: cx(styles.detailBadges),
  frontmatterPop: cx(styles.frontmatterPop),

  rows: cx(styles.rows),
  row: cx(styles.row),
  rowLabel: cx(styles.rowLabel),
  rowValue: cx(styles.rowValue),
  rowValueMuted: cx(styles.rowValue, styles.rowValueMuted),
  valueList: cx(styles.valueList),
  valueLi: cx(styles.valueLi),
  mono: cx(styles.mono),
  monoDim: cx(styles.monoDim),
  toolChips: cx(styles.toolChips),
  toolChip: cx(styles.toolChip),
  pathRow: cx(styles.pathRow),
  miniBtn: cx(styles.miniBtn),
  linkSkill: cx(styles.linkSkill),

  sourceBlock: cx(styles.sourceBlock),
  historyEntry: cx(styles.historyEntry),
  historyH3: cx(styles.historyH3),
  historyHash: cx(styles.historyHash),
  historyPara: cx(styles.historyPara),
  diffList: cx(styles.diffList),
  diffLi: cx(styles.diffLi),
  diffLiAdded: cx(styles.diffLi, styles.diffLiAdded),
  diffLiRemoved: cx(styles.diffLi, styles.diffLiRemoved),
  diffLiChanged: cx(styles.diffLi, styles.diffLiChanged),
  emptyHint: cx(styles.emptyHint),



  paletteRow: cx(styles.paletteRow),
  paletteRowSelected: cx(styles.paletteRow, styles.paletteRowSelected),
  paletteName: cx(styles.paletteName),
  paletteDesc: cx(styles.paletteDesc),
  paletteDescSelected: cx(styles.paletteDesc, styles.paletteDescSelected),
  paletteTool: cx(styles.paletteTool),
  paletteToolSelected: cx(styles.paletteTool, styles.paletteToolSelected),

  tbBtn: cx(styles.control, styles.controlIcon, styles.item),
  tab: cx(styles.control, styles.controlText, styles.item),
  tabActive: cx(styles.control, styles.controlText, styles.item, styles.itemActive),
};

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
  grok: '<svg viewBox="0 0 16 16" width="13" height="13"><use href="#ti-grok"/></svg>',
  cursor: '<svg viewBox="0 0 16 16" width="13" height="13"><use href="#ti-cursor"/></svg>',
  claude: '<svg viewBox="0 0 16 16" width="13" height="13"><use href="#ti-claude"/></svg>',
  codex: '<svg viewBox="0 0 16 16" width="13" height="13"><use href="#ti-codex"/></svg>',
  shared: '<svg viewBox="0 0 16 16" width="13" height="13"><use href="#ti-shared"/></svg>',
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

/* ---------- shell: StyleX classes onto the static index.html ---------- */

let isMac = false;
let sidebarHidden = false;

function applyShellStyles() {
  document.body.className = cx(styles.body);
  $("#app").className = "app " + cx(styles.app);
  $("#sidebar").className = "sidebar " + cx(styles.sidebar, sidebarHidden && styles.sidebarHidden);
  document.querySelector(".app-drag").className = "app-drag " + cx(styles.appDrag);
  document.querySelector(".sidebar-drag").className = "sidebar-drag " + cx(styles.sidebarDrag);
  $("#sidenav").className = "sidenav " + cx(styles.sidenav);
  $("#main").className = "main " + cx(styles.main);
  $("#main-drag").className = "main-drag " + cx(styles.mainDrag);
  syncToolbar();
  $("#toggle-sidebar").className = "tb-btn " + C.tbBtn;
  $("#toggle-sidebar").title = `Toggle sidebar (${shortcutText("toggleSidebar")})`;
  $("#back-btn").title = `Back (${shortcutText("back")})`;
  $("#search-pill kbd").textContent = shortcutText("search");
  $("#back-group").className = "tb-group back-group " + cx(styles.backGroup);
  $("#back-btn").className = "tb-btn back-btn " + C.tbBtn;
  $("#theme-btn").className = "tb-btn " + C.tbBtn;
  for (const el of document.querySelectorAll(".tb-sep")) el.className = "tb-sep " + cx(styles.tbSep);
  document.querySelector(".tb-spacer").className = "tb-spacer " + cx(styles.tbSpacer);
  $("#search-pill").className = "search-pill " + cx(styles.control, styles.controlText, styles.item, styles.searchPill);
  $("#search-pill kbd").className = cx(styles.searchKbd);
  $("#content").className = "content " + cx(styles.content);
  $("#segmented").className = "tb-tabs " + cx(styles.tbTabs);
  syncSegmented();
  $("#palette-backdrop").className = "palette-backdrop " + cx(styles.paletteBackdrop);
  document.querySelector(".palette").className = "palette " + cx(styles.palette);
  $("#palette-input").className = cx(styles.paletteInput);
  $("#palette-results").className = "palette-results " + cx(styles.paletteResults);
}

function syncToolbar() {
  $("#toolbar").className = "toolbar " + cx(styles.toolbar, isMac && sidebarHidden && styles.toolbarBesideLights);
}

function syncSegmented() {
  for (const b of document.querySelectorAll("#segmented button")) {
    const active = b.dataset.tab === state.tab;
    b.className = active ? C.tabActive : C.tab;
    b.setAttribute("aria-selected", String(active));
  }
}

const darkMQ = matchMedia("(prefers-color-scheme: dark)");
const THEME_ICONS = {
  system: '<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 2.8v10.4A5.2 5.2 0 0 0 8 2.8Z" fill="currentColor"/></svg>',
  light: '<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="3.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 1.2v2M8 12.8v2M1.2 8h2M12.8 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M12.8 3.2l-1.4 1.4M4.6 11.4l-1.4 1.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  dark: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M13 9.6A5.6 5.6 0 0 1 6.4 3a5.6 5.6 0 1 0 6.6 6.6Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
};

function applyTheme() {
  const resolved = state.theme === "system" ? (darkMQ.matches ? "dark" : "light") : state.theme;
  // The dark theme is a StyleX createTheme override on the root; light
  // is the token defaults.
  document.documentElement.className = cx(styles.html, resolved === "dark" && darkTheme);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  localStorage.setItem("typecase-theme", state.theme);
  window.typecase.setTheme(state.theme);
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
      // A name clash with different content counts as an overlap too.
      overlap: installs.some((s) => overlapPaths.has(s.path)) || collisionNames.has(rep.name),
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

function navButton({ nav, icon, label, count }) {
  return `<button class="nav-item ${C.navItem}" data-nav="${esc(nav)}">
    <span class="${C.navIcon}">${icon ?? ""}</span><span class="${C.navLabel}">${esc(label)}</span>${count != null ? `<span class="count ${C.navCount}">${count}</span>` : ""}
  </button>`;
}

function renderSidebar() {
  const { counts } = model;
  let html = `<div class="nav-heading ${C.navHeading}">Library</div>`;
  const lib = [
    { id: "all", label: "All Skills", count: counts.all },
    { id: "active", label: "Active", count: counts.all },
    { id: "changed", label: "Changed since lock", count: counts.changed },
    { id: "overlaps", label: "Overlaps", count: counts.overlaps },
  ];
  for (const l of lib) {
    html += navButton({ nav: `lib:${l.id}`, icon: LIB_ICONS[l.id], label: l.label, count: l.count });
  }

  html += `<div class="nav-heading ${C.navHeading}">Tools</div>`;
  for (const t of TOOLS) {
    const count = counts.tools.get(t.id) ?? 0;
    if (!count && t.id === "shared") continue;
    html += navButton({ nav: `tool:${t.id}`, icon: TOOL_ICONS[t.id], label: t.label, count });
  }

  html += `<div class="nav-heading ${C.navHeading}">Collections</div>`;
  for (const r of data.roots.filter((x) => x.exists && (counts.roots.get(x.dir) ?? 0) > 0)) {
    const short = r.dir.replace(data.cwd, "·").replace(/^\/(home|Users)\/[^/]+/, "~");
    html += navButton({ nav: `root:${r.dir}`, icon: TOOL_ICONS[r.tool] ?? LIB_ICONS.all, label: short, count: counts.roots.get(r.dir) });
  }

  html += `<div class="nav-heading ${C.navHeading}">Sources</div>`;
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
    el.className = "nav-item " + (active ? C.navItemActive : C.navItem);
  }
}

$("#sidenav").addEventListener("click", (e) => {
  const item = e.target.closest(".nav-item");
  if (!item) return;
  const [kind, ...restParts] = item.dataset.nav.split(":");
  const id = restParts.join(":");
  const list = { view: "grid", groupKey: null };
  if (kind === "lib") navigate({ ...list, library: id, tool: null, scope: null, collection: null });
  else if (kind === "tool") navigate({ ...list, library: "all", tool: id, scope: null, collection: null });
  else if (kind === "root") navigate({ ...list, library: "all", tool: null, scope: null, collection: id });
  else if (kind === "scope") navigate({ ...list, library: "all", tool: null, scope: id, collection: null });
});

/* ---------- rows ---------- */

function toolLabel(id) { return TOOLS.find((t) => t.id === id)?.label ?? id; }

function badgesHtml(g) {
  const out = [];
  if (g.copies > 1) out.push(`<span class="badge copies ${C.badge}">×${g.copies}</span>`);
  if (g.risky) out.push(`<span class="badge risky ${C.badge}">risky</span>`);
  if (g.overlap) out.push(`<span class="badge overlap ${C.badge}">overlap</span>`);
  if (g.changed) out.push(`<span class="badge changed ${C.badge}">changed</span>`);
  return out.join("");
}

const rowClass = (focused) => "skill-row " + (focused ? C.skillRowFocused : C.skillRow);
const rNameClass = () => "r-name " + C.rName;

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
    rows += `<div class="${rowClass(false)}" tabindex="0" data-key="${esc(g.key)}">` +
      `<span class="${rNameClass()}">${esc(rep.name)}</span>` +
      `<span class="r-desc ${C.rDesc}">${esc(rep.description || "—")}</span>` +
      `<span class="r-badges ${C.rBadges}">${badgesHtml(g)}</span>` +
      `<span class="r-tool ${C.rTool}"><svg class="${C.rToolIcon}" viewBox="0 0 16 16" width="13" height="13"><use href="#ti-${esc(rep.tool)}"/></svg><span></span></span>` +
      `<span class="r-tok ${C.rTok}">~${rep.tokens}</span></div>`;
  }
  const wrapEl = document.createElement("div");
  wrapEl.innerHTML =
    `<div class="count-head ${C.countHead}"><h1 class="${C.countH1}"></h1><span class="sub ${C.countSub}"></span></div>` +
    `<div class="rows-list ${C.rowsList}" id="rows">${rows}<div class="empty-hint ${C.emptyHint}" hidden></div></div>`;
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
  const { wrapEl, headEl, subEl, emptyEl, byKey } = rowsCache;
  const groups = visibleGroups();
  const visible = new Set(groups.map((g) => g.key));

  for (const [key, el] of byKey) el.hidden = !visible.has(key);
  for (const g of groups) {
    const el = byKey.get(g.key);
    el.className = rowClass(false);
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

  const content = $("#content");
  if (wrapEl.parentNode !== content) content.replaceChildren(wrapEl);
}

/* ---------- detail ---------- */

function openDetail(key) {
  navigate({ view: "detail", groupKey: key });
}

function closeDetail() {
  navigate({ view: "grid", groupKey: null });
}

/* ---------- navigation history (⌘[ back, ⌘] forward) ----------
   A location is the view, the open skill, and the sidebar filter. Each
   history entry also keeps its scroll position for when you return. */

const LOCATION_KEYS = ["view", "groupKey", "library", "tool", "scope", "collection"];
const navHistory = { back: [], forward: [] };

function currentLocation() {
  const loc = Object.fromEntries(LOCATION_KEYS.map((k) => [k, state[k]]));
  return { ...loc, scrollTop: $("#content").scrollTop };
}

function showLocation(loc) {
  for (const k of LOCATION_KEYS) state[k] = loc[k];
  Object.assign(state, { tab: "rendered", showFrontmatter: false, focusIndex: -1 });
  syncSidebar();
  renderContent();
  $("#content").scrollTop = loc.scrollTop ?? 0;
}

function navigate(changes) {
  const from = currentLocation();
  if (LOCATION_KEYS.every((k) => !(k in changes) || changes[k] === from[k])) return;
  navHistory.back.push(from);
  navHistory.forward = [];
  showLocation({ ...from, ...changes, scrollTop: 0 });
}

function goBack() {
  if (!navHistory.back.length) return;
  navHistory.forward.push(currentLocation());
  showLocation(navHistory.back.pop());
}

function goForward() {
  if (!navHistory.forward.length) return;
  navHistory.back.push(currentLocation());
  showLocation(navHistory.forward.pop());
}

function row(label, valueHtml, muted = false) {
  return valueHtml
    ? `<div class="row ${C.row}"><div class="label ${C.rowLabel}">${esc(label)}</div><div class="value ${muted ? C.rowValueMuted : C.rowValue}">${valueHtml}</div></div>`
    : "";
}

function renderDetail() {
  const g = model.byKey.get(state.groupKey);
  if (!g) {
    // The skill disappeared (files changed on disk): show the list instead.
    state.view = "grid";
    state.groupKey = null;
    renderContent();
    return;
  }
  const s = repFor(g);

  $("#content").innerHTML = `<div class="detail ${C.detail}">
    <div class="detail-top ${C.detailTop}">
      <div class="${C.spacer}"></div>
      <button class="icon-btn ${state.showFrontmatter ? C.iconBtnActive : C.iconBtn}" data-action="toggle-fm" title="Raw frontmatter">i</button>
    </div>
    <div class="detail-hero ${C.detailHero}">${esc(s.name)}</div>
    <div class="detail-sub ${C.detailSub}">${esc(s.description || "")}</div>
    <div class="detail-badges ${C.detailBadges}">${badgesHtml(g)}</div>
    ${state.showFrontmatter ? `<div class="frontmatter-pop ${C.frontmatterPop}">${esc(JSON.stringify(s.frontmatter, null, 2))}</div>` : ""}
    <div id="tab-body"></div>
  </div>`;
  renderTab();
}

/* Switching tabs re-renders only #tab-body; the header above stays put. */
function renderTab() {
  const g = model.byKey.get(state.groupKey);
  const s = repFor(g);
  const body = $("#tab-body");
  if (state.tab === "rendered") renderTabRendered(body, g, s);
  else if (state.tab === "source") renderTabSource(body, s);
  else renderTabHistory(body, g, s);
  syncSegmented();
}

/* Skill file text, cached per data payload. A cached file fills its tab
   synchronously, so switching tabs never paints an empty frame. */
const rawCache = new Map();
function withRaw(el, s, fill) {
  if (rawCache.has(s.path)) {
    fill(rawCache.get(s.path));
    return;
  }
  window.typecase.raw(s.path).then(
    (raw) => {
      rawCache.set(s.path, raw);
      if (el.isConnected) fill(raw);
    },
    (e) => { if (el.isConnected) el.textContent = `Could not read ${s.path}: ${e.message}`; },
  );
}

function renderTabRendered(body, g, s) {
  const whenUse = s.sections.find((x) => /when to use|^use/i.test(x.heading))?.text ?? "";
  const toolChips = s.commands.map((c) => {
    const risky = s.riskyTools.some((r) => c.includes(r) || r.includes(c.split(/\s/)[0]));
    return `<span class="${C.toolChip}">${esc(c)}${risky ? " ⚠" : ""}</span>`;
  }).join("");
  const riskyOnly = s.riskyTools
    .filter((r) => !s.commands.some((c) => c.includes(r)))
    .map((r) => `<span class="${C.toolChip}">${esc(r)} ⚠</span>`).join("");
  const myOverlaps = g.installs.flatMap((inst) => model.overlapsBySkillPath.get(inst.path) ?? []);
  const overlapLinks = myOverlaps.map((o) => {
    const other = g.installs.some((inst) => inst.path === o.a.path) ? o.b : o.a;
    const otherGroup = model.groups.find((x) => x.installs.some((inst) => inst.path === other.path));
    return `<li class="${C.valueLi}"><a class="link-skill ${C.linkSkill}" data-action="goto" data-key="${esc(otherGroup?.key ?? "")}">${esc(other.name)}</a> <span class="${C.monoDim}">(${Math.round(o.score * 100)}% shared vocabulary, ${esc(other.tool)})</span></li>`;
  }).join("");
  const collision = data.duplicates.find((d) => !d.identical && d.name === s.name);
  const dupLine = collision
    ? `<li class="${C.valueLi}">Same name, different content in ${collision.installs.filter((i) => i.path !== s.path).map((i) => `${esc(i.tool)} · ${esc(i.scope)}`).join(", ")}</li>`
    : "";

  const lockEntry = data.lock?.skills?.[lockKeyOf(s)];
  const lockHtml = lockEntry
    ? `locked <span class="mono ${C.mono}">${esc(lockEntry.hash.slice(0, 12))}</span>${lockEntry.hash === s.hash ? " · unchanged" : ` · now <span class="mono ${C.mono}">${esc(s.hash.slice(0, 12))}</span> (drifted)`}${lockEntry.source?.kind === "git" ? ` · ${esc(lockEntry.source.remote ?? "git")}@${esc((lockEntry.source.commit ?? "").slice(0, 7))}` : lockEntry.source?.version ? ` · v${esc(lockEntry.source.version)}` : ""}`
    : `not locked — run <code>typecase lock</code>`;

  const paths = g.installs.map((inst) => `
    <li class="${C.pathRow}"><span class="mono ${C.mono}">${esc(inst.path)}</span>
      <button class="mini-btn ${C.miniBtn}" data-action="reveal" data-path="${esc(inst.path)}">Reveal in Finder</button>
    </li>`).join("");

  const mutedSpan = (t) => `<span class="${C.rowValueMuted}">${t}</span>`;
  body.innerHTML = `
    <div class="rows ${C.rows}">
      ${row("Triggers", esc(s.triggers) || null)}
      ${whenUse ? row("When to use", esc(whenUse)) : ""}
      ${row("When not to use", s.whenNot ? esc(s.whenNot) : mutedSpan("not declared"))}
      ${row("Tools it can call", toolChips || riskyOnly ? `<div class="${C.toolChips}">${toolChips}${riskyOnly}</div>` : mutedSpan("none mentioned"))}
      ${row("Files referenced", s.files.length ? `<ul class="${C.valueList}">${s.files.map((f) => `<li class="mono ${C.mono} ${C.valueLi}">${esc(f)}</li>`).join("")}</ul>` : mutedSpan("none"))}
      ${row(g.copies > 1 ? `Path (×${g.copies} identical installs)` : "Path", `<ul class="${C.valueList}">${paths}</ul><button class="mini-btn ${C.miniBtn}" data-action="editor" data-dir="${esc(s.dir)}">Open in Cursor</button>`)}
      ${(overlapLinks || dupLine) ? row("Overlaps with", `<ul class="${C.valueList}">${dupLine}${overlapLinks}</ul>`) : ""}
      ${row("Version / lock", lockHtml)}
      ${row("Size", `~${s.tokens} tokens · ${s.sections.length} sections`)}
    </div>
    <article class="body-sections md-body ${MARKDOWN_ROOT}"></article>`;
  // The skill's full markdown below the metadata, rendered from the file.
  const article = body.querySelector(".md-body");
  withRaw(article, s, (raw) => { article.innerHTML = renderSkillMarkdown(raw); });
}

/** Links in rendered markdown never navigate the window. */
function openMarkdownLink(href) {
  if (href.startsWith("#")) {
    document.getElementById(HEADING_ID_PREFIX + decodeURIComponent(href.slice(1)))?.scrollIntoView({ block: "start" });
  } else if (/^(https?|mailto):/i.test(href)) {
    window.typecase.openExternal(href);
  } else if (!/^[a-z][\w+.-]*:/i.test(href)) {
    // Relative link: a file shipped next to SKILL.md (references/…).
    const g = model.byKey.get(state.groupKey);
    if (!g) return;
    const url = new URL(href, `file://${repFor(g).dir}/`);
    window.typecase.openEditor(decodeURIComponent(url.pathname));
  }
}

function renderTabSource(body, s) {
  body.innerHTML = `<div class="source-block ${C.sourceBlock}"></div>`;
  const block = body.firstElementChild;
  withRaw(block, s, (raw) => { block.textContent = raw; });
}

function diffItemHtml(c) {
  const li = (cls, semantic, inner) => `<li class="${semantic} ${cls}">${inner}</li>`;
  switch (c.kind) {
    case "section-added": return li(C.diffLiAdded, "added", `New section “${esc(c.heading)}”`);
    case "section-removed": return li(C.diffLiRemoved, "removed", `Section “${esc(c.heading)}” removed`);
    case "section-changed": return li(C.diffLiChanged, "changed", `Section “${esc(c.heading)}” rewritten`);
    case "description": return li(C.diffLiChanged, "changed", "Description changed");
    case "triggers": return li(C.diffLiChanged, "changed", "Triggers changed");
    case "when-not": return li(C.diffLiChanged, "changed", "“When not to use” changed");
    case "commands": return li(C.diffLiChanged, "changed", `Commands: ${c.added?.length ? `+${c.added.map(esc).join(", ")}` : ""} ${c.removed?.length ? `−${c.removed.map(esc).join(", ")}` : ""}`);
    case "risky-tools": return li(C.diffLiRemoved, "removed", `Risky tools: ${c.added?.length ? `+${c.added.map(esc).join(", ")}` : ""} ${c.removed?.length ? `−${c.removed.map(esc).join(", ")}` : ""}`);
    case "files": return li(C.diffLiChanged, "changed", `Files referenced: ${(c.added ?? []).length} added, ${(c.removed ?? []).length} removed`);
    default: return li(C.diffLi, "", esc(c.kind));
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
    html = `<div class="empty-hint ${C.emptyHint}">No <code>skills.lock</code> in ${esc(data.cwd)} yet. Run <code>typecase lock</code> to pin every installed skill, then this tab shows what changed and why it matters.</div>`;
  } else {
    if (change) {
      html += `<div class="history-entry ${C.historyEntry}">
        <h3 class="${C.historyH3}">Since lock <span class="hash ${C.historyHash}">${esc(change.fromHash ?? "")}${change.toHash ? " → " + esc(change.toHash) : ""}</span></h3>
        <div class="para ${C.historyPara}">${esc((change.paragraph ?? "").replace(/\*\*/g, ""))}</div>
        ${change.changes?.length ? `<ul class="diff-list ${C.diffList}">${change.changes.map(diffItemHtml).join("")}</ul>` : ""}
      </div>`;
    } else {
      html += `<div class="empty-hint ${C.emptyHint}">Unchanged since lock${lockEntry ? ` (<span class="mono ${C.mono}">${esc(lockEntry.hash.slice(0, 12))}</span>, ${esc(new Date(data.lock.generatedAt).toLocaleString())})` : ""}.</div>`;
    }
    if (lockEntry) {
      html += `<div class="history-entry ${C.historyEntry}">
        <h3 class="${C.historyH3}">Locked version <span class="hash ${C.historyHash}">${esc(lockEntry.hash.slice(0, 12))}</span></h3>
        <div class="para ${C.historyPara}">Pinned ${esc(new Date(data.lock.generatedAt).toLocaleString())} · ${
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
      return `<div class="history-entry ${C.historyEntry}"><h3 class="${C.historyH3}">${esc(date.trim())}</h3>${mine.map((m) => `<div class="para ${C.historyPara}">${esc(m.replace(/\*\*/g, ""))}</div>`).join("")}</div>`;
    }).join("");
  if (relevant) html += relevant;
  body.innerHTML = html;
}

/* ---------- content: one delegated listener ---------- */

$("#content").addEventListener("click", (e) => {
  const mdLink = e.target.closest(".md-body a[href]");
  if (mdLink) {
    e.preventDefault();
    openMarkdownLink(mdLink.getAttribute("href"));
    return;
  }
  const action = e.target.closest("[data-action]");
  if (action) {
    const kind = action.dataset.action;
    if (kind === "toggle-fm") { state.showFrontmatter = !state.showFrontmatter; renderContent(); }
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
  rows.forEach((r, i) => { r.className = rowClass(i === state.focusIndex); });
  rows[state.focusIndex].scrollIntoView({ block: "nearest" });
}

/* Shortcut keys and scopes live in shortcuts.mjs; these are the actions. */
const focusedRow = () => document.querySelectorAll("#rows .skill-row:not([hidden])")[state.focusIndex];
installShortcuts({
  scope: () => (!$("#palette-backdrop").hidden ? "palette" : state.view === "detail" ? "detail" : "list"),
  actions: {
    search: () => ($("#palette-backdrop").hidden ? openPalette() : closePalette()),
    toggleSidebar: () => $("#toggle-sidebar").click(),
    back: goBack,
    forward: goForward,
    nextRow: () => moveFocus(1),
    prevRow: () => moveFocus(-1),
    openRow: () => (focusedRow() ? openDetail(focusedRow().dataset.key) : false),
    closeSkill: closeDetail,
    tabRendered: () => setTab("rendered"),
    tabSource: () => setTab("source"),
    tabHistory: () => setTab("history"),
  },
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

/* Commands sit above skills when the query matches their keywords
   (every query word must start a keyword). */
const COMMANDS = [
  { theme: "light", name: "Light theme", desc: "Switch to the light appearance" },
  { theme: "dark", name: "Dark theme", desc: "Switch to the dark appearance" },
  { theme: "system", name: "System theme", desc: "Follow the macOS appearance" },
].map((c) => ({
  ...c,
  keywords: `${c.theme} theme appearance mode color`.split(" "),
  run: () => setTheme(c.theme),
}));

function commandMatches(q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return COMMANDS
    .filter((c) => words.every((w) => c.keywords.some((k) => k.startsWith(w))))
    .map((c) => ({ name: c.name, desc: c.desc, meta: state.theme === c.theme ? "Theme · current" : "Theme", run: c.run }));
}

/** Palette results: matching commands first, then up to 12 skills. */
function paletteMatches(q) {
  const skills = model.groups
    .map((g) => ({ g, score: fuzzyScore(q, g.rep) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.g.rep.name.localeCompare(b.g.rep.name))
    .slice(0, 12)
    .map(({ g }) => ({
      name: g.rep.name,
      desc: g.rep.description ?? "",
      meta: `${toolLabel(g.rep.tool)} · ${g.rep.scope}`,
      run: () => openDetail(g.key),
    }));
  return [...commandMatches(q), ...skills];
}

let paletteItems = [];
function renderPalette(q) {
  paletteItems = paletteMatches(q);
  paletteSel = Math.min(paletteSel, Math.max(0, paletteItems.length - 1));
  $("#palette-results").innerHTML = paletteItems.map((m, i) => {
    const sel = i === paletteSel;
    return `<div class="palette-row${sel ? " selected" : ""} ${sel ? C.paletteRowSelected : C.paletteRow}" data-index="${i}">
      <span class="name ${C.paletteName}">${esc(m.name)}</span>
      <span class="d ${sel ? C.paletteDescSelected : C.paletteDesc}">${esc(m.desc)}</span>
      <span class="t ${sel ? C.paletteToolSelected : C.paletteTool}">${esc(m.meta)}</span>
    </div>`;
  }).join("");
  $("#palette-results .palette-row.selected")?.scrollIntoView({ block: "nearest" });
}

function runPaletteItem(i) {
  const item = paletteItems[i];
  if (!item) return;
  closePalette();
  item.run();
}

$("#palette-results").addEventListener("click", (e) => {
  const rowEl = e.target.closest(".palette-row");
  if (rowEl) runPaletteItem(Number(rowEl.dataset.index));
});
$("#palette-input").addEventListener("input", (e) => { paletteSel = 0; renderPalette(e.target.value); });
$("#palette-input").addEventListener("keydown", (e) => {
  // Stop here: the document-level Escape would also close the open skill.
  if (e.key === "Escape") { e.stopPropagation(); closePalette(); }
  else if (e.key === "ArrowDown") { e.preventDefault(); paletteSel = Math.min(paletteSel + 1, paletteItems.length - 1); renderPalette(e.target.value); }
  else if (e.key === "ArrowUp") { e.preventDefault(); paletteSel = Math.max(paletteSel - 1, 0); renderPalette(e.target.value); }
  else if (e.key === "Enter") runPaletteItem(paletteSel);
});
$("#palette-backdrop").addEventListener("click", (e) => { if (e.target.id === "palette-backdrop") closePalette(); });

/* ---------- toolbar wiring ---------- */

function setTab(tab) {
  state.tab = tab;
  if (state.view === "detail") renderTab();
}

$("#toggle-sidebar").addEventListener("click", () => {
  sidebarHidden = !sidebarHidden;
  $("#sidebar").className = "sidebar " + cx(styles.sidebar, sidebarHidden && styles.sidebarHidden);
  syncToolbar();
});
function setTheme(theme) {
  state.theme = theme;
  applyTheme();
}
const THEME_ORDER = ["system", "light", "dark"];
$("#theme-btn").addEventListener("click", () => setTheme(THEME_ORDER[(THEME_ORDER.indexOf(state.theme) + 1) % THEME_ORDER.length]));
$("#search-pill").addEventListener("click", openPalette);
$("#back-btn").addEventListener("click", goBack);
for (const b of document.querySelectorAll("#segmented button"))
  b.addEventListener("click", () => setTab(b.dataset.tab));

/* ---------- render root ---------- */

function renderContent() {
  const t0 = performance.now();
  if (state.view === "detail") renderDetail();
  else renderRows();
  for (const el of document.querySelectorAll("[data-detail-only]")) el.hidden = state.view !== "detail";
  const stats = (window.__renderStats ??= { count: 0, lastMs: 0 });
  stats.count++;
  stats.lastMs = performance.now() - t0;
}

async function load() {
  const t0 = performance.now();
  data = await window.typecase.data();
  const t1 = performance.now();
  if (data.platform === "darwin") {
    isMac = true;
    document.body.classList.add("mac");
    document.body.className = "mac " + cx(styles.body);
  }
  model = buildModel();
  rowsCache = null;
  rawCache.clear();
  renderSidebar();
  renderContent();
  const t2 = performance.now();
  window.__perf = { ipcMs: t1 - t0, firstRenderMs: t2 - t1 };
}

window.typecase.onSkillsChanged(async () => {
  data = await window.typecase.data();
  model = buildModel();
  rowsCache = null;
  rawCache.clear();
  renderSidebar();
  renderContent();
});

applyShellStyles();
applyTheme();
load();
