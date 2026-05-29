// Apply descriptions from proposed-repo-metadata.json to the live repositories.
//
// Runs inside wow-look-at-my/actions@typescript: `core`, `fs`, `context`,
// `getOctokit`, `secrets`, and `inputs` are injected globals.
//
// Only repos whose description differs from the desired value are touched.
// Blank descriptions are never pushed. Set the `dry_run` input to preview.

interface RepoMeta {
  description: string;
}
interface ProposedFile {
  repos: Record<string, RepoMeta>;
}

const FILE = 'proposed-repo-metadata.json';
const owner = context.repo.owner;
const dryRun = inputs.dry_run === true;

// PAT needs Metadata: read + Administration: read and write across the org.
const oct = getOctokit(secrets.REPO_METADATA_PAT);
const all: any[] = await oct.paginate(oct.rest.repos.listForOrg, {
  org: owner,
  type: 'all',
  per_page: 100,
});
const current = new Map<string, string>(
  all.filter((r: any) => !r.archived && !r.fork).map((r: any): [string, string] => [r.name, r.description || '']),
);

const proposed = JSON.parse(fs.readFileSync(FILE, 'utf-8')) as ProposedFile;
const repos = proposed.repos ?? {};

let applied = 0;
let skipped = 0;
let failed = 0;
const changes: string[] = [];

for (const [name, meta] of Object.entries(repos)) {
  const desired = (meta.description || '').trim();
  if (!desired) {
    skipped++;
    continue;
  }
  if (!current.has(name)) {
    core.warning(`skip ${name}: not found among current org repos`);
    skipped++;
    continue;
  }
  if ((current.get(name) || '').trim() === desired) {
    skipped++;
    continue;
  }

  changes.push(`${name}: "${current.get(name)}" -> "${desired}"`);
  if (dryRun) {
    applied++;
    continue;
  }
  try {
    await oct.rest.repos.update({ owner, repo: name, description: desired });
    applied++;
  } catch (e: any) {
    core.error(`FAILED ${name}: ${e?.message ?? String(e)}`);
    failed++;
  }
}

await core.summary
  .addHeading(`Apply repo metadata${dryRun ? ' (dry run)' : ''}`, 3)
  .addList([
    `Updated: ${applied}`,
    `Skipped (blank / unchanged / missing): ${skipped}`,
    `Failed: ${failed}`,
  ])
  .addRaw(changes.length ? '\n' + changes.map((c) => `- ${c}`).join('\n') : '\n- No description changes.')
  .write();

if (failed > 0) core.setFailed(`${failed} description update(s) failed.`);
