#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_PORTABLE_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"

if [[ "${OSTYPE:-}" != darwin* ]]; then
  echo "This script builds the macOS DMG and must be run on macOS."
  exit 1
fi

if [[ -z "${CUTLIST_NODE_RUNTIME_PATH:-}" ]]; then
  if [[ -x "$DEFAULT_PORTABLE_NODE" ]]; then
    export CUTLIST_NODE_RUNTIME_PATH="$DEFAULT_PORTABLE_NODE"
  else
    echo "Missing CUTLIST_NODE_RUNTIME_PATH."
    echo ""
    echo "Set it to a portable macOS Node binary, then rerun this script."
    echo "Example:"
    echo "  CUTLIST_NODE_RUNTIME_PATH=/absolute/path/to/node zsh scripts/build-alpha-dmg.sh"
    exit 1
  fi
fi

echo "Using portable Node: $CUTLIST_NODE_RUNTIME_PATH"

cd "$ROOT_DIR"
npm run build
