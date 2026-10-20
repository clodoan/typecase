import { app, BrowserWindow, dialog, ipcMain, shell, nativeTheme } from "electron";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, watch, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// electron-builder can't pack files above the app root, so the packaged
// app carries a copy under Contents/Resources/lib (extraResources in
// package.json) and resolves it from there.
const libURL = app.isPackaged
  ? pathToFileURL(path.join(process.resourcesPath, "lib") + path.sep)
  : new URL("../scripts/lib/", import.meta.url);
const { discover, displayGroups } = await import(new URL("discover.mjs", libURL).href);
const { readLock, diffAgainstLock, LOCKFILE, CHANGELOG, sourceOf } = await import(new URL("lockfile.mjs", libURL).href);
const { configuredLibraryDir } = await import(new URL("mcp-serve.mjs", libURL).href);
const { writeMcpConfig } = await import(new URL("connect.mjs", libURL).href);
const { writeMirror, watchMirror } = await import(new URL("mirror.mjs", libURL).href);

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

ipcMain.handle("typecase:source", (_e, dir) => sourceOf({ dir }));

// The library is the one folder (usually a checkout of your skills repo)
// that Connect and Mirror act on. First use asks for it, then it is
// remembered in ~/.config/typecase/typecase.json.
async function pickLibraryDir() {
  const configured = configuredLibraryDir({ cwd: workdir });
  if (configured && existsSync(configured)) return configured;
  const res = await dialog.showOpenDialog(win, {
    title: "Choose your skills library folder (a checkout of your skills repo)",
    properties: ["openDirectory"],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const chosen = res.filePaths[0];
  const cfgFile = path.join(process.env.TYPECASE_HOME ?? homedir(), ".config", "typecase", "typecase.json");
  let cfg = {};
  if (existsSync(cfgFile)) {
    try { cfg = JSON.parse(readFileSync(cfgFile, "utf8")); } catch {}
  }
  cfg.library = { ...cfg.library, dir: chosen };
  mkdirSync(path.dirname(cfgFile), { recursive: true });
  writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + "\n");
  return chosen;
}

ipcMain.handle("typecase:connect", async (_e, target) => {
  const libraryDir = await pickLibraryDir();
  if (!libraryDir) return { canceled: true };
  const res = writeMcpConfig(target, libraryDir, { preferNpx: app.isPackaged });
  return { ...res, libraryDir };
});

let mirrorWatcher = null;
ipcMain.handle("typecase:mirror", async () => {
  const libraryDir = await pickLibraryDir();
  if (!libraryDir) return { canceled: true };
  const summary = await writeMirror(libraryDir);
  // Keep the mirror fresh while the app is open.
  if (!mirrorWatcher) mirrorWatcher = watchMirror(libraryDir, { onUpdate: () => win?.webContents.send("skills-changed") });
  return summary;
});

app.whenReady().then(() => {
  // Dev runs get the amber DEV icon so they never pass for the packaged
  // app in the Dock or app switcher (the packaged icon is build/icon.icns).
  if (isMac && !app.isPackaged) app.dock.setIcon(path.join(here, "build", "icon-dev.png"));
  createWindow();
});
app.on("window-all-closed", () => app.quit());
