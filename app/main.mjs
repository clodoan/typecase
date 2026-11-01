import { app, BrowserWindow, ipcMain, shell, nativeTheme } from "electron";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, watch } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// electron-builder can't pack files above the app root, so the packaged
// app carries a copy under Contents/Resources/lib (extraResources in
// package.json) and resolves it from there.
const libURL = app.isPackaged
  ? pathToFileURL(path.join(process.resourcesPath, "lib") + path.sep)
  : new URL("../scripts/lib/", import.meta.url);
const { discover, displayGroups } = await import(new URL("discover.mjs", libURL).href);
const { readLock, diffAgainstLock, LOCKFILE, CHANGELOG } = await import(new URL("lockfile.mjs", libURL).href);
const { scanUsage } = await import(new URL("usage.mjs", libURL).href);
const { indexUsage } = await import(new URL("usage-stats.mjs", libURL).href);

const here = path.dirname(fileURLToPath(import.meta.url));
const workdir = process.env.TYPECASE_CWD ?? process.cwd();
const isMac = process.platform === "darwin";

let win;
const watchers = [];

function collectData() {
  const data = discover({ cwd: workdir });
  const lockPath = path.join(workdir, LOCKFILE);
  const lock = readLock(lockPath);
  const changes = lock ? diffAgainstLock(lock, data) : [];
  const changelogPath = path.join(workdir, CHANGELOG);
  const changelog = existsSync(changelogPath) ? readFileSync(changelogPath, "utf8") : "";
  return {
    ...data,
    displayGroups: displayGroups(data.skills),
    lock, lockPath, changes, changelog,
    platform: process.platform,
  };
}

function watchRoots(data) {
  for (const w of watchers.splice(0)) w.close();
  for (const root of data.roots.filter((r) => r.exists)) {
    try {
      const w = watch(root.dir, { recursive: true }, () => {
        clearTimeout(watchRoots.t);
        watchRoots.t = setTimeout(() => win?.webContents.send("skills-changed"), 400);
      });
      watchers.push(w);
    } catch {
      // recursive watch unsupported on some platforms/dirs — skip
    }
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 920,
    minHeight: 600,
    show: false,
    backgroundColor: windowBackground(),
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    trafficLightPosition: { x: 20, y: 19 }, // centered on the toolbar row
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.loadFile(path.join(here, "renderer", "index.html"));
  // Rendered skill markdown contains links; the window itself never
  // navigates or opens popups (the renderer routes link clicks over IPC).
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.once("ready-to-show", () => win.show());
}

ipcMain.handle("typecase:data", () => {
  const data = collectData();
  watchRoots(data);
  return data;
});

// The page paints the theme canvas itself (opaque), so a theme switch
// repaints in one frame. The native background only shows while the
// window opens or resizes; keep it matching the app theme.
const windowBackground = () => (nativeTheme.shouldUseDarkColors ? "#161618" : "#f5f5f7");
nativeTheme.on("updated", () => win?.setBackgroundColor(windowBackground()));
ipcMain.on("typecase:set-theme", (_e, theme) => {
  if (["system", "light", "dark"].includes(theme)) nativeTheme.themeSource = theme;
});

// Usage comes over its own channel so the skill list paints before the
// first (uncached) log scan finishes. Concurrent asks share one scan.
let usageScan = null;
ipcMain.handle("typecase:usage", () => {
  usageScan ??= scanUsage()
    .then(indexUsage)
    .finally(() => { usageScan = null; });
  return usageScan;
});

ipcMain.handle("typecase:raw", (_e, file) => {
  return readFileSync(file, "utf8");
});

ipcMain.handle("typecase:reveal", (_e, file) => {
  shell.showItemInFolder(file);
});

ipcMain.handle("typecase:open-external", (_e, url) => {
  if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
});

ipcMain.handle("typecase:open-editor", (_e, file) => {
  const candidates = ["cursor", "code"];
  const tryNext = (i) => {
    if (i >= candidates.length) {
      shell.showItemInFolder(file);
      return;
    }
    const child = spawn(candidates[i], [file], { detached: true, stdio: "ignore" });
    child.on("error", () => tryNext(i + 1));
    child.unref();
  };
  tryNext(0);
});

app.whenReady().then(() => {
  // Dev runs get the amber DEV icon so they never pass for the packaged
  // app in the Dock or app switcher (the packaged icon is build/icon.icns).
  if (isMac && !app.isPackaged) app.dock.setIcon(path.join(here, "build", "icon-dev.png"));
  createWindow();
});
app.on("window-all-closed", () => app.quit());
