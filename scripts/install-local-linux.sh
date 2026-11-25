#!/usr/bin/env bash
# Install the latest linux-unpacked build as ~/.local/bin/openbentt.
# IMPORTANT: never write the launcher through a symlink to the Electron binary —
# that overwrites the 186MB ELF with a shell script and the app will not open.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/release/linux-unpacked/openbentt"
LAUNCHER="$HOME/.local/bin/openbentt"
DESKTOP="$HOME/.local/share/applications/openbentt.desktop"

if [[ ! -x "$APP" ]]; then
  echo "Missing binary: $APP" >&2
  echo "Build with: npm run build && npx electron-builder --linux dir --publish never" >&2
  exit 1
fi

# Reject a corrupted "binary" that is actually our old launcher script.
if file -b "$APP" | grep -qi 'shell script\|ASCII text'; then
  echo "ERROR: $APP is a shell script, not the Electron ELF. Re-pack with electron-builder." >&2
  exit 1
fi

mkdir -p "$HOME/.local/bin" "$HOME/.local/share/applications"
# Break any symlink so we never overwrite the real Electron binary.
if [[ -L "$LAUNCHER" || -e "$LAUNCHER" ]]; then
  rm -f "$LAUNCHER"
fi

cat > "$LAUNCHER" <<EOF
#!/bin/bash
# Openbentt local launcher — latest linux-unpacked build (do not symlink over the ELF).
set -euo pipefail
ROOT="$ROOT"
APP="\$ROOT/release/linux-unpacked/openbentt"
if [[ ! -x "\$APP" ]]; then
  echo "Openbentt binary missing: \$APP" >&2
  exit 1
fi
if file -b "\$APP" 2>/dev/null | grep -qi 'shell script\|ASCII text'; then
  echo "Openbentt binary looks corrupted (shell script). Re-run: \$ROOT/scripts/install-local-linux.sh after electron-builder." >&2
  exit 1
fi
export LD_LIBRARY_PATH="/usr/lib:\${LD_LIBRARY_PATH:-}"
cd "\$ROOT/release/linux-unpacked"
exec "\$APP" "\$@"
EOF
chmod +x "$LAUNCHER"

ICON_SRC="$ROOT/build/icon.png"
if [[ -f "$ICON_SRC" ]]; then
  mkdir -p "$HOME/.local/share/icons/hicolor/512x512/apps"
  cp -f "$ICON_SRC" "$HOME/.local/share/icons/hicolor/512x512/apps/openbentt.png" 2>/dev/null || true
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
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true

echo "Installed launcher: $LAUNCHER"
file -b "$APP"
ls -lah "$APP" "$LAUNCHER"
