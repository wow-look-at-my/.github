#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const stripJsonComments = require('strip-json-comments');

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.json') || p.endsWith('.jsonc')) out.push(p);
  }
  return out;
}

const files = walk('.github/config');
let failed = 0;
for (const f of files) {
  try {
    JSON.parse(stripJsonComments(fs.readFileSync(f, 'utf8')));
    console.log('OK:', f);
  } catch (e) {
    console.error('FAIL:', f, e.message);
    failed++;
  }
}
if (files.length === 0) console.log('No JSON config files found under .github/config');
process.exit(failed ? 1 : 0);
