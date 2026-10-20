// Write the MCP server entry into the configs that Cursor and Grok read,
// pointing both tools at one skills library. Used by the app's Connect
// buttons and `typecase connect <cursor|grok>`.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { home } from "./paths.mjs";

export const SERVER_NAME = "typecase";

/**
 * Prefer the checkout's own bin (works offline, no install step); fall back
 * to the npx form for packaged-app users without a checkout.
 */
export function serverCommand(libraryDir, { preferNpx = false } = {}) {
  const localBin = fileURLToPath(new URL("../mcp-server.mjs", import.meta.url));
  if (!preferNpx && existsSync(localBin)) {
    return { command: "node", args: [localBin, "--library", libraryDir] };
  }
  return { command: "npx", args: ["-y", "github:clodoan/typecase", "mcp", "--library", libraryDir] };
}

/** Merge mcpServers.typecase into ~/.cursor/mcp.json (kept otherwise intact). */
export function writeCursorMcpConfig(libraryDir, { preferNpx = false } = {}) {
  const file = path.join(home(), ".cursor", "mcp.json");
  let config = {};
  if (existsSync(file)) {
    try {
      config = JSON.parse(readFileSync(file, "utf8"));
    } catch (err) {
      throw new Error(`${file} is not valid JSON (${err.message}) — fix it first, nothing was written`);
    }
  }
  config.mcpServers = { ...config.mcpServers, [SERVER_NAME]: serverCommand(libraryDir, { preferNpx }) };
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
  return { file, server: config.mcpServers[SERVER_NAME] };
}

const tomlString = (s) => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * Add or replace the `[mcp_servers.typecase]` section in ~/.grok/config.toml.
 * Grok Build reads MCP servers from this file (xai-grok-shell README).
 */
export function writeGrokMcpConfig(libraryDir, { preferNpx = false } = {}) {
  const file = path.join(process.env.GROK_HOME ?? path.join(home(), ".grok"), "config.toml");
  const { command, args } = serverCommand(libraryDir, { preferNpx });
  const section =
    `[mcp_servers.${SERVER_NAME}]\n` +
    `command = ${tomlString(command)}\n` +
    `args = [${args.map(tomlString).join(", ")}]\n`;

  let text = existsSync(file) ? readFileSync(file, "utf8") : "";
  const re = new RegExp(`^\\[mcp_servers\\.${SERVER_NAME}\\]\\n(?:(?!^\\[).*\\n?)*`, "m");
  if (re.test(text)) {
    text = text.replace(re, section);
  } else {
    text = text ? text.replace(/\n*$/, "\n\n") + section : section;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  return { file, server: { command, args } };
}

export function writeMcpConfig(target, libraryDir, opts) {
  if (target === "cursor") return writeCursorMcpConfig(libraryDir, opts);
  if (target === "grok") return writeGrokMcpConfig(libraryDir, opts);
  throw new Error(`unknown connect target: ${target} (cursor or grok)`);
}
