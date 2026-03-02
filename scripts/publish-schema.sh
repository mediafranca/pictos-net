#!/bin/bash
# publish-schema.sh — Publish a schema from this repo to its upstream repo
#
# Usage:
#   ./scripts/publish-schema.sh nlu-schema    "feat: add domain and frame_label"
#   ./scripts/publish-schema.sh mf-svg-schema "fix: update metadata schema"
#
# What it does:
#   1. Clones the upstream repo to a temp directory
#   2. Copies the local schema files over (replacing upstream content)
#   3. Commits and pushes to upstream main
#
# Prerequisites:
#   - gh auth or git credentials configured for mediafranca org

set -euo pipefail

SCHEMA_NAME="${1:?Usage: publish-schema.sh <nlu-schema|mf-svg-schema> \"commit message\"}"
COMMIT_MSG="${2:?Usage: publish-schema.sh <nlu-schema|mf-svg-schema> \"commit message\"}"

# Map schema names to upstream repos
declare -A UPSTREAM_REPOS=(
  ["nlu-schema"]="https://github.com/mediafranca/nlu-schema.git"
  ["mf-svg-schema"]="https://github.com/mediafranca/mf-svg-schema.git"
)

REPO_URL="${UPSTREAM_REPOS[$SCHEMA_NAME]:-}"
if [ -z "$REPO_URL" ]; then
  echo "Error: Unknown schema '$SCHEMA_NAME'. Must be one of: ${!UPSTREAM_REPOS[*]}"
  exit 1
fi

LOCAL_DIR="schemas/$SCHEMA_NAME"
if [ ! -d "$LOCAL_DIR" ]; then
  echo "Error: Local directory '$LOCAL_DIR' not found"
  exit 1
fi

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

echo "Cloning $REPO_URL..."
git clone --depth 1 "$REPO_URL" "$TMPDIR/upstream"

echo "Syncing local $LOCAL_DIR -> upstream..."
# Remove old content (except .git)
find "$TMPDIR/upstream" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
# Copy local files
cp -r "$LOCAL_DIR"/. "$TMPDIR/upstream/"

cd "$TMPDIR/upstream"

# Check if there are changes
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  echo "No changes to publish. Upstream is already in sync."
  exit 0
fi

git add -A
git commit -m "$COMMIT_MSG"
echo ""
echo "Changes ready to push:"
git log --oneline -1
echo ""
read -p "Push to $REPO_URL ? [y/N] " confirm
if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
  git push origin main
  echo "Published successfully."
else
  echo "Aborted. Changes NOT pushed."
fi
