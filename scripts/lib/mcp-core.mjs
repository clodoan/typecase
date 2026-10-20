// Transport-agnostic MCP (Model Context Protocol) server core.
// Takes parsed JSON-RPC messages, returns response objects (or null for
// notifications). The same handler backs the stdio server, the local
// HTTP server, and the Cloudflare Worker, so no node: imports here.
//
// A "library" is anything with:
//   list()              → [{ name, description, version, files }]
//   read(name)          → { name, description, version, text, files }
//   readFile(name, rel) → { text }
// All async. `files` are paths relative to the skill folder, SKILL.md first.

import { promptName } from "./skill-text.mjs";

export const LATEST_PROTOCOL = "2025-06-18";
const KNOWN_PROTOCOLS = new Set(["2025-06-18", "2025-03-26", "2024-11-05"]);

const PARSE_ERROR = -32700;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

const TOOLS = [
  {
    name: "list_skills",
    description:
      "List every skill in this library: name, one-line description, version, and the files each skill ships. Call this first to see what is available.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_skill",
    description:
      "Read one skill's full SKILL.md plus the list of helper files it ships. Follow the returned instructions; fetch helper files with get_skill_file.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "Skill name from list_skills" } },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "get_skill_file",
    description: "Read one helper file that a skill ships (path relative to the skill folder, as listed by get_skill).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Skill name from list_skills" },
        path: { type: "string", description: "File path relative to the skill folder" },
      },
      required: ["name", "path"],
      additionalProperties: false,
    },
  },
];

function textResult(text, { isError = false } = {}) {
  return { content: [{ type: "text", text }], isError };
}

function skillHeader(s) {
  return `# Skill: ${s.name}${s.version ? ` (${s.version})` : ""}`;
}

function promptText(s) {
  const helpers = (s.files ?? []).filter((f) => f !== "SKILL.md");
  const helperNote = helpers.length
    ? `\n\nThis skill ships helper files: ${helpers.join(", ")}. Fetch any of them with the ` +
      `\`get_skill_file\` tool on this server (name: "${s.name}") before relying on their contents.`
    : "";
  return (
    `Use the following agent skill to perform my task. Read it fully and follow it.\n\n` +
    `${skillHeader(s)}\n\n${s.text}${helperNote}`
  );
}

function mimeFor(path) {
  if (/\.(md|markdown)$/i.test(path)) return "text/markdown";
  if (/\.(json)$/i.test(path)) return "application/json";
  if (/\.(mjs|js|cjs)$/i.test(path)) return "text/javascript";
  return "text/plain";
}

export function createMcpHandler(library, { name = "typecase", version = "0.0.0" } = {}) {
  async function callTool(toolName, args = {}) {
    if (toolName === "list_skills") {
      const skills = await library.list();
      const lines = skills.map(
        (s) => `- ${s.name}${s.version ? ` (${s.version})` : ""} — ${s.description || "(no description)"}`,
      );
      return textResult(
        `${skills.length} skill(s) in this library:\n${lines.join("\n")}\n\nRead one with get_skill {"name": "..."}.`,
      );
    }
    if (toolName === "get_skill") {
      if (typeof args.name !== "string") throw rpcError(INVALID_PARAMS, "get_skill needs a string `name`");
      const s = await library.read(args.name);
      const helpers = (s.files ?? []).filter((f) => f !== "SKILL.md");
      const files = helpers.length ? `\n\nHelper files (fetch with get_skill_file): ${helpers.join(", ")}` : "";
      return textResult(`${skillHeader(s)}\n\n${s.text}${files}`);
    }
    if (toolName === "get_skill_file") {
      if (typeof args.name !== "string" || typeof args.path !== "string") {
        throw rpcError(INVALID_PARAMS, "get_skill_file needs string `name` and `path`");
      }
      const f = await library.readFile(args.name, args.path);
      return textResult(f.text);
    }
    throw rpcError(INVALID_PARAMS, `unknown tool: ${toolName}`);
  }

  async function handleRequest(msg) {
    const { method, params = {} } = msg;
    switch (method) {
      case "initialize": {
        const requested = params.protocolVersion;
        return {
          protocolVersion: KNOWN_PROTOCOLS.has(requested) ? requested : LATEST_PROTOCOL,
          capabilities: { tools: { listChanged: false }, prompts: { listChanged: false }, resources: { listChanged: false } },
          serverInfo: { name, version },
          instructions:
            "This server publishes an agent-skills library. Call list_skills to see what is available, " +
            "get_skill for a full SKILL.md, and get_skill_file for helper files. Each skill is also an MCP prompt.",
        };
      }
      case "ping":
        return {};
      case "tools/list":
        return { tools: TOOLS };
      case "tools/call": {
        try {
          return await callTool(params.name, params.arguments);
        } catch (err) {
          if (err?.rpc) throw err;
          return textResult(String(err?.message ?? err), { isError: true });
        }
      }
      case "prompts/list": {
        const skills = await library.list();
        return {
          prompts: skills.map((s) => ({
            name: promptName(s.name),
            title: s.name,
            description: s.description || undefined,
            arguments: [
              { name: "task", description: "What you want done with this skill (optional)", required: false },
            ],
          })),
        };
      }
      case "prompts/get": {
        const skills = await library.list();
        const match = skills.find((s) => promptName(s.name) === params.name || s.name === params.name);
        if (!match) throw rpcError(INVALID_PARAMS, `unknown prompt: ${params.name}`);
        const s = await library.read(match.name);
        const task = params.arguments?.task ? `\n\nTask: ${params.arguments.task}` : "";
        return {
          description: s.description || undefined,
          messages: [{ role: "user", content: { type: "text", text: promptText(s) + task } }],
        };
      }
      case "resources/list": {
        const skills = await library.list();
        const resources = [];
        for (const s of skills) {
          for (const f of s.files ?? ["SKILL.md"]) {
            resources.push({
              uri: `skill://${encodeURIComponent(s.name)}/${f}`,
              name: f === "SKILL.md" ? s.name : `${s.name}/${f}`,
              description: f === "SKILL.md" ? s.description || undefined : undefined,
              mimeType: mimeFor(f),
            });
          }
        }
        return { resources };
      }
      case "resources/read": {
        const uri = String(params.uri ?? "");
        const m = uri.match(/^skill:\/\/([^/]+)\/(.+)$/);
        if (!m) throw rpcError(INVALID_PARAMS, `not a skill:// uri: ${uri}`);
        const skillName = decodeURIComponent(m[1]);
        const rel = m[2];
        const f = rel === "SKILL.md" ? { text: (await library.read(skillName)).text } : await library.readFile(skillName, rel);
        return { contents: [{ uri, mimeType: mimeFor(rel), text: f.text }] };
      }
      default:
        throw rpcError(METHOD_NOT_FOUND, `method not found: ${method}`);
    }
  }

  /** One parsed JSON-RPC message (or batch) in; response (or null) out. */
  async function handle(msg) {
    if (Array.isArray(msg)) {
      const out = (await Promise.all(msg.map(handle))).filter(Boolean);
      return out.length ? out : null;
    }
    if (!msg || typeof msg !== "object" || typeof msg.method !== "string") {
      if (msg && typeof msg === "object" && "id" in msg && !("method" in msg)) return null; // client response
      return errorResponse(null, PARSE_ERROR, "expected a JSON-RPC request");
    }
    const isNotification = msg.id === undefined || msg.id === null;
    try {
      const result = await handleRequest(msg);
      return isNotification ? null : { jsonrpc: "2.0", id: msg.id, result };
    } catch (err) {
      if (isNotification) return null;
      if (err?.rpc) return errorResponse(msg.id, err.code, err.message);
      return errorResponse(msg.id, INTERNAL_ERROR, String(err?.message ?? err));
    }
  }

  return { handle };
}

function rpcError(code, message) {
  const err = new Error(message);
  err.rpc = true;
  err.code = code;
  return err;
}

function errorResponse(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/**
 * Streamable-HTTP binding for web-standard runtimes (the Worker) and the
 * local HTTP server: POST with a JSON-RPC body → JSON response; GET on the
 * MCP endpoint → 405 (this server does not open SSE streams).
 */
export async function handleHttpMcp(handler, { method, body, authToken, authorization }) {
  if (authToken && authorization !== `Bearer ${authToken}`) {
    return { status: 401, json: { jsonrpc: "2.0", id: null, error: { code: -32000, message: "unauthorized" } } };
  }
  if (method !== "POST") {
    return { status: 405, json: { jsonrpc: "2.0", id: null, error: { code: -32000, message: "POST JSON-RPC messages to this endpoint" } } };
  }
  let msg;
  try {
    msg = typeof body === "string" ? JSON.parse(body) : body;
  } catch {
    return { status: 400, json: errorResponse(null, PARSE_ERROR, "invalid JSON") };
  }
  const res = await handler.handle(msg);
  if (res === null) return { status: 202, json: null };
  return { status: 200, json: res };
}
