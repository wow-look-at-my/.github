#!/usr/bin/env node
// Apply descriptions from proposed-repo-metadata.json to the live repositories.
//
// Usage: ORG=<org> [DRY_RUN=true] node apply-metadata.js <proposed-metadata.json> <current-repos.json>
//
//   <proposed-metadata.json>  desired state: { repos: { name: { description } } }
//   <current-repos.json>      JSON array from `gh repo list ... --json name,description`
//
// Only repos whose description differs from the desired value are touched.
// Blank descriptions are never pushed. Set DRY_RUN=true to log without applying.

const fs = require('fs');
const { execFileSync } = require('child_process');

const [, , proposedPath, currentPath] = process.argv;
const org = process.env.ORG;
if (!proposedPath || !currentPath || !org) {
  console.error('Usage: ORG=<org> apply-metadata.js <proposed-metadata.json> <current-repos.json>');
  process.exit(2);
}

const dryRun = process.env.DRY_RUN === 'true';
const proposed = (JSON.parse(fs.readFileSync(proposedPath, 'utf8')).repos) || {};
const current = JSON.parse(fs.readFileSync(currentPath, 'utf8')); // [{ name, description }]
const currentByName = new Map(current.map((r) => [r.name, r.description || '']));

let applied = 0;
let skipped = 0;
let failed = 0;
const changes = [];

for (const [name, meta] of Object.entries(proposed)) {
  const desired = (meta.description || '').trim();
  if (!desired) {
    // Nothing proposed yet for this repo.
    skipped++;
    continue;
  }
  if (!currentByName.has(name)) {
    console.warn(`skip ${name}: not found among current org repos`);
    skipped++;
    continue;
  }
  const existing = (currentByName.get(name) || '').trim();
  if (existing === desired) {
    skipped++;
    continue;
  }

  changes.push(`${name}: "${existing}" -> "${desired}"`);
  if (dryRun) {
    applied++;
    continue;
  }
  try {
    execFileSync('gh', ['repo', 'edit', `${org}/${name}`, '--description', desired], { stdio: 'inherit' });
    applied++;
  } catch (e) {
    console.error(`FAILED ${name}: ${e.message}`);
    failed++;
  }
}

const summary = [
  `### Apply repo metadata${dryRun ? ' (dry run)' : ''}`,
  `- Updated: ${applied}`,
  `- Skipped (blank / unchanged / missing): ${skipped}`,
  `- Failed: ${failed}`,
  '',
  changes.length ? changes.map((c) => '- ' + c).join('\n') : '- No description changes.',
  '',
].join('\n');

process.stdout.write(summary);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

process.exit(failed ? 1 : 0);
