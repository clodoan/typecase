#!/usr/bin/env node
// Thin bin for `typecase-mcp` / `npx github:clodoan/typecase typecase-mcp`.
// All logic lives in lib/mcp-serve.mjs; `typecase mcp` runs the same code.

import process from "node:process";

import { runMcp } from "./lib/mcp-serve.mjs";

try {
  runMcp(process.argv.slice(2));
} catch (err) {
  console.error(`typecase-mcp: ${err?.message ?? err}`);
  process.exit(2);
}
