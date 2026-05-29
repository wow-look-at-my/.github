// Sync proposed-repo-metadata.json with the live set of org repositories, then
// open or update a single rolling PR with the changes.
//
// Runs inside wow-look-at-my/actions@typescript: `core`, `fs`, `context`, `$`,
// and `getOctokit` are injected globals -- no imports needed.

interface RepoMeta {
  description: string;
}
interface ProposedFile {
  repos: Record<string, RepoMeta>;
}

const FILE = 'proposed-repo-metadata.json';
const BRANCH = 'chore/sync-repo-metadata';
const owner = context.repo.owner;
const repo = context.repo.repo;

// PAT (Metadata: read) is required to see every repo in the org.
const lister = getOctokit(secrets.REPO_METADATA_PAT);
const all: any[] = await lister.paginate(lister.rest.repos.listForOrg, {
  org: owner,
  type: 'all',
  per_page: 100,
});
const live = all.filter((r: any) => !r.archived && !r.fork);
const liveNames = new Set<string>(live.map((r: any) => r.name as string));

// Load existing proposals, if any.
let proposed: ProposedFile = { repos: {} };
if (fs.existsSync(FILE)) {
  const parsed = JSON.parse(fs.readFileSync(FILE, 'utf-8')) as Partial<ProposedFile>;
  proposed = { repos: parsed.repos ?? {} };
}

const added: string[] = [];
const removed: string[] = [];

// Add new repos, seeding with their current description (never blank an existing one).
for (const r of live) {
  if (!proposed.repos[r.name]) {
    proposed.repos[r.name] = { description: (r.description as string) || '' };
    added.push(r.name as string);
  }
}

// Drop repos that are gone (deleted / renamed / archived / now a fork).
for (const name of Object.keys(proposed.repos)) {
  if (!liveNames.has(name)) {
    delete proposed.repos[name];
    removed.push(name);
  }
}

// Sort keys for a stable diff.
const sorted: ProposedFile = { repos: {} };
for (const name of Object.keys(proposed.repos).sort()) {
  sorted.repos[name] = proposed.repos[name];
}
fs.writeFileSync(FILE, JSON.stringify(sorted, null, 2) + '\n');

const missing = Object.entries(sorted.repos)
  .filter(([, v]) => !v.description || v.description.trim().length < 10)
  .map(([k]) => k);

await core.summary
  .addHeading('Repo metadata sync', 3)
  .addList([
    `Repos tracked: ${Object.keys(sorted.repos).length}`,
    `Added: ${added.length ? added.join(', ') : 'none'}`,
    `Removed: ${removed.length ? removed.join(', ') : 'none'}`,
    `Missing / weak descriptions (${missing.length}): ${missing.length ? missing.join(', ') : 'none'}`,
  ])
  .write();

// Did the file actually change?
let changed = false;
try {
  await $`git diff --quiet -- ${FILE}`.silent();
} catch {
  changed = true;
}

if (!changed) {
  core.info(`No changes to ${FILE}; nothing to propose.`);
} else {
  await $`git config user.name ${'github-actions[bot]'}`;
  await $`git config user.email ${'41898282+github-actions[bot]@users.noreply.github.com'}`;
  await $`git checkout -B ${BRANCH}`;
  await $`git add ${FILE}`;
  await $`git commit -m ${'chore: sync proposed repo metadata'}`;
  await $`git push --force -u origin ${BRANCH}`;

  // The PR lives in this repo, so the built-in GITHUB_TOKEN is enough.
  const prBot = getOctokit(secrets.GITHUB_TOKEN);
  const open = await prBot.rest.pulls.list({ owner, repo, state: 'open', head: `${owner}:${BRANCH}` });
  if (open.data.length > 0) {
    core.info(`PR #${open.data[0].number} already open; pushed update.`);
  } else {
    const body = [
      `Automated sync of \`${FILE}\`.`,
      '',
      'Review and edit descriptions, then merge to `master` to apply them. New repos',
      'are seeded with their current description (or left blank). Fill in any blank or',
      'weak descriptions before merging -- the apply workflow pushes them on merge.',
    ].join('\n');
    const created = await prBot.rest.pulls.create({
      owner,
      repo,
      base: 'master',
      head: BRANCH,
      title: 'Sync proposed repo metadata',
      body,
    });
    core.info(`Opened PR #${created.data.number}.`);
  }
}
