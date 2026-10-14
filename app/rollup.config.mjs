/* Renderer build: compiles StyleX (src/*.mjs + src/app.js) into
   renderer/dist/app.js and the extracted renderer/dist/app.css.
   Run via `npm run build`; prestart/predist keep `npm start` and
   `npm run dist` working unchanged. */

import { nodeResolve } from "@rollup/plugin-node-resolve";
import stylexPlugin from "@stylexjs/rollup-plugin";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default {
  input: "renderer/src/app.js",
  output: {
    file: "renderer/dist/app.js",
    format: "iife",
  },
  plugins: [
    nodeResolve(),
    stylexPlugin({
      fileName: "app.css",
      dev: false,
      unstable_moduleResolution: { type: "commonJS", rootDir: here },
    }),
  ],
};
