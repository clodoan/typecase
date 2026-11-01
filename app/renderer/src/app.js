import * as stylex from "@stylexjs/stylex";

import { agoText, LOG_LABEL, skillUsage, WINDOW_DAYS } from "../../../scripts/lib/usage-stats.mjs";
import { HEADING_ID_PREFIX, MARKDOWN_ROOT, renderSkillMarkdown } from "./markdown.mjs";
import { installShortcuts, shortcutText } from "./shortcuts.mjs";
import { styles } from "./styles.mjs";
import { darkTheme } from "./themes.mjs";

const cx = (...xs) => stylex.attrs(...xs).class ?? "";

const C = {
  navItem: cx(styles.navItem, styles.item),
  navItemActive: cx(styles.navItem, styles.item, styles.itemActive),
  navLabel: cx(styles.navLabel),
  navCount: cx(styles.navCount),
  navIcon: cx(styles.navIcon),
  navSep: cx(styles.navSep),

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
  rUse: cx(styles.rUse),
  rUseDim: cx(styles.rUse, styles.rUseDim),

  badge: cx(styles.badge),

  detail: cx(styles.detail),
  detailHero: cx(styles.detailHero),
  detailSub: cx(styles.detailSub),

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
  linkBtn: cx(styles.linkBtn),
  section: cx(styles.section),
  sectionTitle: cx(styles.sectionTitle),
  warn: cx(styles.warn),
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

const TOOL_ICONS = {
  grok: '<svg viewBox="0 0 16 16" width="13" height="13"><use href="#ti-grok"/></svg>',
  cursor: '<svg viewBox="0 0 16 16" width="13" height="13"><use href="#ti-cursor"/></svg>',
  claude: '<svg viewBox="0 0 16 16" width="13" height="13"><use href="#ti-claude"/></svg>',
  codex: '<svg viewBox="0 0 16 16" width="13" height="13"><use href="#ti-codex"/></svg>',
  shared: '<svg viewBox="0 0 16 16" width="13" height="13"><use href="#ti-shared"/></svg>',
};
const NAV_ICONS = {
  all: '<svg viewBox="0 0 16 16" width="13" height="13"><rect x="2.5" y="2.5" width="11" height="11" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  changed: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M13 8A5 5 0 1 1 8 3h3M9 1l2.2 2L9 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  unused: '<svg viewBox="0 0 16 16" width="13" height="13"><circle cx="8" cy="8" r="5.3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.2 2"/></svg>',
  overlaps: '<svg viewBox="0 0 16 16" width="13" height="13"><circle cx="6" cy="8" r="3.8" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="10" cy="8" r="3.8" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
};

// The sidebar is one short list with a single selection: All, the flags
// that match something, then the tools that have skills.
const FLAGS = [
  { id: "unused", label: "Unused", title: `No uses in the last ${WINDOW_DAYS} days (Claude Code and Codex logs)` },
  { id: "changed", label: "Changed", title: "Changed since skills.lock" },
  { id: "overlaps", label: "Overlaps", title: "Triggers overlap another skill" },
];

let data = null;
let model = null;
// Usage index from the main process (scripts/lib/usage-stats.mjs
// indexUsage); null until the first log scan answers.
let usage = null;
const state = {
  tool: null,
  flag: null,
  theme: localStorage.getItem("typecase-theme") || "system",
  view: "grid",
  groupKey: null,
  tab: "rendered",
  focusIndex: -1,
};

const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const keyOf = (s) => `${s.tool}:${s.scope}:${s.name}:${s.path}`;
const lockKeyOf = (s) => `${s.tool}:${s.scope}:${s.name}`; // matches lockfile.mjs keyOf

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
  // History only has something to say once a skills.lock exists.
  $('#segmented [data-tab="history"]').hidden = !data?.lock;
  for (const b of document.querySelectorAll("#segmented button")) {
    const active = b.dataset.tab === state.tab;
    b.className = active ? C.tabActive : C.tab;
    b.setAttribute("aria-selected", String(active));
  }
}

const darkMQ = matchMedia("(prefers-color-scheme: dark)");

function applyTheme() {
  const resolved = state.theme === "system" ? (darkMQ.matches ? "dark" : "light") : state.theme;
  // The dark theme is a StyleX createTheme override on the root; light
  // is the token defaults.
  document.documentElement.className = cx(styles.html, resolved === "dark" && darkTheme);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  localStorage.setItem("typecase-theme", state.theme);
  window.typecase.setTheme(state.theme);
}
darkMQ.addEventListener("change", () => { if (state.theme === "system") applyTheme(); });

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
      overlap: installs.some((s) => overlapPaths.has(s.path)) || collisionNames.has(rep.name),
      risky: rep.riskyTools.length > 0,
      tools: [...new Set(installs.map((s) => s.tool))],
      usage: usage ? skillUsage(usage, installs) : null,
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
      unused: count((g) => g.usage?.tracked && g.usage.unused),
      tools: new Map(TOOLS.map((t) => [t.id, count((g) => g.tools.includes(t.id))])),
    },
  };
}

const FLAG_TEST = {
  unused: (g) => g.usage?.tracked && g.usage.unused,
  changed: (g) => g.changed,
  overlaps: (g) => g.overlap,
};

function visibleGroups() {
  let out = model.groups;
  if (state.tool) out = out.filter((g) => g.tools.includes(state.tool));
  if (state.flag) out = out.filter(FLAG_TEST[state.flag]);
  return out;
}

function repFor(g) {
  if (state.tool) return g.installs.find((s) => s.tool === state.tool) ?? g.rep;
  return g.rep;
}

function fuzzyScore(query, s) {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const name = s.name.toLowerCase();
  const hay = `${s.description ?? ""} ${s.triggers ?? ""}`.toLowerCase();
  if (name === q) return 100;
  if (name.includes(q)) return 60 - name.indexOf(q);
  let i = 0;
  for (const ch of name) if (ch === q[i]) i++;
  if (i === q.length) return 30;
  if (hay.includes(q)) return 15;
  const words = q.split(/\s+/);
  const hits = words.filter((w) => hay.includes(w) || name.includes(w)).length;
  return hits === words.length ? 8 : hits > 0 ? 2 : -1;
}

function navButton({ nav, icon, label, count, title }) {
  return `<button class="nav-item ${C.navItem}" data-nav="${esc(nav)}"${title ? ` title="${esc(title)}"` : ""}>
    <span class="${C.navIcon}">${icon ?? ""}</span><span class="${C.navLabel}">${esc(label)}</span><span class="count ${C.navCount}">${count}</span>
  </button>`;
}

// A flag only shows when it would match something, so no item leads to an
// empty list. Changed also needs a lockfile to mean anything.
function flagAvailable(id) {
  if (id === "changed" && !data.lock) return false;
  return model.counts[id] > 0;
}

function renderSidebar() {
  const { counts } = model;
  // Drop a selection whose item has disappeared (files changed on disk).
  if (state.tool && !counts.tools.get(state.tool)) state.tool = null;
  if (state.flag && !flagAvailable(state.flag)) state.flag = null;

  let html = navButton({ nav: "all", icon: NAV_ICONS.all, label: "All Skills", count: counts.all });
  for (const f of FLAGS.filter((x) => flagAvailable(x.id))) {
    html += navButton({ nav: `flag:${f.id}`, icon: NAV_ICONS[f.id], label: f.label, count: counts[f.id], title: f.title });
  }
  html += `<div class="${C.navSep}" aria-hidden="true"></div>`;
  for (const t of TOOLS) {
    const count = counts.tools.get(t.id) ?? 0;
    if (count) html += navButton({ nav: `tool:${t.id}`, icon: TOOL_ICONS[t.id], label: t.label, count });
  }
  $("#sidenav").innerHTML = html;
  syncSidebar();
}

function syncSidebar() {
  for (const el of document.querySelectorAll("#sidenav .nav-item")) {
    const [kind, id] = el.dataset.nav.split(":");
    const active =
      kind === "all" ? !state.tool && !state.flag
      : kind === "tool" ? state.tool === id
      : state.flag === id;
    el.className = "nav-item " + (active ? C.navItemActive : C.navItem);
    if (active) el.setAttribute("aria-current", "true");
    else el.removeAttribute("aria-current");
  }
}

$("#sidenav").addEventListener("click", (e) => {
  const item = e.target.closest(".nav-item");
  if (!item) return;
  const [kind, id] = item.dataset.nav.split(":");
  const list = { view: "grid", groupKey: null };
  if (kind === "all") navigate({ ...list, tool: null, flag: null });
  else if (kind === "tool") navigate({ ...list, tool: id, flag: null });
  else navigate({ ...list, tool: null, flag: id });
});

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

let rowsCache = null;

function buildRowsCache() {
  let rows = "";
  for (const g of model.groups) {
    const rep = g.rep;
    rows += `<div class="${rowClass(false)}" tabindex="0" data-key="${esc(g.key)}">` +
      `<span class="${rNameClass()}">${esc(rep.name)}</span>` +
      `<span class="r-desc ${C.rDesc}">${esc(rep.description || "—")}</span>` +
      `<span class="r-badges ${C.rBadges}">${badgesHtml(g)}</span>` +
      `<span class="r-tool ${C.rTool}"><svg class="${C.rToolIcon}" viewBox="0 0 16 16" width="13" height="13"><use href="#ti-${esc(rep.tool)}"/></svg><span></span></span>` +
      `<span class="r-use ${C.rUse}"></span></div>`;
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
    syncUseCell(el.querySelector(".r-use"), g.usage);
  }

  headEl.textContent = `${groups.length} Skill${groups.length === 1 ? "" : "s"}`;
  subEl.textContent =
    state.tool ? toolLabel(state.tool)
    : state.flag ? FLAGS.find((f) => f.id === state.flag).title
    : "All";
  emptyEl.hidden = groups.length > 0;
  if (!groups.length) emptyEl.textContent = "No skills here.";

  const content = $("#content");
  if (wrapEl.parentNode !== content) content.replaceChildren(wrapEl);
}

// "12× · 2d ago": uses in the window, then recency. Dim when unused or
// when no readable log covers the skill's tools.
function syncUseCell(el, u) {
  const [text, title, dim] =
    !u ? ["", "", true]
    : !u.tracked ? ["—", "Not tracked: no readable session log for the tools it is installed for", true]
    : [
      u.lastAt ? `${u.recent}× · ${agoText(u.lastAt)}` : "never",
      `${u.recent} uses in ${u.windowDays} days · ${u.total} all time`,
      u.unused,
    ];
  if (el.textContent !== text) el.textContent = text;
  el.title = title;
  el.className = "r-use " + (dim ? C.rUseDim : C.rUse);
}

function openDetail(key) {
  navigate({ view: "detail", groupKey: key });
}

function closeDetail() {
  navigate({ view: "grid", groupKey: null });
}

const LOCATION_KEYS = ["view", "groupKey", "tool", "flag"];
const navHistory = { back: [], forward: [] };

function currentLocation() {
  const loc = Object.fromEntries(LOCATION_KEYS.map((k) => [k, state[k]]));
  return { ...loc, scrollTop: $("#content").scrollTop };
}

function showLocation(loc) {
  for (const k of LOCATION_KEYS) state[k] = loc[k];
  Object.assign(state, { tab: "rendered", focusIndex: -1 });
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
    <div class="detail-hero ${C.detailHero}">${esc(s.name)}</div>
    <div class="detail-sub ${C.detailSub}">${esc(s.description || "")}</div>
    <div id="tab-body"></div>
  </div>`;
  renderTab();
}

function renderTab() {
  if (state.tab === "history" && !data.lock) state.tab = "rendered";
  const g = model.byKey.get(state.groupKey);
  const s = repFor(g);
  const body = $("#tab-body");
  if (state.tab === "rendered") renderTabRendered(body, g, s);
  else if (state.tab === "source") renderTabSource(body, s);
  else renderTabHistory(body, g, s);
  syncSegmented();
}

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
    const ou = otherGroup?.usage;
    const versus = ou?.tracked && g.usage?.tracked
      ? `, used ${ou.recent}× vs ${g.usage.recent}× for this one in ${ou.windowDays} days`
      : "";
    return `<li class="${C.valueLi}"><a class="link-skill ${C.linkSkill}" data-action="goto" data-key="${esc(otherGroup?.key ?? "")}">${esc(other.name)}</a> <span class="${C.rowValueMuted}">${Math.round(o.score * 100)}% similar triggers${versus}</span></li>`;
  }).join("");
  const collision = data.duplicates.find((d) => !d.identical && d.name === s.name);
  const dupLine = collision
    ? `<li class="${C.valueLi}">Same name, different content in ${collision.installs.filter((i) => i.path !== s.path).map((i) => `${esc(i.tool)} · ${esc(i.scope)}`).join(", ")}</li>`
    : "";

  const lockEntry = data.lock?.skills?.[lockKeyOf(s)];
  const lockText = !lockEntry ? ""
    : lockEntry.hash === s.hash ? `locked at <span class="${C.mono}">${esc(lockEntry.hash.slice(0, 12))}</span>`
    : `changed since lock (<span class="${C.mono}">${esc(lockEntry.hash.slice(0, 12))}</span> → <span class="${C.mono}">${esc(s.hash.slice(0, 12))}</span>)`;
  const sourceText = lockEntry?.source?.kind === "git"
    ? `from ${esc(lockEntry.source.remote ?? "git")}@${esc((lockEntry.source.commit ?? "").slice(0, 7))}`
    : lockEntry?.source?.version ? `v${esc(lockEntry.source.version)}` : "";

  // One install: the path, then its actions on one line. Several: each
  // path gets its own Reveal.
  const reveal = (p, label) => `<button class="${C.linkBtn}" data-action="reveal" data-path="${esc(p)}">${label}</button>`;
  const many = g.installs.length > 1;
  const paths = g.installs.map((inst) =>
    `<li class="${C.pathRow}"><span class="mono ${C.mono}">${esc(inst.path)}</span>${many ? reveal(inst.path, "Reveal") : ""}</li>`).join("");
  const actions = [
    many ? "" : reveal(s.path, "Reveal in Finder"),
    `<button class="${C.linkBtn}" data-action="editor" data-dir="${esc(s.dir)}">Open in Cursor</button>`,
  ].filter(Boolean).join(`<span class="${C.rowValueMuted}"> · </span>`);

  // Triggers are usually the description plus "When to use"; only show
  // them when they say something those two don't.
  const flat = (t) => String(t ?? "").replace(/\s+/g, " ").trim();
  const triggersNew = s.triggers && !flat(`${s.description} ${whenUse}`).includes(flat(s.triggers));

  // One pattern for the whole view: titled sections of label/value rows.
  // Rows with nothing to say are left out rather than shown as "none".
  const details = [
    whenUse ? row("When to use", esc(whenUse)) : "",
    triggersNew ? row("Triggers", esc(s.triggers)) : "",
    s.whenNot ? row("When not to use", esc(s.whenNot)) : "",
    toolChips || riskyOnly ? row("Tools it can call", `<div class="${C.toolChips}">${toolChips}${riskyOnly}</div>`) : "",
    s.files.length ? row("Files", `<ul class="${C.valueList}">${s.files.map((f) => `<li class="mono ${C.mono} ${C.valueLi}">${esc(f)}</li>`).join("")}</ul>`) : "",
    (overlapLinks || dupLine) ? row("Overlaps with", `<ul class="${C.valueList}">${dupLine}${overlapLinks}</ul>`) : "",
    row(g.copies > 1 ? `Installed ×${g.copies}` : "Installed at", `<ul class="${C.valueList}">${paths}</ul><div>${actions}</div>`),
    row("Size", `~${s.tokens} tokens · ${plural(s.sections.length, "section")}`),
    lockText ? row("Lock", [lockText, sourceText].filter(Boolean).join(" · ")) : "",
  ];
  body.innerHTML = `
    ${section("Usage", usageRows(g, s), "usage")}
    ${section("Details", details, "details")}
    <section class="${C.section}"><h2 class="${C.sectionTitle}">SKILL.md</h2><article class="body-sections md-body ${MARKDOWN_ROOT}"></article></section>`;
  const article = body.querySelector(".md-body");
  withRaw(article, s, (raw) => { article.innerHTML = renderSkillMarkdown(raw); });
}

const kTok = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function section(title, rows, cls) {
  const html = rows.filter(Boolean).join("");
  return html
    ? `<section class="${cls} ${C.section}"><h2 class="${C.sectionTitle}">${esc(title)}</h2><div class="rows ${C.rows}">${html}</div></section>`
    : "";
}

const warn = (t) => ` <span class="${C.warn}">${t}</span>`;

function usageRows(g, s) {
  const u = g.usage;
  if (!u) return [row("Status", "Reading session logs…", true)];
  if (!u.tracked) {
    return [row("Status", "Not tracked. Typecase reads Claude Code and Codex session logs; Cursor and Grok keep none it can read.", true)];
  }
  const rows = [
    row(`Last ${u.windowDays} days`, `${plural(u.recent, "use")}${u.total !== u.recent ? ` · ${u.total} all time` : ""}` +
      (u.unused ? warn("Unused, so a candidate to remove.") : "")),
    row("Last used", u.lastAt ? agoText(u.lastAt) : "never"),
  ];
  if (u.total) {
    const by = [];
    if (u.how.agent + u.how.read) by.push(`the agent ${u.how.agent + u.how.read}×`);
    if (u.how.typed) by.push(`you, typing <code>/${esc(s.name)}</code>, ${u.how.typed}×`);
    const typedOnly = u.how.typed && !u.how.agent && !u.how.read;
    rows.push(row("Started by", by.join(" · ") +
      (typedOnly ? warn("The agent never picks it on its own; its description may not match how you ask for it.") : "")));
  }
  if (u.hit) {
    rows.push(row("Hit rate", `${Math.round(u.hit.rate * 100)}% · used in ${u.hit.used} of ${plural(u.hit.offered, "session")} that offered it`));
    rows.push(row("Context cost", `~${u.hit.listingTokens} tokens per session · ~${kTok(u.hit.contextTokens)} so far`));
  }
  if (u.edit) {
    const { before, after, days } = u.edit;
    const trend = after > before ? `up from ${before}` : after < before ? `down from ${before}` : `same as the ${days} days before`;
    rows.push(row("Since last edit", `${plural(after, "use")} in ${days} days, ${trend}` +
      ` <span class="${C.rowValueMuted}">(edited ${esc(new Date(u.edit.editedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }))})</span>`));
  }
  const tools = [...Object.entries(u.byLog).map(([log, n]) => `${LOG_LABEL[log]} ${n}×`), ...u.untracked.map((t) => `${esc(toolLabel(t))} not tracked`)];
  if (tools.length > 1) rows.push(row("By tool", tools.join(" · ")));
  return rows;
}

function openMarkdownLink(href) {
  if (href.startsWith("#")) {
    document.getElementById(HEADING_ID_PREFIX + decodeURIComponent(href.slice(1)))?.scrollIntoView({ block: "start" });
  } else if (/^(https?|mailto):/i.test(href)) {
    window.typecase.openExternal(href);
  } else if (!/^[a-z][\w+.-]*:/i.test(href)) {
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
  // Identical copies share content but are locked under different keys.
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
    if (kind === "reveal") window.typecase.reveal(action.dataset.path);
    else if (kind === "editor") window.typecase.openEditor(action.dataset.dir);
    else if (kind === "goto" && action.dataset.key) openDetail(action.dataset.key);
    return;
  }
  const rowEl = e.target.closest(".skill-row");
  if (rowEl) openDetail(rowEl.dataset.key);
});

function moveFocus(delta) {
  const rows = [...document.querySelectorAll("#rows .skill-row:not([hidden])")];
  if (!rows.length) return;
  state.focusIndex = Math.max(0, Math.min(rows.length - 1, (state.focusIndex < 0 ? 0 : state.focusIndex + delta)));
  rows.forEach((r, i) => { r.className = rowClass(i === state.focusIndex); });
  rows[state.focusIndex].scrollIntoView({ block: "nearest" });
}

const focusedRow = () => document.querySelectorAll("#rows .skill-row:not([hidden])")[state.focusIndex];
installShortcuts({
  scope: () => (!$("#palette-backdrop").hidden ? "palette" : state.view === "detail" ? "detail" : "list"),
  actions: {
    search: () => ($("#palette-backdrop").hidden ? openPalette() : closePalette()),
    back: goBack,
    forward: goForward,
    nextRow: () => moveFocus(1),
    prevRow: () => moveFocus(-1),
    openRow: () => (focusedRow() ? openDetail(focusedRow().dataset.key) : false),
    toggleSidebar: () => $("#toggle-sidebar").click(),
    closeSkill: closeDetail,
    tabRendered: () => setTab("rendered"),
    tabSource: () => setTab("source"),
    tabHistory: () => (data.lock ? setTab("history") : false),
  },
});

let paletteSel = 0;
function openPalette() {
  $("#palette-backdrop").hidden = false;
  const input = $("#palette-input");
  input.value = "";
  paletteSel = 0;
  renderPalette("");
  input.focus();
}
function closePalette() {
  // Chromium only drops focus from a hidden field on its next frame; until then
  // shortcuts would see the palette input as focused and ignore every key.
  $("#palette-input").blur();
  $("#palette-backdrop").hidden = true;
}

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
  if (e.key === "Escape") closePalette();
  else if (e.key === "ArrowDown") { e.preventDefault(); paletteSel = Math.min(paletteSel + 1, paletteItems.length - 1); renderPalette(e.target.value); }
  else if (e.key === "ArrowUp") { e.preventDefault(); paletteSel = Math.max(paletteSel - 1, 0); renderPalette(e.target.value); }
  else if (e.key === "Enter") runPaletteItem(paletteSel);
});
$("#palette-backdrop").addEventListener("click", (e) => { if (e.target.id === "palette-backdrop") closePalette(); });

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
$("#search-pill").addEventListener("click", openPalette);
$("#back-btn").addEventListener("click", goBack);
for (const b of document.querySelectorAll("#segmented button"))
  b.addEventListener("click", () => setTab(b.dataset.tab));

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
  loadUsage();
}

// Rescans are cheap (unchanged logs are skipped by size and mtime), so
// refresh when the window regains focus, at most once a minute.
let usageAt = 0;
async function loadUsage() {
  usageAt = Date.now();
  try {
    usage = await window.typecase.usage();
  } catch (e) {
    console.warn("usage scan failed", e);
    return;
  }
  model = buildModel();
  const scrollTop = $("#content").scrollTop;
  renderSidebar();
  renderContent();
  $("#content").scrollTop = scrollTop;
}
window.addEventListener("focus", () => { if (Date.now() - usageAt > 60_000) loadUsage(); });

window.typecase.onSkillsChanged(async () => {
  data = await window.typecase.data();
  model = buildModel();
  rowsCache = null;
  rawCache.clear();
  renderSidebar();
  renderContent();
  loadUsage();
});

applyShellStyles();
applyTheme();
load();
