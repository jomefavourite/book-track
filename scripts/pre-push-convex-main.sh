#!/usr/bin/env bash

set -euo pipefail

remote_name="${1:-}"
remote_url="${2:-}"

while read -r local_ref local_sha remote_ref remote_sha; do
  if [[ "$remote_ref" == "refs/heads/main" ]]; then
    echo "Push to main detected on remote '$remote_name' ($remote_url)."
    echo "Running required deployment: npx convex deploy -y"
    npx convex deploy -y
  fi
done
