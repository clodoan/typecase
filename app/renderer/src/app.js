import * as stylex from "@stylexjs/stylex";

import { agoText, LOG_LABEL, skillUsage, WINDOW_DAYS } from "../../../scripts/lib/usage-stats.mjs";
import { HEADING_ID_PREFIX, MARKDOWN_ROOT, renderSkillMarkdown } from "./markdown.mjs";
import { installShortcuts, shortcutText } from "./shortcuts.mjs";
import { styles } from "./styles.mjs";
import { darkTheme } from "./themes.mjs";

const cx = (...xs) => stylex.attrs(...xs).class ?? "";

const C = {
  chip: cx(styles.control, styles.controlText, styles.item, styles.chip),
  chipActive: cx(styles.control, styles.controlText, styles.item, styles.itemActive, styles.chip),
  chipCount: cx(styles.chipCount),
  chipIcon: cx(styles.chipIcon),

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
  detailBadges: cx(styles.detailBadges),

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

const TOOL_ICONS = {
  grok: '<svg viewBox="0 0 16 16" width="13" height="13"><use href="#ti-grok"/></svg>',
  cursor: '<svg viewBox="0 0 16 16" width="13" height="13"><use href="#ti-cursor"/></svg>',
  claude: '<svg viewBox="0 0 16 16" width="13" height="13"><use href="#ti-claude"/></svg>',
  codex: '<svg viewBox="0 0 16 16" width="13" height="13"><use href="#ti-codex"/></svg>',
  shared: '<svg viewBox="0 0 16 16" width="13" height="13"><use href="#ti-shared"/></svg>',
};
const FLAG_ICONS = {
  changed: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M13 8A5 5 0 1 1 8 3h3M9 1l2.2 2L9 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  unused: '<svg viewBox="0 0 16 16" width="13" height="13"><circle cx="8" cy="8" r="5.3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2.2 2"/></svg>',
  overlaps: '<svg viewBox="0 0 16 16" width="13" height="13"><circle cx="6" cy="8" r="3.8" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="10" cy="8" r="3.8" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
};

// Two filters only: one tool (or all), plus at most one flag that narrows
// it further.
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

function applyShellStyles() {
  document.body.className = cx(styles.body);
  $("#app").className = "app " + cx(styles.app);
  document.querySelector(".app-drag").className = "app-drag " + cx(styles.appDrag);
  $("#main").className = "main " + cx(styles.main);
  $("#main-drag").className = "main-drag " + cx(styles.mainDrag);
  syncToolbar();
  $("#filters").className = "tb-filters " + cx(styles.tbFilters);
  $("#back-btn").title = `Back (${shortcutText("back")})`;
  $("#search-pill kbd").textContent = shortcutText("search");
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
  $("#toolbar").className = "toolbar " + cx(styles.toolbar, isMac && styles.toolbarBesideLights);
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

function chipButton({ filter, icon, label, count, title }) {
  return `<button class="filter-chip" data-filter="${esc(filter)}"${title ? ` title="${esc(title)}"` : ""}>` +
    (icon ? `<span class="${C.chipIcon}">${icon}</span>` : "") +
    `<span>${esc(label)}</span><span class="count ${C.chipCount}">${count}</span></button>`;
}

// A flag only shows when it would match something, so no chip leads to an
// empty list. Changed also needs a lockfile to mean anything.
function flagAvailable(id) {
  if (id === "changed" && !data.lock) return false;
  return model.counts[id] > 0;
}

function renderFilters() {
  const { counts } = model;
  // Drop a filter whose chip has disappeared (files changed on disk).
  if (state.tool && !counts.tools.get(state.tool)) state.tool = null;
  if (state.flag && !flagAvailable(state.flag)) state.flag = null;

  let html = chipButton({ filter: "all", label: "All", count: counts.all });
  for (const t of TOOLS) {
    const count = counts.tools.get(t.id) ?? 0;
    if (count) html += chipButton({ filter: `tool:${t.id}`, icon: TOOL_ICONS[t.id], label: t.label, count });
  }
  const flags = FLAGS.filter((f) => flagAvailable(f.id));
  if (flags.length) html += `<div class="tb-sep ${cx(styles.tbSep)}"></div>`;
  for (const f of flags) {
    html += chipButton({ filter: `flag:${f.id}`, icon: FLAG_ICONS[f.id], label: f.label, count: counts[f.id], title: f.title });
  }
  $("#filters").innerHTML = html;
  syncFilters();
}

function syncFilters() {
  for (const el of document.querySelectorAll("#filters .filter-chip")) {
    const [kind, id] = el.dataset.filter.split(":");
    const active =
      kind === "all" ? !state.tool && !state.flag
      : kind === "tool" ? state.tool === id
      : state.flag === id;
    el.className = "filter-chip " + (active ? C.chipActive : C.chip);
    el.setAttribute("aria-pressed", String(active));
  }
}

$("#filters").addEventListener("click", (e) => {
  const chip = e.target.closest(".filter-chip");
  if (!chip) return;
  const [kind, id] = chip.dataset.filter.split(":");
  const list = { view: "grid", groupKey: null };
  if (kind === "all") navigate({ ...list, tool: null, flag: null });
  else if (kind === "tool") navigate({ ...list, tool: state.tool === id ? null : id });
  else navigate({ ...list, flag: state.flag === id ? null : id });
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
  subEl.textContent = [
    state.tool ? toolLabel(state.tool) : "All",
    state.flag ? FLAGS.find((f) => f.id === state.flag).title : "",
  ].filter(Boolean).join(" · ");
  emptyEl.hidden = groups.length > 0;
  if (!groups.length) emptyEl.textContent = "No skills match these filters. Click All to clear them.";

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
  syncFilters();
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
    <div class="detail-badges ${C.detailBadges}">${badgesHtml(g)}</div>
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
      ? ` · <strong>${ou.recent}</strong> vs <strong>${g.usage.recent}</strong> here, last ${ou.windowDays}d`
      : "";
    return `<li class="${C.valueLi}"><a class="link-skill ${C.linkSkill}" data-action="goto" data-key="${esc(otherGroup?.key ?? "")}">${esc(other.name)}</a> <span class="${C.monoDim}">(${Math.round(o.score * 100)}% shared vocabulary, ${esc(other.tool)})</span>${versus}</li>`;
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
      ${row("Usage", usageHtml(g, s))}
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
  const article = body.querySelector(".md-body");
  withRaw(article, s, (raw) => { article.innerHTML = renderSkillMarkdown(raw); });
}

const kTok = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function usageHtml(g, s) {
  const u = g.usage;
  const muted = (t) => `<span class="${C.rowValueMuted}">${t}</span>`;
  if (!u) return muted("Reading session logs…");
  if (!u.tracked) {
    return muted("Not tracked. Typecase reads Claude Code and Codex session logs; Cursor and Grok keep none it can read.");
  }
  const li = (html) => `<li class="${C.valueLi}">${html}</li>`;
  const lines = [];
  lines.push(li(
    `<strong>${plural(u.recent, "use")}</strong> in ${u.windowDays} days · ${u.total} all time · ` +
    (u.lastAt ? `last used ${agoText(u.lastAt)}` : "never used"),
  ));
  if (u.total) {
    const parts = [];
    if (u.how.agent) parts.push(`the agent ${u.how.agent}×`);
    if (u.how.typed) parts.push(`you typed <code>/${esc(s.name)}</code> ${u.how.typed}×`);
    if (u.how.read) parts.push(`read by Codex ${u.how.read}×`);
    lines.push(li(`Started by ${parts.join(" · ")}`));
    if (u.how.typed && !u.how.agent && !u.how.read) {
      lines.push(li(muted("The agent never picks this on its own. Its description may not match how you ask for it.")));
    }
  }
  if (u.hit) {
    lines.push(li(
      `Used in ${u.hit.used} of ${plural(u.hit.offered, "session")} that offered it (${Math.round(u.hit.rate * 100)}%) · ` +
      `~${u.hit.listingTokens} tokens of description in each ≈ ${kTok(u.hit.contextTokens)} so far`,
    ));
  }
  const byTool = Object.entries(u.byLog).map(([log, n]) => `${LOG_LABEL[log]} ${n}`);
  for (const t of u.untracked) byTool.push(muted(`${esc(toolLabel(t))} not tracked`));
  if (byTool.length > 1) lines.push(li(`By tool: ${byTool.join(" · ")}`));
  if (u.edit) {
    lines.push(li(
      `Edited ${esc(new Date(u.edit.editedAt).toLocaleDateString())}: ${plural(u.edit.before, "use")} in the ${u.edit.days} days before, ` +
      `${u.edit.after} in the ${u.edit.days} days after`,
    ));
  }
  return `<ul class="${C.valueList}">${lines.join("")}</ul>`;
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
  for (const el of document.querySelectorAll("[data-list-only]")) el.hidden = state.view === "detail";
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
  renderFilters();
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
  renderFilters();
  renderContent();
  $("#content").scrollTop = scrollTop;
}
window.addEventListener("focus", () => { if (Date.now() - usageAt > 60_000) loadUsage(); });

window.typecase.onSkillsChanged(async () => {
  data = await window.typecase.data();
  model = buildModel();
  rowsCache = null;
  rawCache.clear();
  renderFilters();
  renderContent();
  loadUsage();
});

applyShellStyles();
applyTheme();
load();
