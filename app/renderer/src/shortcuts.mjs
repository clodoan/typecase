export const SHORTCUTS = [
  { id: "search", keys: ["mod+k"], label: "Search skills and commands", scope: "global" },
  { id: "back", keys: ["mod+["], label: "Back" },
  { id: "forward", keys: ["mod+]"], label: "Forward" },
  { id: "nextRow", keys: ["arrowdown", "arrowright"], label: "Next skill", scope: "list" },
  { id: "prevRow", keys: ["arrowup", "arrowleft"], label: "Previous skill", scope: "list" },
  { id: "openRow", keys: ["enter"], label: "Open skill", scope: "list" },
  { id: "closeSkill", keys: ["escape"], label: "Close skill", scope: "detail" },
  { id: "tabRendered", keys: ["1"], label: "Rendered tab", scope: "detail" },
  { id: "tabSource", keys: ["2"], label: "Source tab", scope: "detail" },
  { id: "tabHistory", keys: ["3"], label: "History tab", scope: "detail" },
];

const IS_MAC = /Mac/.test(navigator.userAgent);
// Physical-key fallback so bracket shortcuts survive non-US layouts.
const CODE_KEYS = { BracketLeft: "[", BracketRight: "]", Backslash: "\\" };
const SYMBOLS = { mod: IS_MAC ? "⌘" : "Ctrl+", shift: "⇧", alt: IS_MAC ? "⌥" : "Alt+", escape: "Esc", enter: "↩" };

function parse(combo) {
  const parts = combo.toLowerCase().split("+");
  const key = parts.pop();
  return { key, mod: parts.includes("mod"), shift: parts.includes("shift"), alt: parts.includes("alt") };
}

function matches(combo, e) {
  const c = parse(combo);
  const mod = IS_MAC ? e.metaKey : e.ctrlKey;
  if (c.mod !== mod || c.alt !== e.altKey || c.shift !== e.shiftKey) return false;
  const key = e.key.toLowerCase();
  return key === c.key || CODE_KEYS[e.code] === c.key;
}

export function shortcutText(id) {
  const s = SHORTCUTS.find((x) => x.id === id);
  if (!s) return "";
  const c = parse(s.keys[0]);
  const mods = ["mod", "alt", "shift"].filter((m) => c[m]).map((m) => SYMBOLS[m]).join("");
  return mods + (SYMBOLS[c.key] ?? c.key.toUpperCase());
}

export function installShortcuts({ actions, scope }) {
  for (const s of SHORTCUTS) if (!actions[s.id]) throw new Error(`No action for shortcut "${s.id}"`);
  document.addEventListener("keydown", (e) => {
    const where = scope();
    const typing = e.target instanceof HTMLElement && e.target.matches("input, textarea, [contenteditable]");
    for (const s of SHORTCUTS) {
      const sScope = s.scope ?? "app";
      if (sScope !== "global") {
        if (where === "palette" || typing) continue;
        if (sScope !== "app" && sScope !== where) continue;
      }
      if (!s.keys.some((k) => matches(k, e))) continue;
      if (actions[s.id](e) === false) return;
      e.preventDefault();
      return;
    }
  });
}
