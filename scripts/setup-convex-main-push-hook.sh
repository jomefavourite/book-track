#!/usr/bin/env bash

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
hook_source="$repo_root/scripts/pre-push-convex-main.sh"
hook_target="$repo_root/.git/hooks/pre-push"

if [[ ! -f "$hook_source" ]]; then
  echo "Missing hook source: $hook_source" >&2
  exit 1
fi

cp "$hook_source" "$hook_target"
chmod +x "$hook_target"

echo "Installed pre-push hook at $hook_target"
echo "Pushes to main will now run: npx convex deploy"
