#!/usr/bin/env bash
# Install the latest linux-unpacked build for the current user.
# Copies the app into ~/.local/share/openbentt/app so it works without the
# monorepo path, and never overwrites the Electron ELF with a launcher script.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/release/linux-unpacked"
SRC_APP="$SRC/openbentt"
INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/openbentt/app"
LAUNCHER="${XDG_BIN_HOME:-$HOME/.local/bin}/openbentt"
DESKTOP="${XDG_DATA_HOME:-$HOME/.local/share}/applications/openbentt.desktop"

if [[ ! -x "$SRC_APP" ]]; then
  echo "Missing binary: $SRC_APP" >&2
  echo "Build with: npm run build && npx electron-builder --linux dir --publish never" >&2
  exit 1
fi

# Reject a corrupted "binary" that is actually our old launcher script.
if file -b "$SRC_APP" | grep -qi 'shell script\|ASCII text'; then
  echo "ERROR: $SRC_APP is a shell script, not the Electron ELF. Re-pack with electron-builder." >&2
  exit 1
fi

mkdir -p "$(dirname "$INSTALL_DIR")" "$(dirname "$LAUNCHER")" "$(dirname "$DESKTOP")"

# Replace previous install atomically (never symlink launcher → ELF).
rm -rf "${INSTALL_DIR}.new"
mkdir -p "${INSTALL_DIR}.new"
# Prefer rsync when available; fall back to cp -a.
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$SRC/" "${INSTALL_DIR}.new/"
else
  cp -a "$SRC/." "${INSTALL_DIR}.new/"
fi

rm -rf "$INSTALL_DIR"
mv "${INSTALL_DIR}.new" "$INSTALL_DIR"

APP="$INSTALL_DIR/openbentt"
if [[ ! -x "$APP" ]]; then
  echo "Install failed: $APP missing after copy" >&2
  exit 1
fi
if file -b "$APP" | grep -qi 'shell script\|ASCII text'; then
  echo "ERROR: installed binary looks like a shell script." >&2
  exit 1
fi

# Break any symlink / previous bad launcher so we never overwrite the ELF.
if [[ -L "$LAUNCHER" || -e "$LAUNCHER" ]]; then
  rm -f "$LAUNCHER"
fi

cat > "$LAUNCHER" <<EOF
#!/bin/bash
# Openbentt user launcher — runs the copied linux-unpacked tree.
set -euo pipefail
APP="$APP"
if [[ ! -x "\$APP" ]]; then
  echo "Openbentt binary missing: \$APP" >&2
  echo "Re-run scripts/install-local-linux.sh after electron-builder --linux dir." >&2
  exit 1
fi
if file -b "\$APP" 2>/dev/null | grep -qi 'shell script\|ASCII text'; then
  echo "Openbentt binary looks corrupted (shell script). Reinstall with scripts/install-local-linux.sh." >&2
  exit 1
fi
export LD_LIBRARY_PATH="/usr/lib:\${LD_LIBRARY_PATH:-}"
cd "$INSTALL_DIR"
exec "\$APP" "\$@"
EOF
chmod +x "$LAUNCHER"

ICON_SRC="$ROOT/build/icon.png"
if [[ -f "$ICON_SRC" ]]; then
  mkdir -p "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/512x512/apps"
  cp -f "$ICON_SRC" "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/512x512/apps/openbentt.png" 2>/dev/null || true
fi

cat > "$DESKTOP" <<EOF
[Desktop Entry]
Name=Openbentt
Comment=Local-first AI research workspace
Exec=$LAUNCHER %U
Icon=openbentt
Terminal=false
Type=Application
Categories=Office;Education;Science;
StartupWMClass=Openbentt
EOF
update-desktop-database "${XDG_DATA_HOME:-$HOME/.local/share}/applications" 2>/dev/null || true

echo "Installed app:     $INSTALL_DIR"
echo "Installed launcher: $LAUNCHER"
file -b "$APP"
ls -lah "$APP" "$LAUNCHER"
