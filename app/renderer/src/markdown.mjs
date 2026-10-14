/* Markdown → HTML for a skill body. markdown-it keeps raw HTML escaped
   (html: false) and rejects javascript:/data: links, so third-party
   skill files can't inject markup. StyleX can't target descendants of
   generated HTML, so a core rule stamps a compiled class on each token. */

import * as stylex from "@stylexjs/stylex";
import MarkdownIt from "markdown-it";

import { md as mdStyles } from "./styles.mjs";

const cx = (...xs) => stylex.attrs(...xs).class ?? "";

const CLASS_BY_TAG = {
  h1: cx(mdStyles.h, mdStyles.h1),
  h2: cx(mdStyles.h, mdStyles.h2),
  h3: cx(mdStyles.h, mdStyles.h3),
  h4: cx(mdStyles.h, mdStyles.h4),
  h5: cx(mdStyles.h, mdStyles.h4),
  h6: cx(mdStyles.h, mdStyles.h4),
  p: cx(mdStyles.block, mdStyles.p),
  ul: cx(mdStyles.block, mdStyles.list),
  ol: cx(mdStyles.block, mdStyles.list),
  li: cx(mdStyles.li),
  blockquote: cx(mdStyles.block, mdStyles.blockquote),
  table: cx(mdStyles.block, mdStyles.table),
  th: cx(mdStyles.cell, mdStyles.th),
  td: cx(mdStyles.cell),
  hr: cx(mdStyles.hr),
  a: cx(mdStyles.link),
  code: cx(mdStyles.codeInline),
};
const PRE = cx(mdStyles.block, mdStyles.pre);
const PRE_CODE = cx(mdStyles.preCode);
export const MARKDOWN_ROOT = cx(mdStyles.root);

// GitHub-style heading slugs so in-document #anchors resolve. Prefixed so
// a heading like "Content" can't collide with the app's own element ids.
export const HEADING_ID_PREFIX = "md-";
const slug = (text) => text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s/g, "-");

const md = new MarkdownIt({ html: false, linkify: true, typographer: false });

md.core.ruler.push("typecase_classes", (state) => {
  const seen = new Map();
  const walk = (tokens) => {
    tokens.forEach((t, i) => {
      if (t.nesting !== -1 && CLASS_BY_TAG[t.tag] && t.type !== "fence" && t.type !== "code_block") {
        t.attrJoin("class", CLASS_BY_TAG[t.tag]);
      }
      if (t.type === "heading_open") {
        const base = slug(tokens[i + 1]?.content ?? "") || "section";
        const n = seen.get(base) ?? 0;
        seen.set(base, n + 1);
        t.attrSet("id", HEADING_ID_PREFIX + (n ? `${base}-${n}` : base));
      }
      if (t.children) walk(t.children);
    });
  };
  walk(state.tokens);
});

const escape = md.utils.escapeHtml;
const codeBlock = (content, info) => {
  const lang = (info ?? "").trim().split(/\s+/)[0];
  return `<pre class="${PRE}"${lang ? ` data-lang="${escape(lang)}"` : ""}><code class="${PRE_CODE}">${escape(content)}</code></pre>\n`;
};
md.renderer.rules.fence = (tokens, i) => codeBlock(tokens[i].content, tokens[i].info);
md.renderer.rules.code_block = (tokens, i) => codeBlock(tokens[i].content, "");
// Images resolve outside the app's CSP, so they render as links to the file.
md.renderer.rules.image = (tokens, i, options, env, self) => {
  const t = tokens[i];
  const src = t.attrGet("src") ?? "";
  const alt = self.renderInlineAsText(t.children ?? [], options, env) || src;
  return `<a class="${CLASS_BY_TAG.a}" href="${escape(src)}">${escape(alt)}</a>`;
};

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/** Render a SKILL.md file's body (frontmatter stripped) to HTML. */
export function renderSkillMarkdown(raw) {
  return md.render(raw.replace(FRONTMATTER, ""));
}
