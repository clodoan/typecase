import * as stylex from "@stylexjs/stylex";

import { vars } from "./tokens.stylex.mjs";

export const darkTheme = stylex.createTheme(vars, {
  canvas: "#161618",
  panel: "#1d1d1f",
  card: "#242426",
  ink: "#f2f2f3",
  ink2: "#98989d",
  ink3: "#68686d",
  hairline: "rgba(255, 255, 255, 0.09)",
  hover: "rgba(255, 255, 255, 0.06)",
  activeRow: "rgba(255, 255, 255, 0.09)",
  pill: "rgba(40, 40, 42, 0.86)",
  pillBorder: "rgba(255, 255, 255, 0.1)",
  shadow: "0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 28px rgba(0, 0, 0, 0.36)",
  shadowFloat: "0 2px 6px rgba(0, 0, 0, 0.4), 0 16px 44px rgba(0, 0, 0, 0.5)",
  accent: "#2aa18f",
  accentInk: "#06211c",
  danger: "#ef6a5e",
  added: "#35a46c",
});
