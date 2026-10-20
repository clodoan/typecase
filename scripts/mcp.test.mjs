import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createFsLibrary } from "./lib/library-fs.mjs";
import { createGithubLibrary } from "./lib/library-github.mjs";
import { createMcpHandler, handleHttpMcp } from "./lib/mcp-core.mjs";
import { runMcp } from "./lib/mcp-serve.mjs";
import { writeMirror, removeMirror, MIRROR_MARKER } from "./lib/mirror.mjs";
import { promptName } from "./lib/skill-text.mjs";

function makeLibraryDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "typecase-lib-"));
  mkdirSync(path.join(dir, "chip", "refs"), { recursive: true });
  writeFileSync(path.join(dir, "chip", "SKILL.md"),
    "---\nname: chip\ndescription: Crop and resize images.\n---\n# Chip\n\nUse `refs/sizes.md` for presets.\n");
  writeFileSync(path.join(dir, "chip", "refs", "sizes.md"), "- 16:9\n- 1:1\n");
  mkdirSync(path.join(dir, "scrub"));
  writeFileSync(path.join(dir, "scrub", "SKILL.md"),
    "---\nname: scrub\ndescription: Animation timing and easing review.\n---\n# Scrub\n\nBody.\n");
  return dir;
}

const rpc = (method, params, id = 1) => ({ jsonrpc: "2.0", id, method, params });

test("fs library lists, reads, and guards traversal", async () => {
  const lib = createFsLibrary(makeLibraryDir());
  const skills = await lib.list();
  assert.deepEqual(skills.map((s) => s.name).sort(), ["chip", "scrub"]);
  const chip = skills.find((s) => s.name === "chip");
  assert.deepEqual(chip.files, ["SKILL.md", "refs/sizes.md"]);

  const read = await lib.read("chip");
  assert.match(read.text, /# Chip/);
  assert.equal((await lib.readFile("chip", "refs/sizes.md")).text, "- 16:9\n- 1:1\n");
  await assert.rejects(() => lib.readFile("chip", "../scrub/SKILL.md"), /outside/);
  await assert.rejects(() => lib.read("nope"), /no skill named/);
});

test("mcp handler speaks initialize, tools, prompts, resources", async () => {
  const handler = createMcpHandler(createFsLibrary(makeLibraryDir()), { name: "typecase", version: "test" });

  const init = await handler.handle(rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "0" } }));
  assert.equal(init.result.protocolVersion, "2025-03-26");
  assert.ok(init.result.capabilities.prompts);
  assert.equal(init.result.serverInfo.name, "typecase");

  assert.equal(await handler.handle({ jsonrpc: "2.0", method: "notifications/initialized" }), null);

  const tools = await handler.handle(rpc("tools/list"));
  assert.deepEqual(tools.result.tools.map((t) => t.name), ["list_skills", "get_skill", "get_skill_file"]);

  const ls = await handler.handle(rpc("tools/call", { name: "list_skills", arguments: {} }));
  assert.match(ls.result.content[0].text, /chip.*Crop and resize/);

  const skill = await handler.handle(rpc("tools/call", { name: "get_skill", arguments: { name: "chip" } }));
  assert.match(skill.result.content[0].text, /# Chip/);
  assert.match(skill.result.content[0].text, /refs\/sizes\.md/);

  const file = await handler.handle(rpc("tools/call", { name: "get_skill_file", arguments: { name: "chip", path: "refs/sizes.md" } }));
  assert.equal(file.result.content[0].text, "- 16:9\n- 1:1\n");

  const badFile = await handler.handle(rpc("tools/call", { name: "get_skill_file", arguments: { name: "chip", path: "../x" } }));
  assert.equal(badFile.result.isError, true);

  const prompts = await handler.handle(rpc("prompts/list"));
  assert.deepEqual(prompts.result.prompts.map((p) => p.name).sort(), ["chip", "scrub"]);
  assert.equal(prompts.result.prompts[0].description.length > 0, true);

  const prompt = await handler.handle(rpc("prompts/get", { name: "chip", arguments: { task: "resize hero.png" } }));
  assert.match(prompt.result.messages[0].content.text, /# Skill: chip/);
  assert.match(prompt.result.messages[0].content.text, /Task: resize hero\.png/);

  const resources = await handler.handle(rpc("resources/list"));
  assert.ok(resources.result.resources.some((r) => r.uri === "skill://chip/refs/sizes.md"));
  const readRes = await handler.handle(rpc("resources/read", { uri: "skill://chip/SKILL.md" }));
  assert.match(readRes.result.contents[0].text, /# Chip/);

  const unknown = await handler.handle(rpc("nope/nope"));
  assert.equal(unknown.error.code, -32601);
});

test("prompt names are sanitized for slash menus", () => {
  assert.equal(promptName("PR descriptions!"), "pr-descriptions");
  assert.equal(promptName("chip"), "chip");
});

test("http binding: 405 on GET, 401 on bad bearer, 200 on POST", async () => {
  const handler = createMcpHandler(createFsLibrary(makeLibraryDir()));
  assert.equal((await handleHttpMcp(handler, { method: "GET", body: null })).status, 405);
  assert.equal((await handleHttpMcp(handler, { method: "POST", body: "{}", authToken: "s3cret", authorization: "Bearer nope" })).status, 401);
  const ok = await handleHttpMcp(handler, {
    method: "POST",
    body: JSON.stringify(rpc("tools/list")),
    authToken: "s3cret",
    authorization: "Bearer s3cret",
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.result.tools.length, 3);
  assert.equal((await handleHttpMcp(handler, { method: "POST", body: "not json" })).status, 400);
});

test("http server end to end (runMcp --http 0)", async () => {
  const dir = makeLibraryDir();
  const server = runMcp(["--library", dir, "--http", "0"]);
  await new Promise((resolve) => server.on("listening", resolve));
  const base = `http://localhost:${server.address().port}`;
  try {
    const info = await (await fetch(`${base}/`)).json();
    assert.equal(info.name, "typecase-mcp");
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rpc("prompts/get", { name: "scrub" })),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.result.messages[0].content.text, /# Skill: scrub/);
  } finally {
    server.close();
  }
});

test("github library serves a repo through a stubbed fetch", async () => {
  const files = {
    "skills/chip/SKILL.md": "---\nname: chip\ndescription: Crop images.\n---\nBody.\n",
    "skills/chip/refs/sizes.md": "- 16:9\n",
  };
  const fetchImpl = async (url) => {
    const u = String(url);
    const json = (x) => new Response(JSON.stringify(x), { status: 200 });
    if (u === "https://api.github.com/repos/o/r") return json({ default_branch: "main" });
    if (u.includes("/commits/main")) return json({ sha: "abc1234def" });
    if (u.includes("/git/trees/")) {
      return json({ truncated: false, tree: Object.keys(files).map((p) => ({ path: p, type: "blob" })) });
    }
    const m = u.match(/\/contents\/(.+)\?ref=/);
    if (m && files[decodeURI(m[1])]) return new Response(files[decodeURI(m[1])], { status: 200 });
    return new Response("nf", { status: 404 });
  };
  const lib = createGithubLibrary({ repo: "o/r", fetchImpl });
  const skills = await lib.list();
  assert.deepEqual(skills.map((s) => s.name), ["chip"]);
  assert.equal(skills[0].version, "abc1234");
  assert.deepEqual(skills[0].files, ["SKILL.md", "refs/sizes.md"]);
  assert.match((await lib.read("chip")).text, /Body\./);
  assert.equal((await lib.readFile("chip", "refs/sizes.md")).text, "- 16:9\n");
  await assert.rejects(() => lib.readFile("chip", "../other"), /outside/);
  assert.throws(() => createGithubLibrary({ repo: "not a repo" }), /owner\/repo/);
});

test("mirror writes read-only marked copies, prunes, never clobbers", async (t) => {
  const fakeHome = mkdtempSync(path.join(tmpdir(), "typecase-home-"));
  process.env.TYPECASE_HOME = fakeHome;
  delete process.env.GROK_HOME;
  delete process.env.CODEX_HOME;
  t.after(() => { delete process.env.TYPECASE_HOME; rmSync(fakeHome, { recursive: true, force: true }); });

  // GROK_HOME/CODEX_HOME fall back to TYPECASE_HOME-based paths via home().
  const dir = makeLibraryDir();

  // A hand-written skill that must never be touched.
  const handmade = path.join(fakeHome, ".cursor", "skills", "chip");
  mkdirSync(handmade, { recursive: true });
  writeFileSync(path.join(handmade, "SKILL.md"), "mine, not generated\n");

  const first = await writeMirror(dir);
  assert.equal(first.skills, 2);
  assert.ok(first.skipped.some((s) => s.target === handmade));
  const mirrored = path.join(fakeHome, ".grok", "skills", "chip");
  assert.ok(existsSync(path.join(mirrored, "SKILL.md")));
  assert.ok(existsSync(path.join(mirrored, MIRROR_MARKER)));
  assert.equal(statSync(path.join(mirrored, "SKILL.md")).mode & 0o222, 0, "mirrored files are read-only");
  assert.equal(readFileSync(path.join(handmade, "SKILL.md"), "utf8"), "mine, not generated\n");

  // Re-run is idempotent; removing a source skill prunes its mirror.
  rmSync(path.join(dir, "scrub"), { recursive: true });
  const second = await writeMirror(dir);
  assert.equal(second.skills, 1);
  assert.ok(second.pruned >= 3, `pruned scrub from the generated targets (got ${second.pruned})`);
  assert.ok(!existsSync(path.join(fakeHome, ".grok", "skills", "scrub")));

  const removed = removeMirror();
  assert.ok(removed.removed >= 3);
  assert.ok(!existsSync(mirrored));
  assert.ok(existsSync(handmade), "hand-written folder survives removeMirror");
});
