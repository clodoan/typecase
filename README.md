# Typecase

The case your agent skills live in. Typecase finds every skill installed
for Grok, Cursor, Claude Code, and Codex, parses each `SKILL.md` into a
structured record, and gives you three layers on top:

1. **A parser library** (`scripts/lib/`) — discovery, parsing, duplicate
   and overlap detection. Importable; everything else is built on it.
2. **A reader** — `ls`, `where`, `show` in the terminal, plus a Mac-first
   Electron app (`open`).
3. **A lockfile and changelog** — `lock`, `diff`, `pin`, and a running
   `TYPECASE.md` with one plain-language paragraph per skill change.

<img src="assets/hero.png" alt="Typecase app: compact row list of installed skills and the detail view of one skill" width="100%" />

*All screenshots show public open-source skill packs only (Anthropic's
[skills](https://github.com/anthropics/skills), Figma's
[mcp-server-guide](https://github.com/figma/mcp-server-guide),
[donald-ada/workinggenius](https://github.com/donald-ada/workinggenius),
and [clodoan/skills](https://github.com/clodoan/skills)) — nothing private
or internal.*

## Install the Mac app

```bash
curl -fsSL https://raw.githubusercontent.com/clodoan/typecase/main/install.sh | sh
```

This downloads the latest release for your Mac (Apple silicon or Intel),
installs `Typecase.app` into `/Applications`, and opens it. Run the same
command again to update. Read [`install.sh`](install.sh) before you pipe
it to `sh`. The app isn't notarized, so the script removes the macOS
quarantine flag, and Gatekeeper does not check the app on first open.

To install by hand, download `Typecase-mac-arm64.zip` (Apple silicon) or
`Typecase-mac-x64.zip` (Intel) from
[Releases](https://github.com/clodoan/typecase/releases/latest), unzip it,
and drag `Typecase.app` into Applications. The app isn't notarized, so
macOS blocks the first open: go to **System Settings → Privacy & Security**
and click **Open Anyway**, or run
`xattr -dr com.apple.quarantine /Applications/Typecase.app`.

To check a download, compare `shasum -a 256 Typecase-mac-arm64.zip` with
the SHA-256 digest that the release page shows next to the asset. To
report a vulnerability, see [SECURITY.md](SECURITY.md).

## Quick start

```bash
node scripts/typecase.mjs ls                     # everything installed
node scripts/typecase.mjs where "crop a video"   # which skill handles this?
node scripts/typecase.mjs show chip              # read one skill
node scripts/typecase.mjs lock                   # pin current state
node scripts/typecase.mjs diff                   # what changed since lock (exit 1 if anything)
node scripts/typecase.mjs pin chip               # restore a skill from its snapshot
node scripts/typecase.mjs usage                  # which skills get used, and which never do
node scripts/typecase.mjs open                   # desktop reader
```

The CLI has zero dependencies (Node ≥ 18). The desktop app is a separate
optional package under [`app/`](app/) — Electron is **not** a dependency
of the CLI.

<img src="assets/cli-ls.png" alt="typecase ls output grouped by tool and scope with duplicate, overlap and risky marks" width="100%" />

## Where it looks

Every path is sourced; the same table lives as a comment in
[`scripts/lib/paths.mjs`](scripts/lib/paths.mjs).

| Tool | Project | User | Plugin / other | Source |
| --- | --- | --- | --- | --- |
| Grok | `.grok/skills` (walked up to the repo root) | `$GROK_HOME/skills`, default `~/.grok/skills` | `./.grok/plugins` and `~/.grok/plugins` (each plugin's `skills/`), marketplace installs under `~/.grok/plugins/marketplaces/` | [docs.x.ai](https://docs.x.ai/build/features/skills-plugins-marketplaces) |
| Cursor | `.cursor/skills`, `.agents/skills` (nested dirs too) | `~/.cursor/skills`, `~/.agents/skills` | `~/.cursor/plugins/cache/<marketplace>/<id>/<rev>/skills/` (observed layout, not documented — may change) | [cursor.com/docs/skills](https://cursor.com/docs/skills) |
| Claude Code | `.claude/skills` (this dir and parents) | `~/.claude/skills` | plugins ship `skills/` folders under `~/.claude/plugins/` | [code.claude.com](https://code.claude.com/docs/en/skills) |
| Codex | `.agents/skills` (cwd up to repo root) | `~/.codex/skills` (`$CODEX_HOME`, scanned recursively per docs), `~/.agents/skills` | admin `/etc/codex/skills` | [developers.openai.com](https://developers.openai.com/codex/skills) |

`.agents/skills` dirs are read by Grok, Cursor, and Codex alike, so
Typecase reports them once under the pseudo-tool `shared` instead of
triple-counting one install.

Two dedupe rules keep the list honest. First, the Cursor plugin cache
keeps old revisions on disk; Typecase scans only the newest revision of
each plugin (by directory mtime), so a plugin update doesn't show up as
two skills. Second, byte-identical installs of the same skill (same name,
same content hash — e.g. one pack installed for both Claude Code and
Cursor) collapse into a single entry marked `×N` in `ls` and in the app's
row list; the detail view still lists every install path. Copies with the
same name but *different* content stay separate — that's a real conflict,
and it stays flagged.

Extra locations: drop a `typecase.json` in the working directory or
`~/.config/typecase/`:

```json
{ "paths": [{ "dir": "/opt/team-skills", "tool": "shared", "scope": "user" }] }
```

## What the parser extracts

`parseSkill` returns one record per skill: frontmatter (`name`,
`description`, the rest verbatim), tool, scope (user / project / plugin /
admin), paths, every section with a token estimate, trigger text,
"when not to use" text, referenced files that resolve inside the skill
folder, commands mentioned in code spans, risky tool mentions (network,
write, exec, sudo), total token size, and a content hash over the whole
skill folder. Malformed skills become parse-error records instead of
crashing the run.

On top of the records, discovery flags **duplicates** (same name
installed for more than one tool — marked identical when the content
hashes match) and **overlaps** (pairs whose trigger vocabulary passes a
Jaccard similarity threshold of 0.35 — skills that will race for the
same requests).

```js
import { discover, where } from "./scripts/lib/discover.mjs";
const data = discover();            // { roots, skills, duplicates, overlaps }
const hits = where(data, "resize a video");
```

`ls --json` and `diff --json` emit the same structures for scripting.

## Lock, diff, pin

`lock` writes `skills.lock`: per skill, the content hash, token size, and
the best source identity it can find — the git remote + commit if the
skill folder lives in a repo, a plugin/package version from a nearby
manifest, or `local`. It also snapshots each skill folder by hash under
`~/.cache/typecase/snapshots/` so `pin <skill>` can restore the locked
version later (the current version is backed up first).

`diff` re-discovers everything and compares against the lock **section by
section** — added/removed/rewritten sections, trigger changes, "when not
to use" changes, command and risky-tool deltas — then compresses each
skill's changes into one plain-language paragraph about what the agent
will now do differently. Real output from bumping Anthropic's
[skills](https://github.com/anthropics/skills) pack from `5304866` to
`dbd4588`:

<img src="assets/cli-diff.png" alt="typecase diff output showing plain-language change paragraphs" width="100%" />

> **frontend-design** changed: a new "Ground your designs in the subject
> matter" rule was added; a new "Process: plan, review against the brief,
> build, critique" rule was added; 2 rules were dropped; 4 sections were
> rewritten.

Paragraphs are deterministic by default. Set `TYPECASE_LLM_CMD` to any
shell command to route the change JSON (stdin) through an LLM instead;
on any failure it falls back to the deterministic text.
`diff --write-changelog` appends dated entries to `TYPECASE.md`, and
`lock` does the same automatically when it replaces an older lock.

## Usage

`usage` reads the session logs Claude Code and Codex already keep on
disk and reports, per skill:

- **Uses** in the last 30 days (`--days n`) and all time, and when it was
  last used. Skills with no uses in the window are listed as candidates to
  remove.
- **Hit rate**: how many of the sessions that offered the skill actually
  used it. Every installed skill's description sits in every session's
  context, so this comes with the context cost so far (Claude Code only;
  its logs record what each session was offered).
- **Who started it**: the agent, or you typing `/name`. A skill only ever
  typed by hand is one the agent never picks; its description probably
  doesn't match how you ask.
- **Per tool**: uses in each tool it is installed for.
- **Before and after the last edit**: uses in equal windows either side
  of the SKILL.md's last change.
- **Overlap winners**: for each overlapping pair, which one gets used.

`usage <skill>` shows one skill in detail; `usage --unused` lists only the
removal candidates; `--json` for scripting.

| Tool | Log read | Counts as a use |
| --- | --- | --- |
| Claude Code | `~/.claude/projects/*/*.jsonl` (`$CLAUDE_CONFIG_DIR`) | a `Skill` tool call, or a typed `/name` |
| Codex | `~/.codex/sessions/**/*.jsonl` (`$CODEX_HOME`) | a tool call that reads the skill's `SKILL.md` |
| Cursor, Grok | — | not tracked: shown as "not tracked", never as "unused" |

Neither log format is documented, so this can break when the tools change
it; unknown records are skipped rather than miscounted. Everything stays
local. Typecase keeps only skill names, timestamps, session ids and
working directories, never message text, in
`~/.cache/typecase/usage.json`. That cache also keeps sessions after the
agent deletes its own old logs, so usage history outlasts their retention.

## The desktop app

`typecase open` launches a Mac-first Electron reader (floating sidebar,
system font, light and dark themes that follow the system,
full keyboard navigation, ⌘K search). The palette is neutral macOS gray —
`#f5f5f7` canvas with white panels in light, near-black in dark — with a
single verdigris accent; rubric red is reserved for risky flags. Styling
is [StyleX](https://stylexjs.com) compiled at build time; there are no
animations or transitions anywhere — every interaction renders
immediately. It imports the same parser library as the CLI —
no duplicated parsing logic — and live-reloads when any skill folder
changes on disk.

<img src="assets/app-rows-dark.png" alt="Typecase app in dark mode: compact row list" width="100%" />

- **Sidebar** — one short list: All Skills, then Unused (no uses in 30
  days), Changed (since `skills.lock`) and Overlaps, then one item per
  tool. An item only appears when it would match something, so none
  leads to an empty list. ⌘\\ hides the sidebar.
- **Row list** — one compact hairline row per skill: name, one-line
  description, copies (×N) / risky / overlap / changed chips, tool ·
  scope, and usage (`12× · 2d ago`, `never`, or `—` when not tracked).
  Identical installs across tools collapse into one row marked `×N`.
  Arrow-key navigation. The floating toolbar holds the sidebar toggle,
  and in the detail view a back chevron and the Rendered / Source /
  History tabs. ⌘K finds skills and
  also switches theme: type "light", "dark", "system", or "theme".
- **Detail view** — titled sections of plain label/value rows, no rules
  or widgets. **Usage**: uses in 30 days and all time, last used, who
  starts it (agent or you), hit rate, context cost, uses since the last
  edit, per tool. **Details**: when (not) to use, tools it can call with
  risky flags, files referenced, overlaps (with which one gets used),
  install paths (Reveal in Finder / Open in Cursor), size and lock state.
  Rows with nothing to say are left out. Then the skill's full body
  rendered as Markdown (markdown-it: headings, lists, code blocks,
  tables; raw HTML stays escaped, links open in your browser or editor
  and never navigate the app). The toolbar tabs switch
  **Rendered / Source / History** (keys 1–3); Source shows the raw file,
  frontmatter included. History appears once a `skills.lock` exists and
  shows the locked version, the since-lock paragraph with a section-level
  diff, and this skill's `TYPECASE.md` entries.
- **Keyboard** — ⌘K search, ⌘\\ sidebar, ⌘[ / ⌘] back and forward
  through the skills and filters you visited (scroll position included),
  arrows + ↩ on the list, Esc and 1–3 on a skill. Every shortcut is
  declared in [`app/renderer/src/shortcuts.mjs`](app/renderer/src/shortcuts.mjs);
  add one there and give `app.js` an action with the same id.

<img src="assets/app-history-light.png" alt="History tab showing a real since-lock diff of the frontend-design skill" width="100%" />
<img src="assets/app-search-light.png" alt="Command-K fuzzy search palette" width="100%" />

Run it in development:

```bash
cd app
npm ci
npm start                 # or: node ../scripts/typecase.mjs open
```

`npm start` builds the renderer first (Rollup + the StyleX plugin →
`renderer/dist/`); `npm test` and `npm run dist` do the same. To build it
alone, `npm run build`.

Package an unsigned local Mac `.app` (no notarization; for your own
machine):

```bash
cd app
npm run dist              # electron-builder --mac --dir → dist/mac*/Typecase.app
```

Build the downloadable release zips (ad-hoc signed, Apple silicon and
Intel) that `install.sh` fetches:

```bash
cd app
npm run release           # → dist/release/Typecase-mac-{arm64,x64}.zip
gh release create v0.x.y dist/release/*.zip
```

The packaged app uses the green icon (`build/icon.icns`); `npm start` runs
show the amber DEV icon in the Dock so the two never get mixed up. Both
are drawn in `build/make-icons.mjs`; run `npm run icons` after editing it.

If the app dependencies aren't installed, `typecase open` falls back to
writing a small self-contained HTML reader to a temp file and opening it
in your browser — kept deliberately tiny (search, filters, detail,
History) so `open` still does something useful on a headless box or
fresh machine.

## Testing

```bash
node --test scripts/typecase.test.mjs   # parser + CLI (15 tests)
cd app && npm ci && npm test            # Electron smoke (6 tests; builds the renderer first)
```

CI runs both; the Electron suite runs under `xvfb-run` on Linux runners.

## Tested on (real packs)

| Pack | Commit | Result |
| --- | --- | --- |
| [anthropics/skills](https://github.com/anthropics/skills) | `5304866` → `dbd4588` | 20 skills parsed; lock → version bump → `diff` produced the paragraphs above; `pin` restored the locked `frontend-design` |
| [figma/mcp-server-guide](https://github.com/figma/mcp-server-guide) | `b0bfad2` | 14 skills; `figma-generative-plugins` ↔ `figma-shaders` flagged as overlapping (0.52 shared trigger vocabulary) |
| [donald-ada/workinggenius](https://github.com/donald-ada/workinggenius) | `3823c44` | 24 skills incl. an `errata` skill (which is why this tool isn't called Errata); 3 overlap pairs flagged |
| [clodoan/skills](https://github.com/clodoan/skills) | — | chip, scrub, plinth, ramble; `where "animation timing easing jank"` → scrub (score 0.54) |

Side by side that's 61 installs across four tools, shown as 60 entries:
the one planted cross-tool duplicate (`figma-design-to-code` installed
for both Claude Code and Cursor) is detected as identical copies and
folds into a single `×2` entry. `poteto/pstack` was
requested as a test pack but isn't publicly available, so the public
packs above stand in for it.

## Notes

- Name check: "errata" collides with an existing agent skill
  (donald-ada/workinggenius) and an npm CLI; "typecase" — a printer's
  type drawer — had no agent-skill, CLI, or Figma-plugin collisions at
  the time of writing.
- `skills.lock` and `TYPECASE.md` are per-directory, so a repo can pin
  its project skills independently of your user-level installs.
