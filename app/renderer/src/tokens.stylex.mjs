import * as stylex from "@stylexjs/stylex";

export const vars = stylex.defineVars({
  font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif',
  mono: '"SF Mono", ui-monospace, Menlo, Consolas, monospace',
  /* Concentric corners: each radius is its container's radius minus the
     4px inset between them, starting from the native macOS 26 window
     corner (16pt). window 16 → panel 12 → toolbar / nav item 8 → control 4. */
  radiusPanel: "12px",
  radiusInset: "8px",
  radiusControl: "4px",

  canvas: "#f5f5f7",
  panel: "#ffffff",
  card: "#ffffff",
  ink: "#1d1d1f",
  ink2: "#6e6e73",
  ink3: "#a1a1a6",
  hairline: "rgba(0, 0, 0, 0.08)",
  sidebarBg: "rgba(245, 245, 247, 0.72)",
  hover: "rgba(0, 0, 0, 0.04)",
  activeRow: "rgba(0, 0, 0, 0.07)",
  pill: "rgba(255, 255, 255, 0.85)",
  pillBorder: "rgba(0, 0, 0, 0.08)",
  shadow: "0 1px 2px rgba(0, 0, 0, 0.05), 0 8px 28px rgba(0, 0, 0, 0.07)",
  shadowFloat: "0 2px 6px rgba(0, 0, 0, 0.08), 0 16px 44px rgba(0, 0, 0, 0.14)",
  accent: "#0e7a6b",
  accentInk: "#ffffff",
  danger: "#c2372c",
  added: "#35a46c",
});
