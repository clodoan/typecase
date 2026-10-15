/* Every component style, ported from the old app.css. Semantic class
   names (skill-row, nav-item, …) stay on elements for tests and event
   delegation; these StyleX rules carry all presentation. */

import * as stylex from "@stylexjs/stylex";

import { vars } from "./tokens.stylex.mjs";

export const styles = stylex.create({
  html: { height: "100%", overflow: "hidden" },
  body: {
    height: "100%",
    fontFamily: vars.font,
    fontSize: "13px",
    color: vars.ink,
    backgroundColor: vars.canvas,
    overflow: "hidden",
  },

  // 4px window inset keeps the panels concentric with the 16pt window corner.
  app: { display: "flex", height: "100vh", padding: "4px", gap: "4px", backgroundColor: "transparent" },

  /* ---- Sidebar: floating, rounded inset ---- */
  sidebar: {
    width: "216px",
    flex: "none",
    display: "flex",
    flexDirection: "column",
    borderRadius: vars.radiusPanel,
    backgroundColor: vars.sidebarBg,
    borderWidth: "0.5px", borderStyle: "solid", borderColor: vars.hairline,
    overflow: "hidden",
  },
  sidebarHidden: { width: 0, marginRight: "-4px", opacity: 0, pointerEvents: "none" },
  sidebarDrag: { height: "52px", flex: "none" },

  sidenav: { flex: 1, overflowY: "auto", padding: "0 3.5px 3.5px" },
  navHeading: {
    fontSize: "10.5px",
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: vars.ink3,
    padding: "14px 14px 5px",
  },
  /* Interaction states shared by every sidebar and toolbar item. Active is
     a fill and color change only, so labels never change width. */
  item: {
    backgroundColor: { default: "transparent", ":hover": vars.hover },
    color: { default: vars.ink2, ":hover": vars.ink },
  },
  itemActive: {
    backgroundColor: { default: vars.activeRow, ":hover": vars.activeRow },
    color: { default: vars.ink, ":hover": vars.ink },
  },

  navItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    width: "100%",
    padding: "5px 14px",
    borderStyle: "none", borderWidth: 0,
    borderRadius: vars.radiusInset,
    fontFamily: "inherit",
    fontSize: "inherit",
    textAlign: "left",
    cursor: "default",
  },
  navLabel: { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 },
  navCount: { marginLeft: "auto", color: vars.ink3, fontSize: "11px", fontVariantNumeric: "tabular-nums" },
  navIcon: { display: "inline-flex", flex: "none" },

  /* ---- Main panel ---- */
  main: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    borderRadius: vars.radiusPanel,
    backgroundColor: vars.panel,
    borderWidth: "0.5px", borderStyle: "solid", borderColor: vars.hairline,
    overflow: "hidden",
    position: "relative",
  },
  // Window padding strip above both panels.
  appDrag: { position: "fixed", top: 0, left: 0, right: 0, height: "4px", zIndex: 20 },
  // Covers the band the floating toolbar sits in, down to where content starts.
  mainDrag: { position: "absolute", top: 0, left: 0, right: 0, height: "54px", zIndex: 5 },

  /* ---- Floating toolbar: 4px inside the panel, controls 4px inside it.
     Insets are 3.5px because the container's 0.5px hairline border makes up
     the rest; radii are concentric when outer edges are 4px apart. ---- */
  toolbar: {
    position: "absolute",
    top: "3.5px",
    left: "3.5px",
    right: "3.5px",
    zIndex: 10,
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "3.5px",
    borderRadius: vars.radiusInset,
    backgroundColor: vars.pill,
    backdropFilter: "blur(20px) saturate(1.2)",
    borderWidth: "0.5px", borderStyle: "solid", borderColor: vars.pillBorder,
    boxShadow: vars.shadow,
  },
  // Sidebar hidden on macOS: clear the traffic lights (they end at x≈80).
  toolbarBesideLights: { paddingLeft: "84px" },
  /* One control shape for everything in the toolbar: icon buttons, the
     detail tabs, and the search field share height and radius; colors come
     from item / itemActive. */
  control: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: "28px",
    borderStyle: "none", borderWidth: 0,
    borderRadius: vars.radiusControl,
    fontFamily: "inherit",
    fontSize: "12px",
    cursor: "default",
  },
  controlIcon: { width: "28px" },
  controlText: { padding: "0 10px" },
  tbSep: { width: "1px", height: "16px", backgroundColor: vars.hairline, margin: "0 2px" },
  backGroup: { display: "flex", alignItems: "center", gap: "6px" },
  // Centered on the toolbar, independent of what sits on either side.
  tbTabs: { position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "2px" },
  tbSpacer: { flex: 1 },


  searchPill: { gap: "6px", borderWidth: "0.5px", borderStyle: "solid", borderColor: vars.hairline, fontSize: "11.5px" },
  // Plain text: a boxed key would need a 0px radius inside the 4px control.
  searchKbd: { fontFamily: vars.font, fontSize: "10px", color: vars.ink3 },

  /* ---- Content ---- */
  // Stable gutter: short tabs (no scrollbar) keep the same column width.
  content: { flex: 1, overflowY: "auto", scrollbarGutter: "stable", padding: "58px 22px 40px" },

  countHead: { display: "flex", alignItems: "baseline", gap: "10px", padding: "6px 2px 16px" },
  countHeadH1: { fontSize: "22px", fontWeight: 700, letterSpacing: "-0.02em", margin: 0 },
  countHeadSub: { color: vars.ink3, fontSize: "12px" },

  /* Compact skill rows */
  rowsList: { borderTopWidth: "0.5px", borderTopStyle: "solid", borderTopColor: vars.hairline },
  skillRow: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    padding: "9px 10px",
    margin: "0 -10px",
    borderBottomWidth: "0.5px", borderBottomStyle: "solid", borderBottomColor: vars.hairline,
    borderRadius: vars.radiusInset,
    outline: "none",
    backgroundColor: { default: null, ":hover": vars.hover, ":focus-visible": vars.activeRow },
    // Keyboard focus scrolls rows clear of the floating toolbar (the
    // content's 58px top padding) and off the panel's bottom edge.
    scrollMarginTop: "58px",
    scrollMarginBottom: "12px",
  },
  skillRowFocused: { backgroundColor: { default: vars.activeRow, ":hover": vars.activeRow } },
  rName: {
    flex: "none",
    width: "218px",
    fontSize: "13px",
    fontWeight: 600,
    letterSpacing: "-0.01em",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rDesc: {
    flex: 1,
    minWidth: 0,
    color: vars.ink2,
    fontSize: "11.5px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rBadges: { flex: "none", display: "flex", gap: "4px" },
  rTool: {
    flex: "none",
    width: "138px",
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    fontSize: "10.5px",
    color: vars.ink3,
    whiteSpace: "nowrap",
    overflow: "hidden",
  },
  rToolIcon: { flex: "none", opacity: 0.8 },
  rTok: {
    flex: "none",
    width: "52px",
    textAlign: "right",
    fontSize: "10.5px",
    color: vars.ink3,
    fontVariantNumeric: "tabular-nums",
  },

  badge: {
    fontSize: "9.5px",
    fontWeight: 600,
    letterSpacing: "0.03em",
    padding: "2px 6px",
    borderRadius: "999px",
    backgroundColor: vars.activeRow,
    color: vars.ink2,
  },

  /* ---- Detail view ---- */
  detail: { maxWidth: "760px", margin: "0 auto" },
  detailTop: { display: "flex", alignItems: "center", gap: "8px", paddingBottom: "6px" },
  spacer: { flex: 1 },
  iconBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "26px",
    height: "26px",
    borderWidth: "0.5px", borderStyle: "solid", borderColor: vars.hairline,
    borderRadius: "999px",
    backgroundColor: { default: "transparent", ":hover": vars.hover },
    color: { default: vars.ink2, ":hover": vars.ink },
    cursor: "default",
    fontSize: "12px",
  },
  iconBtnActive: {
    backgroundColor: { default: vars.accent, ":hover": vars.accent },
    color: { default: vars.accentInk, ":hover": vars.accentInk },
    borderColor: "transparent",
  },

  detailHero: {
    fontSize: "42px",
    fontWeight: 800,
    letterSpacing: "-0.035em",
    lineHeight: 1.05,
    padding: "18px 0 10px",
    overflowWrap: "anywhere",
  },
  detailSub: { color: vars.ink2, fontSize: "14px", lineHeight: 1.5, maxWidth: "60ch", paddingBottom: "10px" },
  detailBadges: { display: "flex", gap: "6px", paddingBottom: "18px", flexWrap: "wrap" },

  rows: { borderTopWidth: "0.5px", borderTopStyle: "solid", borderTopColor: vars.hairline },
  row: {
    display: "grid",
    gridTemplateColumns: "148px 1fr",
    gap: "18px",
    padding: "13px 0",
    borderBottomWidth: "0.5px", borderBottomStyle: "solid", borderBottomColor: vars.hairline,
  },
  rowLabel: {
    color: vars.ink3,
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    paddingTop: "2px",
  },
  rowValue: { fontSize: "12.5px", lineHeight: 1.55, color: vars.ink, minWidth: 0, overflowWrap: "anywhere" },
  rowValueMuted: { color: vars.ink3 },
  valueList: { listStyle: "none", margin: 0, padding: 0 },
  valueLi: { padding: "1px 0" },
  mono: { fontFamily: vars.mono, fontSize: "11.5px" },
  monoDim: { fontFamily: vars.mono, fontSize: "11.5px", color: vars.ink3 },

  toolChips: { display: "flex", flexWrap: "wrap", gap: "5px" },
  toolChip: {
    fontFamily: vars.mono,
    fontSize: "10.5px",
    padding: "3px 8px",
    borderRadius: "6px",
    backgroundColor: vars.activeRow,
    color: vars.ink2,
  },

  pathRow: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", padding: "1px 0" },
  miniBtn: {
    borderWidth: "0.5px", borderStyle: "solid", borderColor: vars.hairline,
    borderRadius: "999px",
    padding: "3px 10px",
    backgroundColor: { default: "transparent", ":hover": vars.hover },
    color: { default: vars.ink2, ":hover": vars.ink },
    fontFamily: "inherit",
    fontSize: "11px",
    cursor: "default",
  },

  linkSkill: { color: vars.accent, cursor: "default", textDecoration: { default: "none", ":hover": "underline" } },

  frontmatterPop: {
    margin: "10px 0 2px",
    padding: "12px 14px",
    borderRadius: "10px",
    backgroundColor: vars.card,
    borderWidth: "0.5px", borderStyle: "solid", borderColor: vars.hairline,
    fontFamily: vars.mono,
    fontSize: "11px",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    color: vars.ink2,
    boxShadow: vars.shadow,
  },

  /* Source + history */
  sourceBlock: {
    fontFamily: vars.mono,
    fontSize: "11.5px",
    lineHeight: 1.65,
    whiteSpace: "pre-wrap",
    backgroundColor: vars.card,
    borderWidth: "0.5px", borderStyle: "solid", borderColor: vars.hairline,
    borderRadius: "12px",
    padding: "18px 20px",
    color: vars.ink,
    overflowWrap: "anywhere",
  },
  historyEntry: { padding: "14px 0", borderBottomWidth: "0.5px", borderBottomStyle: "solid", borderBottomColor: vars.hairline },
  historyH3: { fontSize: "13px", paddingBottom: "6px", display: "flex", gap: "8px", alignItems: "baseline", margin: 0 },
  historyHash: { fontFamily: vars.mono, fontSize: "10px", color: vars.ink3 },
  historyPara: { fontSize: "12.5px", lineHeight: 1.55, color: vars.ink2, paddingBottom: "8px" },
  diffList: { listStyle: "none", fontSize: "11.5px", margin: 0, padding: 0 },
  diffLi: {
    padding: "2px 0 2px 14px",
    position: "relative",
    color: vars.ink2,
    "::before": {
      content: '""',
      position: "absolute",
      left: "2px",
      top: "9px",
      width: "5px",
      height: "5px",
      borderRadius: "50%",
      backgroundColor: vars.ink3,
    },
  },
  diffLiAdded: { "::before": { backgroundColor: vars.added } },
  diffLiRemoved: { "::before": { backgroundColor: vars.danger } },
  diffLiChanged: { "::before": { backgroundColor: vars.accent } },
  emptyHint: { color: vars.ink3, fontSize: "12.5px", padding: "18px 0" },

  /* ---- Command palette ---- */
  paletteBackdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 100,
    backgroundColor: "rgba(10, 8, 6, 0.25)",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
    paddingTop: "14vh",
  },
  palette: {
    width: "540px",
    maxHeight: "420px",
    display: "flex",
    flexDirection: "column",
    borderRadius: vars.radiusPanel,
    backgroundColor: vars.panel,
    borderWidth: "0.5px", borderStyle: "solid", borderColor: vars.hairline,
    boxShadow: vars.shadowFloat,
    overflow: "hidden",
  },
  paletteInput: {
    borderStyle: "none", borderWidth: 0,
    outline: 0,
    backgroundColor: "transparent",
    color: vars.ink,
    fontFamily: "inherit",
    fontSize: "15px",
    padding: "15px 18px",
    borderBottomWidth: "0.5px", borderBottomStyle: "solid", borderBottomColor: vars.hairline,
  },
  paletteResults: { overflowY: "auto", padding: "3.5px" },
  // Scroll margin = the results padding, so a selected row never sits flush
  // against (and clipped by) the palette's rounded edge.
  paletteRow: { display: "flex", alignItems: "baseline", gap: "10px", padding: "8px 14px", borderRadius: vars.radiusInset, scrollMarginTop: "3.5px", scrollMarginBottom: "3.5px" },
  paletteRowSelected: { backgroundColor: vars.accent, color: vars.accentInk },
  paletteName: { fontWeight: 600, fontSize: "13px" },
  paletteDesc: {
    flex: 1,
    fontSize: "11.5px",
    color: vars.ink3,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  paletteDescSelected: { color: vars.accentInk, opacity: 0.75 },
  paletteTool: { fontSize: "10px", color: vars.ink3 },
  paletteToolSelected: { color: vars.accentInk, opacity: 0.75 },
});

/* Rendered skill markdown (classes are stamped per token in markdown.mjs). */
export const md = stylex.create({
  root: { fontSize: "13.5px", lineHeight: 1.65, color: vars.ink, overflowWrap: "break-word", padding: "24px 0 40px" },
  block: { marginTop: 0, marginBottom: "12px" },
  p: {},
  h: {
    color: vars.ink,
    fontWeight: 650,
    letterSpacing: "-0.01em",
    lineHeight: 1.3,
    marginTop: { default: "28px", ":first-child": 0 },
    marginBottom: "10px",
    scrollMarginTop: "64px",
  },
  h1: { fontSize: "20px", fontWeight: 700, letterSpacing: "-0.02em" },
  h2: { fontSize: "17px" },
  h3: { fontSize: "14.5px" },
  h4: { fontSize: "13.5px", color: vars.ink2 },
  list: { paddingLeft: "22px" },
  li: { marginTop: "4px", "::marker": { color: vars.ink3 } },
  blockquote: {
    paddingLeft: "14px",
    borderLeftWidth: "3px", borderLeftStyle: "solid", borderLeftColor: vars.hairline,
    color: vars.ink2,
  },
  pre: {
    padding: "12px 14px",
    borderRadius: "8px",
    backgroundColor: vars.hover,
    borderWidth: "0.5px", borderStyle: "solid", borderColor: vars.hairline,
    overflowX: "auto",
    fontFamily: vars.mono,
    fontSize: "12px",
    lineHeight: 1.55,
  },
  preCode: { fontFamily: "inherit", fontSize: "inherit", backgroundColor: "transparent", padding: 0, borderRadius: 0, whiteSpace: "pre" },
  codeInline: { fontFamily: vars.mono, fontSize: "0.86em", backgroundColor: vars.activeRow, padding: "1px 5px", borderRadius: "4px" },
  table: { display: "block", overflowX: "auto", borderCollapse: "collapse", fontSize: "12.5px" },
  cell: {
    borderWidth: "0.5px", borderStyle: "solid", borderColor: vars.hairline,
    padding: "6px 10px",
    textAlign: "left",
    verticalAlign: "top",
  },
  th: { fontWeight: 600, backgroundColor: vars.hover },
  hr: { borderStyle: "none", borderTopWidth: "0.5px", borderTopStyle: "solid", borderTopColor: vars.hairline, margin: "22px 0" },
  link: { color: vars.accent, cursor: "pointer", textDecoration: { default: "none", ":hover": "underline" } },
});
