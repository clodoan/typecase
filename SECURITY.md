# Security policy

## Supported versions

Only the latest release of the Mac app and the CLI on `main` get fixes.

## Report a vulnerability

Report privately through
[GitHub security advisories](https://github.com/clodoan/typecase/security/advisories/new).
Do not open a public issue for a vulnerability.

Include the version, steps to reproduce, and the impact you expect.

## Threat model

Typecase reads skill files that other people write. It treats every
`SKILL.md` and every file next to it as untrusted input:

- Skill markdown renders with raw HTML escaped, under a Content Security
  Policy that allows only the app's own scripts.
- Links in a skill never navigate the app window. Web links open in your
  browser. Relative links open in Cursor or VS Code, or reveal the file in
  Finder. Typecase never runs a file from a skill.
- The renderer runs sandboxed with context isolation and no Node.js access.

A way to break any of these is a vulnerability.

## Release integrity

Release zips are ad-hoc signed and not notarized. GitHub shows the
SHA-256 digest of each release asset on the release page. Compare it with
`shasum -a 256 Typecase-mac-arm64.zip` before you open the app.
