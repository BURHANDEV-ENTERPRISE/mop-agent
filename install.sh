#!/usr/bin/env bash
# MOP-AGENT one-command installer.
#   curl -fsSL https://raw.githubusercontent.com/BURHANDEV-ENTERPRISE/mop-agent/main/install.sh | bash
#
# Clones the repo, installs Node deps, then launches the TUI installer.
set -euo pipefail

REPO="${MOP_AGENT_REPO:-https://github.com/BURHANDEV-ENTERPRISE/mop-agent.git}"
DEST="${MOP_AGENT_DIR:-/opt/mop-agent}"
BRANCH="${MOP_AGENT_BRANCH:-main}"

say() { printf "\033[36m%s\033[0m\n" "$*"; }
err() { printf "\033[31m%s\033[0m\n" "$*" >&2; }

# --- Node >= 20 ---
if ! command -v node >/dev/null 2>&1; then
  err "Node.js not found. Install Node >= 20 first:"
  err "  Debian/Ubuntu: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt-get install -y nodejs"
  err "  Fedora/RHEL:   sudo dnf module install nodejs:20"
  err "  Arch:          sudo pacman -S nodejs npm"
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then err "Node >= 20 required (found $(node -v))."; exit 1; fi

# --- clone or update ---
if [ -d "$DEST/.git" ]; then
  say "Updating existing checkout at $DEST"
  git -C "$DEST" pull --ff-only
else
  say "Cloning $REPO -> $DEST"
  if [ ! -w "$(dirname "$DEST")" ] && [ "$(id -u)" -ne 0 ]; then
    err "No write access to $(dirname "$DEST"). Re-run with sudo, or set MOP_AGENT_DIR=\$HOME/mop-agent"
    exit 1
  fi
  git clone --branch "$BRANCH" --depth 1 "$REPO" "$DEST"
fi

cd "$DEST"
say "Installing Node dependencies (npm ci)…"
npm ci --no-audit --no-fund

say "Launching MOP-AGENT installer…"
exec node installer/mop-agent.mjs "$@"
