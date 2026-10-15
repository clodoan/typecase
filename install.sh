#!/bin/sh
# Install or update Typecase.app from the latest GitHub release.
#   curl -fsSL https://raw.githubusercontent.com/clodoan/typecase/main/install.sh | sh
set -eu

REPO="clodoan/typecase"

[ "$(uname -s)" = Darwin ] || { echo "Typecase.app runs on macOS only." >&2; exit 1; }
case "$(uname -m)" in
  arm64) ARCH=arm64 ;;
  x86_64) ARCH=x64 ;;
  *) echo "Unsupported Mac architecture: $(uname -m)" >&2; exit 1 ;;
esac
ASSET="Typecase-mac-$ARCH.zip"
URL="${TYPECASE_URL:-https://github.com/$REPO/releases/latest/download/$ASSET}"

DEST=/Applications
[ -w "$DEST" ] || { DEST="$HOME/Applications"; mkdir -p "$DEST"; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "Downloading ${ASSET}..."
if ! curl -fL --progress-bar "$URL" -o "$TMP/$ASSET"; then
  # Private repo: fall back to an authenticated GitHub CLI download.
  command -v gh >/dev/null 2>&1 || { echo "Download failed: $URL" >&2; exit 1; }
  gh release download --repo "$REPO" --pattern "$ASSET" --dir "$TMP" --clobber
fi
ditto -x -k "$TMP/$ASSET" "$TMP"

if pgrep -xq Typecase; then
  osascript -e 'quit app "Typecase"' >/dev/null 2>&1 || true
  sleep 1
fi
rm -rf "$DEST/Typecase.app"
ditto "$TMP/Typecase.app" "$DEST/Typecase.app"
# Not notarized: clear quarantine so the first launch isn't blocked.
xattr -dr com.apple.quarantine "$DEST/Typecase.app" 2>/dev/null || true

echo "Installed $DEST/Typecase.app"
open "$DEST/Typecase.app"
