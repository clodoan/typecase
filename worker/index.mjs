// Typecase skills MCP server on a Cloudflare Worker: the same mcp-core as
// the local server, backed by the GitHub library, so cloud agents reach
// your skills repo through one HTTPS endpoint you own.
//
// Vars (wrangler.jsonc or --var):
//   SKILLS_REPO  "owner/repo" (required) — the skills repo to serve
//   SKILLS_REF   branch / tag / commit (optional; repo default branch)
//   SKILLS_DIR   subfolder that holds the skills (optional)
// Secrets (wrangler secret put):
//   GITHUB_TOKEN  for private repos / higher rate limits (optional)
//   AUTH_TOKEN    require `Authorization: Bearer <AUTH_TOKEN>` (optional)

import { createGithubLibrary } from "../scripts/lib/library-github.mjs";
import { createMcpHandler, handleHttpMcp } from "../scripts/lib/mcp-core.mjs";

const libraries = new Map();

function libraryFor(env) {
  const key = `${env.SKILLS_REPO}@${env.SKILLS_REF ?? ""}/${env.SKILLS_DIR ?? ""}`;
  if (!libraries.has(key)) {
    libraries.set(key, createGithubLibrary({
      repo: env.SKILLS_REPO,
      ref: env.SKILLS_REF || undefined,
      subdir: env.SKILLS_DIR || "",
      token: env.GITHUB_TOKEN || undefined,
      ttlMs: 60_000,
    }));
  }
  return libraries.get(key);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return Response.json({
        name: "typecase-mcp",
        library: `github:${env.SKILLS_REPO}`,
        mcp: "/mcp",
        hint: 'POST JSON-RPC to /mcp, e.g. {"jsonrpc":"2.0","id":1,"method":"tools/list"}',
      });
    }
    const handler = createMcpHandler(libraryFor(env), { name: "typecase", version: "0.2.0" });
    const out = await handleHttpMcp(handler, {
      method: request.method,
      body: request.method === "POST" ? await request.text() : null,
      authToken: env.AUTH_TOKEN || null,
      authorization: request.headers.get("authorization"),
    });
    return out.json === null
      ? new Response(null, { status: out.status })
      : Response.json(out.json, { status: out.status });
  },
};
