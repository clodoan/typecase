// Local transports for the Typecase MCP server: stdio (what editors spawn)
// and a small Streamable-HTTP listener for anything that prefers a URL.

import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import path from "node:path";
import process from "node:process";

import { createFsLibrary } from "./library-fs.mjs";
import { createGithubLibrary } from "./library-github.mjs";
import { createMcpHandler, handleHttpMcp } from "./mcp-core.mjs";
import { home } from "./paths.mjs";

export const SERVER_VERSION = "0.2.0";

/** The library dir named by TYPECASE_LIBRARY or a typecase.json, else null. */
export function configuredLibraryDir({ cwd = process.cwd() } = {}) {
  if (process.env.TYPECASE_LIBRARY) return path.resolve(process.env.TYPECASE_LIBRARY);
  for (const cfg of [path.join(cwd, "typecase.json"), path.join(home(), ".config", "typecase", "typecase.json")]) {
    if (!existsSync(cfg)) continue;
    try {
      const parsed = JSON.parse(readFileSync(cfg, "utf8"));
      if (parsed.library?.dir) return path.resolve(path.dirname(cfg), parsed.library.dir);
    } catch {}
  }
  return null;
}

/** --library beats TYPECASE_LIBRARY beats typecase.json `library.dir` beats cwd. */
export function resolveLibraryDir({ cwd = process.cwd(), flag = null } = {}) {
  if (flag) return path.resolve(cwd, flag);
  return configuredLibraryDir({ cwd }) ?? cwd;
}

function makeLibrary({ repo, libraryDir }) {
  if (repo) return createGithubLibrary({ repo, token: process.env.GITHUB_TOKEN });
  return createFsLibrary(libraryDir);
}

function runStdio(handler) {
  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on("line", async (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "invalid JSON" } }) + "\n");
      return;
    }
    const res = await handler.handle(msg);
    if (res !== null) process.stdout.write(JSON.stringify(res) + "\n");
  });
  rl.on("close", () => process.exit(0));
}

function runHttp(handler, { port, label }) {
  const authToken = process.env.TYPECASE_AUTH_TOKEN || null;
  const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ name: "typecase-mcp", version: SERVER_VERSION, library: label, mcp: "/mcp" }) + "\n");
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const out = await handleHttpMcp(handler, {
      method: req.method,
      body: Buffer.concat(chunks).toString("utf8") || "null",
      authToken,
      authorization: req.headers.authorization,
    });
    res.writeHead(out.status, { "content-type": "application/json" });
    res.end(out.json === null ? "" : JSON.stringify(out.json) + "\n");
  });
  server.listen(port, () => {
    console.error(`typecase mcp: serving ${label} on http://localhost:${port}/mcp${authToken ? " (bearer auth)" : ""}`);
  });
  return server;
}

/**
 * `typecase mcp [--library dir | --repo owner/repo] [--http [port]]`
 * Default transport is stdio (that is what mcp.json `command` entries spawn).
 */
export function runMcp(args) {
  const rest = [...args];
  const take = (flag) => {
    const i = rest.indexOf(flag);
    if (i === -1) return null;
    const value = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest.splice(i, 2)[1] : (rest.splice(i, 1), true);
    return value;
  };
  const libraryFlag = take("--library");
  const repo = take("--repo") ?? process.env.SKILLS_REPO ?? null;
  const http = take("--http");

  const libraryDir = resolveLibraryDir({ flag: typeof libraryFlag === "string" ? libraryFlag : null });
  const label = repo ? `github:${repo}` : libraryDir;
  const library = makeLibrary({ repo: typeof repo === "string" ? repo : null, libraryDir });
  const handler = createMcpHandler(library, { name: "typecase", version: SERVER_VERSION });

  if (http) {
    const port = typeof http === "string" ? Number(http) : 8787;
    if (!Number.isInteger(port) || port < 0) throw new Error(`--http needs a port number, got: ${http}`);
    return runHttp(handler, { port, label });
  }
  console.error(`typecase mcp: serving ${label} over stdio`);
  runStdio(handler);
  return null;
}
