#!/usr/bin/env bash
# Commit any changes to proposed-repo-metadata.json onto a rolling branch and
# open (or update) a single PR. Uses the repo's GITHUB_TOKEN via GH_TOKEN.
set -euo pipefail

BRANCH="chore/sync-repo-metadata"
FILE="proposed-repo-metadata.json"

if git diff --quiet -- "$FILE"; then
  echo "No changes to $FILE; nothing to propose."
  exit 0
fi

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git checkout -B "$BRANCH"
git add "$FILE"
git commit -m "chore: sync proposed repo metadata"
git push --force -u origin "$BRANCH"

if [ -n "$(gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number')" ]; then
  echo "Proposal PR already open for $BRANCH; pushed update."
else
  gh pr create \
    --base master \
    --head "$BRANCH" \
    --title "Sync proposed repo metadata" \
    --body "Automated sync of \`$FILE\`.

Review and edit descriptions, then merge to \`master\` to apply them. New repos are
seeded with their current description (or left blank). Fill in any blank or weak
descriptions before merging -- the apply workflow pushes them to each repo on merge."
fi
