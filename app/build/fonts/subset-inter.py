#!/usr/bin/env python3
"""Subset Inter for the Typecase app. Run by hand; commit the output.

    python3 -m venv .venv && .venv/bin/pip install fonttools==4.68.0 brotli==1.2.1
    .venv/bin/python app/build/fonts/subset-inter.py

Writes app/renderer/fonts/: four .woff2 files (roman and italic, each a
preloaded core plus an extended file behind unicode-range), inter.css,
manifest.json (what the files cover, read by app/tests/fonts.test.mjs),
README.md (sizes and audit) and LICENSE.txt.

Rerun when app/tests/fonts.test.mjs fails, i.e. when the app starts to use:
  - a non-ASCII character in UI text that the files don't cover,
  - a font weight below 400 (the files keep 400-900),
  - an OpenType feature not kept below (font-feature-settings,
    font-variant-*), or
  - a new Inter release (bump INTER_VERSION and INTER_SHA256).

--baseline DIR writes the unmodified official files plus a matching CSS to
DIR instead, for app/build/fonts/pixel-diff.mjs.
"""

import argparse
import hashlib
import io
import json
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

INTER_VERSION = "4.1"
INTER_URL = f"https://github.com/rsms/inter/releases/download/v{INTER_VERSION}/Inter-{INTER_VERSION}.zip"
INTER_SHA256 = "9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e"
STYLES = {  # css font-style -> file in the release's web/ folder
    "normal": "InterVariable.woff2",
    "italic": "InterVariable-Italic.woff2",
}
FAMILY = "InterVariable"  # the official CSS name, kept so docs and the stack agree

REPO = Path(__file__).resolve().parents[3]
OUT = REPO / "app" / "renderer" / "fonts"
CACHE = Path.home() / ".cache" / "typecase-fonts"

# Axis ranges in use (see README.md "Audit"). wght: 400 is the default
# weight, 800 the heaviest set in CSS, and markdown <strong>/<b> use
# `bolder`, which reaches 900 inside 600/650 headings and table headers.
# opsz follows font-size through font-optical-sizing: auto; sizes run
# 9.5px-42px, so the whole 14-32 range is reached and stays.
AXIS_LIMITS = {"wght": (400, 900)}

# Features HarfBuzz/Chromium apply to Latin text by default that Inter
# has, plus tnum (font-variant-numeric: tabular-nums). Everything else
# (aalt case cv01-14 dlig dnom frac numr ordn pnum salt sinf ss01-08 subs
# sups zero cpsp) is never turned on by the app. frac/numr/dnom are only
# auto-applied around U+2044, which neither file contains.
FEATURES = ["ccmp", "locl", "calt", "kern", "mark", "mkmk", "tnum"]

# Split. Chromium shapes each font file as its own run, so where a word
# mixes characters from two files ("Caf" + "é"), kerning and contextual
# forms across the boundary are lost and the rest of the line shifts.
# The default ("latin") keeps every Latin letter in the core, so text
# renders exactly as with the full font and only standalone symbols live
# in the extended file. "ascii" is the smaller split (ASCII + common
# punctuation preloaded, accented letters on demand); it changes how
# accented words render, see README.md.
#
# Core ("ascii"): ASCII plus what nearly every view draws: curly quotes, dashes,
# the ellipsis (text-overflow: ellipsis draws it in the element's font),
# the middle dot and multiplication sign of list rows ("Claude Code · user",
# "12× · 2d ago"), and ⌘ of the search pill on macOS. NBSP rides along,
# and so does U+2010: where a soft hyphen in content breaks a line,
# Chromium draws U+2010 if the primary (core) face has it and U+002D if
# not, and the full font has it.
CORE = set(range(0x20, 0x7F)) | {0xA0, 0xB7, 0xD7, 0x2010, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x2318}
# Latin-1 Supplement and Latin Extended-A, for content. Core ("latin") is
# CORE plus these; extended is every other non-ASCII UI character
# (collected below) that the core doesn't have.
LATIN = set(range(0xA0, 0x100)) | set(range(0x100, 0x180))
# Plus the rest of Windows-1252, the de facto "Latin-1" of real text: low
# quotes („Anführungszeichen“ needs „ next to a letter), € and friends.
# Without them those characters fall back to a system font mid-word.
CP1252 = {0x192, 0x2C6, 0x2DC, 0x201A, 0x201E, 0x2020, 0x2021, 0x2022, 0x2030, 0x2039, 0x203A, 0x20AC, 0x2122}
SPLITS = {"latin": CORE | LATIN | CP1252, "ascii": CORE}
# UI text lives in these files; skill content is arbitrary and is covered
# by LATIN. Anything outside both (Greek, Cyrillic, CJK, ...) renders in
# the system fallback fonts.
UI_SOURCES = ["app/renderer/index.html", "app/renderer/src/*.js", "app/renderer/src/*.mjs",
              "scripts/lib/lockfile.mjs", "scripts/lib/usage-stats.mjs", "scripts/lib/discover.mjs"]


def fetch_release():
    CACHE.mkdir(parents=True, exist_ok=True)
    zip_path = CACHE / f"Inter-{INTER_VERSION}.zip"
    if not zip_path.exists():
        print(f"downloading {INTER_URL}")
        with urllib.request.urlopen(INTER_URL) as r:
            zip_path.write_bytes(r.read())
    digest = hashlib.sha256(zip_path.read_bytes()).hexdigest()
    if digest != INTER_SHA256:
        zip_path.unlink()
        sys.exit(f"SHA-256 mismatch for {zip_path.name}: {digest}")
    z = zipfile.ZipFile(zip_path)
    files = {style: z.read(f"web/{name}") for style, name in STYLES.items()}
    return files, z.read("LICENSE.txt")


def ui_codepoints():
    cps = set()
    for pattern in UI_SOURCES:
        for path in REPO.glob(pattern):
            cps |= {ord(c) for c in path.read_text(encoding="utf8") if ord(c) > 0x7E}
    return cps


def ranges(cps):
    """Sorted codepoints -> 'U+20-7E, U+A0' style unicode-range."""
    out, cps = [], sorted(cps)
    start = prev = cps[0]
    for cp in cps[1:] + [None]:
        if cp is not None and cp == prev + 1:
            prev = cp
            continue
        out.append(f"U+{start:X}" if start == prev else f"U+{start:X}-{prev:X}")
        if cp is not None:
            start = prev = cp
    return ", ".join(out)


def make_subset(source_bytes, codepoints):
    font = TTFont(io.BytesIO(source_bytes))
    font = instancer.instantiateVariableFont(font, AXIS_LIMITS)
    # Quirk: the instancer leaves gvar without entries for glyphs that have
    # no deltas, and the subsetter then fails looking them up. A save/load
    # round trip rebuilds the table.
    buf = io.BytesIO()
    font.save(buf)
    font = TTFont(io.BytesIO(buf.getvalue()))
    opts = subset.Options()
    opts.layout_features = FEATURES
    opts.hinting = False             # the release is unhinted already; keep it that way
    opts.notdef_outline = True       # same .notdef box as the full font
    opts.glyph_names = False         # post format 3; names are never rendered
    opts.drop_tables += ["STAT"]     # style-naming data; browsers don't read it
    opts.flavor = "woff2"
    s = subset.Subsetter(opts)
    s.populate(unicodes=codepoints)
    s.subset(font)
    # Quirk: fontTools stamps head.modified with the current time on save,
    # so every run would produce new bytes. Keep the release's timestamp:
    # same inputs, same files.
    font.recalcTimestamp = False
    font["head"].modified = TTFont(io.BytesIO(source_bytes))["head"].modified
    buf = io.BytesIO()
    font.save(buf)
    return buf.getvalue()


def describe(data):
    f = TTFont(io.BytesIO(data))
    feats = lambda t: sorted({r.FeatureTag for r in f[t].table.FeatureList.FeatureRecord}) if t in f else []
    hinted = any(t in f for t in ("fpgm", "prep", "cvt ")) or any(
        getattr(f["glyf"][g], "program", None) is not None and len(f["glyf"][g].program.getBytecode())
        for g in f.getGlyphOrder())
    return {
        "bytes": len(data),
        "glyphs": len(f.getGlyphOrder()),
        "codepoints": sorted(f.getBestCmap()),
        "axes": {a.axisTag: [a.minValue, a.defaultValue, a.maxValue] for a in f["fvar"].axes},
        "gsub": feats("GSUB"),
        "gpos": feats("GPOS"),
        "hinted": hinted,
    }


def check(name, info, wanted):
    """Font tools have quirks: confirm the file is what we asked for."""
    problems = []
    if set(info["codepoints"]) != wanted:
        missing, extra = wanted - set(info["codepoints"]), set(info["codepoints"]) - wanted
        problems.append(f"cmap differs (missing {ranges(missing) if missing else '-'}, extra {ranges(extra) if extra else '-'})")
    for tag, (lo, hi) in AXIS_LIMITS.items():
        if info["axes"][tag][0] != lo or info["axes"][tag][2] != hi:
            problems.append(f"{tag} axis is {info['axes'][tag]}, wanted {lo}-{hi}")
    if info["axes"]["opsz"] != [14.0, 14.0, 32.0]:
        problems.append(f"opsz axis changed: {info['axes']['opsz']}")
    stray = set(info["gsub"] + info["gpos"]) - set(FEATURES)
    if stray:
        problems.append(f"unexpected features {sorted(stray)}")
    if info["hinted"]:
        problems.append("hinting survived")
    if problems:
        sys.exit(f"{name}: " + "; ".join(problems))


def write_baseline(out, files, license_bytes):
    out.mkdir(parents=True, exist_ok=True)
    css = []
    for style, name in STYLES.items():
        (out / name).write_bytes(files[style])
        css.append(f'@font-face {{ font-family: {FAMILY}; font-style: {style}; font-weight: 100 900; font-display: swap; src: url("{name}") format("woff2"); }}')
    (out / "inter.css").write_text("\n".join(css) + "\n")
    (out / "LICENSE.txt").write_bytes(license_bytes)
    print(f"baseline (official files, unmodified) -> {out}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--baseline", type=Path, help="write the official files + CSS here instead")
    ap.add_argument("--split", choices=SPLITS, default="latin", help="what the preloaded core holds (default: latin)")
    ap.add_argument("--out", type=Path, default=OUT, help=f"output folder (default: {OUT.relative_to(REPO)})")
    args = ap.parse_args()

    files, license_bytes = fetch_release()
    if args.baseline:
        write_baseline(args.baseline, files, license_bytes)
        return

    ui = ui_codepoints()
    out = args.out
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.woff2"):
        old.unlink()
    css, manifest, rows = [], {"inter": INTER_VERSION, "sha256": INTER_SHA256, "split": args.split, "features": FEATURES,
                               "axes": {k: list(v) for k, v in AXIS_LIMITS.items()}, "files": {}}, []
    for style in STYLES:
        source = describe(files[style])
        have = set(source["codepoints"])
        core = SPLITS[args.split] & have
        extended = ((LATIN | CP1252 | ui) & have) - core
        tag = "roman" if style == "normal" else "italic"
        rows.append((f"{STYLES[style]} (official)", source))
        for part, cps in (("core", core), ("ext", extended)):
            name = f"inter-{tag}-{part}.woff2"
            data = make_subset(files[style], cps)
            info = describe(data)
            check(name, info, cps)
            (out / name).write_bytes(data)
            rows.append((name, info))
            urange = ranges(info["codepoints"])
            css.append(
                f"@font-face {{\n  font-family: {FAMILY};\n  font-style: {style};\n  font-weight: 400 900;\n"
                f"  font-display: swap;\n  src: url(\"{name}\") format(\"woff2\");\n  unicode-range: {urange};\n}}")
            manifest["files"][name] = {"style": style, "part": part, "bytes": info["bytes"],
                                       "glyphs": info["glyphs"], "unicodeRange": urange,
                                       "codepoints": info["codepoints"]}
        missing_ui = sorted(ui - have)
        manifest.setdefault("uiCodepoints", sorted(ui))
        manifest.setdefault("uiLacking", {})[style] = missing_ui
        if missing_ui:
            print(f"note: {style}: UI characters Inter lacks (system fallback): {ranges(missing_ui)}")

    header = (f"/* Generated by app/build/fonts/subset-inter.py from Inter {INTER_VERSION}\n"
              f"   ({INTER_URL}), split \"{args.split}\". Do not edit; rerun the script. */\n")
    (out / "inter.css").write_text(header + "\n".join(css) + "\n")
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    (out / "LICENSE.txt").write_bytes(license_bytes)

    lines = [
        "# Inter, subset for Typecase",
        "",
        f"Generated by [`app/build/fonts/subset-inter.py`](../../build/fonts/subset-inter.py) from the official",
        f"[Inter {INTER_VERSION}]({INTER_URL}) release (SHA-256 `{INTER_SHA256}`), variable web fonts",
        "`InterVariable.woff2` and `InterVariable-Italic.woff2`. SIL Open Font License 1.1, see",
        "[LICENSE.txt](LICENSE.txt); the license declares no Reserved Font Name, so the subsets keep",
        "the name Inter.",
        "",
        "Do not edit these files. Rerun the script (see its docstring) when `app/tests/fonts.test.mjs`",
        "fails or Inter has a new release.",
        "",
        "| File | Bytes | Glyphs | Codepoints | wght | opsz | GSUB | GPOS | Hinted |",
        "| --- | ---: | ---: | ---: | --- | --- | --- | --- | --- |",
    ]
    for name, i in rows:
        lines.append(f"| `{name}` | {i['bytes']:,} | {i['glyphs']:,} | {len(i['codepoints']):,} | "
                     f"{i['axes']['wght'][0]:g}–{i['axes']['wght'][2]:g} | {i['axes']['opsz'][0]:g}–{i['axes']['opsz'][2]:g} | "
                     f"{' '.join(i['gsub'])} | {' '.join(i['gpos'])} | {'yes' if i['hinted'] else 'no'} |")
    lines += ["", "unicode-range per file:", ""]
    for name, m in manifest["files"].items():
        lines.append(f"- `{name}`: {m['unicodeRange']}")
    lines += [
        "",
        "## What was cut, and why",
        "",
        f"- **Characters**: split `{args.split}`. The core holds ASCII, Latin-1, Latin Extended-A, the rest of",
        "  Windows-1252 (low quotes, €, ™ …), U+2010 and ⌘. The extended file holds the other non-ASCII",
        "  characters in UI strings. Every other script (Greek, Cyrillic, Vietnamese, CJK …) renders in the",
        "  system fallback fonts. Accented letters are in the core because Chromium shapes each font file",
        "  as a separate run: a word split across two files loses kerning at the boundary.",
        f"- **Axes**: wght {AXIS_LIMITS['wght'][0]}–{AXIS_LIMITS['wght'][1]} (400 default, 600–800 in CSS, 900 from `bolder` on",
        "  `<strong>` inside 600/650 headings); opsz untouched (font-optical-sizing: auto, sizes 9.5–42px",
        "  reach the whole 14–32 range).",
        f"- **OpenType features**: kept {' '.join(FEATURES)} (HarfBuzz defaults Inter has, plus `tnum` for",
        "  `font-variant-numeric: tabular-nums`). Dropped everything else, which the app never turns on.",
        "- **Hinting**: none to drop; the release's web variable fonts are unhinted.",
        "- **Also**: STAT table and glyph names dropped; .notdef kept as in the original.",
        "",
        "## When to rerun",
        "",
        "`app/tests/fonts-manifest.mjs` fails when the app starts drawing a character, weight or feature",
        "these files don't cover, or when they and `inter.css` / the preloads drift apart. Then:",
        "",
        "```bash",
        "python3 -m venv .venv && .venv/bin/pip install fonttools==4.68.0 brotli==1.2.1",
        ".venv/bin/python app/build/fonts/subset-inter.py",
        "```",
        "",
        "and check rendering against the official files:",
        "",
        "```bash",
        ".venv/bin/python app/build/fonts/subset-inter.py --baseline /tmp/inter-baseline",
        "(cd app && npm run build) && node app/build/fonts/pixel-diff.mjs /tmp/inter-baseline",
        "```",
        "",
        "(prefix the last command with `xvfb-run -a` on Linux).",
    ]
    (out / "README.md").write_text("\n".join(lines) + "\n")

    for name, i in rows:
        print(f"{name:34} {i['bytes']:>8,} B  {i['glyphs']:>5} glyphs  {len(i['codepoints']):>5} cps")


if __name__ == "__main__":
    main()
