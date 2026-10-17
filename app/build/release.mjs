/* Not notarized. Each bundle gets a full ad-hoc signature: the default
   linker-only signature fails a deep check, and macOS reports a
   downloaded copy as damaged instead of unverified. */

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(appDir, "dist");
const out = path.join(dist, "release");
const run = (cmd, args) => execFileSync(cmd, args, { cwd: appDir, stdio: "inherit" });

run("npx", ["electron-builder", "--mac", "--dir", "--arm64", "--x64"]);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const [arch, dir] of [["arm64", "mac-arm64"], ["x64", "mac"]]) {
  const bundle = path.join(dist, dir, "Typecase.app");
  run("codesign", ["--force", "--deep", "--sign", "-", bundle]);
  run("codesign", ["--verify", "--deep", "--strict", bundle]);
  const zip = path.join(out, `Typecase-mac-${arch}.zip`);
  run("ditto", ["-c", "-k", "--keepParent", bundle, zip]);
  console.log(`wrote ${path.relative(appDir, zip)}`);
}
