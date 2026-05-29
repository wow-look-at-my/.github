#!/usr/bin/env node
// Sync proposed-repo-metadata.json with the live set of org repositories.
//
// Usage: node build-proposed-metadata.js <current-repos.json> <proposed-metadata.json>
//
//   <current-repos.json>   JSON array from `gh repo list ... --json name,description`
//   <proposed-metadata.json>  the file to create/update in place
//
// Behaviour:
//   - New repos are added, seeded with their CURRENT description (so existing
//     descriptions are never blanked out). Repos with no description are seeded
//     with "" for a human to fill in.
//   - Repos that no longer exist (archived/deleted/renamed) are removed.
//   - Human-authored descriptions already in the file are left untouched.
//   - Keys are sorted so the committed diff stays stable.

const fs = require('fs');

const [, , currentPath, proposedPath] = process.argv;
if (!currentPath || !proposedPath) {
  console.error('Usage: build-proposed-metadata.js <current-repos.json> <proposed-metadata.json>');
  process.exit(2);
}

const current = JSON.parse(fs.readFileSync(currentPath, 'utf8')); // [{ name, description }]

let proposed = { repos: {} };
if (fs.existsSync(proposedPath)) {
  proposed = JSON.parse(fs.readFileSync(proposedPath, 'utf8'));
  if (!proposed.repos) proposed.repos = {};
}

const currentNames = new Set(current.map((r) => r.name));
const added = [];
const removed = [];

// Add new repos, seeding with their current description.
for (const repo of current) {
  if (!proposed.repos[repo.name]) {
    proposed.repos[repo.name] = { description: repo.description || '' };
    added.push(repo.name);
  }
}

// Drop entries for repos that no longer exist.
for (const name of Object.keys(proposed.repos)) {
  if (!currentNames.has(name)) {
    delete proposed.repos[name];
    removed.push(name);
  }
}

// Sort keys for a stable diff.
const sorted = { repos: {} };
for (const name of Object.keys(proposed.repos).sort()) {
  sorted.repos[name] = proposed.repos[name];
}

fs.writeFileSync(proposedPath, JSON.stringify(sorted, null, 2) + '\n');

// Report repos that still need a real description.
const missing = Object.entries(sorted.repos)
  .filter(([, v]) => !v.description || v.description.trim().length < 10)
  .map(([k]) => k);

const summary = [
  '### Repo metadata sync',
  `- Repos tracked: ${Object.keys(sorted.repos).length}`,
  `- Added: ${added.length ? added.join(', ') : 'none'}`,
  `- Removed: ${removed.length ? removed.join(', ') : 'none'}`,
  `- Missing / weak descriptions (${missing.length}): ${missing.length ? missing.join(', ') : 'none'}`,
  '',
].join('\n');

process.stdout.write(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}
