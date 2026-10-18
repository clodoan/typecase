import { app, BrowserWindow } from "electron";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const VARIANTS = {
  prod: { top: "#18917f", bottom: "#0a5a4f", sort: "#0e7a6b", ribbon: null },
  dev: { top: "#f5aa3f", bottom: "#d8661a", sort: "#c4560f", ribbon: "DEV" },
};

/* macOS icon grid: 824px body inside a 1024px canvas. The body is a
   superellipse; nested shapes are concentric with it (radius minus inset):
   body ≈185 → tray 101 (inset 84) → wells 73 (inset 28). */
function squircle(x, y, size, n = 5, steps = 360) {
  const a = size / 2;
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    pts.push([x + a + a * Math.sign(c) * Math.abs(c) ** (2 / n), y + a + a * Math.sign(s) * Math.abs(s) ** (2 / n)]);
  }
  return "M" + pts.map((p) => p.map((v) => v.toFixed(2)).join(" ")).join("L") + "Z";
}

function svg({ top, bottom, sort, ribbon }) {
  const body = squircle(100, 100, 824);
  const tray = { x: 184, y: 184, size: 656, r: 101 };
  const gap = 28, cell = (tray.size - gap * 4) / 3, wide = cell * 2 + gap, r = 73;
  const col = (i) => tray.x + gap + i * (cell + gap);
  const row = (i) => tray.y + gap + i * (cell + gap);
  const wells = [
    [col(0), row(0), cell], [col(1), row(0), cell], [col(2), row(0), cell],
    [col(0), row(1), wide], [col(2), row(1), cell],
    [col(0), row(2), cell], [col(1), row(2), wide],
  ];
  const wellRects = wells.slice(1).map(([x, y, w]) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${cell}" rx="${r}" fill="url(#well)"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${cell}" rx="${r}" fill="none" stroke="rgba(60,40,10,0.16)" stroke-width="3"/>`).join("");
  const [sx, sy] = wells[0];
  const ribbonSvg = ribbon ? `
    <g clip-path="url(#body)">
      <g transform="translate(724 724) rotate(-45)">
        <rect x="-420" y="-74" width="840" height="148" fill="#1d1d1f"/>
        <text x="0" y="40" text-anchor="middle" font-family="-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif" font-weight="800" font-size="112" letter-spacing="10" fill="#ffffff">${ribbon}</text>
      </g>
    </g>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
    <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf7ee"/><stop offset="1" stop-color="#efe7d6"/></linearGradient>
    <linearGradient id="well" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ddd3bf"/><stop offset="1" stop-color="#e9e1cf"/></linearGradient>
    <clipPath id="body"><path d="${body}"/></clipPath>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity="0.3"/></filter>
    <filter id="lift" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.28"/></filter>
  </defs>
  <path d="${body}" fill="url(#bg)" filter="url(#shadow)"/>
  <path d="${body}" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="3"/>
  <rect x="${tray.x}" y="${tray.y}" width="${tray.size}" height="${tray.size}" rx="${tray.r}" fill="url(#paper)" filter="url(#lift)"/>
  ${wellRects}
  <rect x="${sx}" y="${sy}" width="${cell}" height="${cell}" rx="${r}" fill="${sort}"/>
  <text x="${sx + cell / 2}" y="${sy + cell / 2 + 46}" text-anchor="middle" font-family="'New York', ui-serif, Georgia, serif" font-weight="700" font-size="138" fill="#fbf7ee">T</text>
  ${ribbonSvg}
</svg>`;
}

// No top-level await: it would block Electron's ready event in an ESM entry.
app.whenReady().then(main);

let win;
async function render(name, variant) {
  const source = svg(variant);
  writeFileSync(path.join(here, `${name}.svg`), source);
  const dataUrl = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 1024;
      c.getContext("2d").drawImage(img, 0, 0);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = "data:image/svg+xml;base64," + ${JSON.stringify(Buffer.from(source).toString("base64"))};
  })`);
  const png = path.join(here, `${name}.png`);
  writeFileSync(png, Buffer.from(dataUrl.split(",")[1], "base64"));
  return png;
}

async function main() {
  win = new BrowserWindow({ show: false });
  await win.loadURL("about:blank");
  const prodPng = await render("icon", VARIANTS.prod);
  await render("icon-dev", VARIANTS.dev);
  win.destroy();

  const iconset = path.join(here, "icon.iconset");
  rmSync(iconset, { recursive: true, force: true });
  mkdirSync(iconset);
  for (const size of [16, 32, 128, 256, 512]) {
    for (const [scale, suffix] of [[1, ""], [2, "@2x"]]) {
      const out = path.join(iconset, `icon_${size}x${size}${suffix}.png`);
      execFileSync("sips", ["-z", String(size * scale), String(size * scale), prodPng, "--out", out], { stdio: "ignore" });
    }
  }
  execFileSync("iconutil", ["-c", "icns", iconset, "-o", path.join(here, "icon.icns")]);
  rmSync(iconset, { recursive: true });
  rmSync(prodPng);
  console.log("wrote build/icon.icns, build/icon-dev.png (+ .svg sources)");
  app.quit();
}
