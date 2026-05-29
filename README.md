# `.github` — org meta repository

Org-wide configuration and governance automation for the `wow-look-at-my` org.

## Contents

| Path | Purpose |
| --- | --- |
| `.github/config/pr-minder/pr-minder.jsonc` | Org-level [`pr-minder`](https://github.com/wow-look-at-my/pr-minder) config. |
| `proposed-repo-metadata.json` | Desired descriptions for every repo in the org (source of truth). |
| `.github/scripts/*.ts` | Logic for the repo-metadata workflows, run via the [`typescript`](https://github.com/wow-look-at-my/actions/tree/master/typescript) action. |
| `.github/workflows/` | CI + governance workflows. |

## Repo descriptions: propose -> review -> apply

Two workflows keep every repository's **description** in good shape. They never
edit a repo directly without a human merge in between.

```
schedule/manual                      merge to master
      |                                     |
      v                                     v
 Propose workflow  --PR-->  human review  -->  Apply workflow  -->  octokit update
 (build JSON)               (edit JSON)        (diff + push)        (each repo)
```

Both workflows run their logic as a TypeScript script (`.github/scripts/`) via
`wow-look-at-my/actions@typescript#latest`, which tsc-validates the script and
injects `octokit`, `fs`, `core`, and `$` (git) helpers.

### 1. Propose (`propose-repo-metadata.yml`)

Runs weekly (and on demand). It lists every non-archived, non-fork repo in the
org and updates `proposed-repo-metadata.json`:

- **New repos** are added, seeded with their *current* description (so nothing
  existing gets blanked). Repos with no description get an empty string to fill in.
- **Dead repos** (deleted/archived/renamed) are removed.
- Existing, human-authored descriptions are left untouched.

It then opens or updates a single rolling PR (`chore/sync-repo-metadata`). The
job summary lists which repos still have missing or weak descriptions.

### 2. Review

Edit `proposed-repo-metadata.json` in the PR. Fill in blank or weak
descriptions. The format is:

```json
{
  "repos": {
    "my-repo": { "description": "What this repo is, in one line." }
  }
}
```

### 3. Apply (`apply-repo-metadata.yml`)

On merge to `master` (when `proposed-repo-metadata.json` changes), it diffs the
desired descriptions against the live ones and updates (via the API) only the
repos that changed. Blank descriptions are never pushed. Run it manually with
**dry run** to preview changes without applying them.

## Setup: the `REPO_METADATA_PAT` secret

Both workflows reach other repos through a **fine-grained PAT** stored as the
repo (or org) Actions secret `REPO_METADATA_PAT`. Scope it to **all
repositories** in the org with:

| Permission | Access | Used for |
| --- | --- | --- |
| Repository &rarr; Metadata | Read | listing org repos |
| Repository &rarr; Administration | Read and write | editing descriptions |

The propose workflow opens its PR with the built-in `GITHUB_TOKEN` (no extra
scope needed), so the PAT only needs the two permissions above.

> Note: the propose/apply workflows use `schedule`/`workflow_dispatch` and a
> branch+path filtered `push`. That is intentional — they are governance and
> actuator workflows, not CI, and the apply filter prevents it from running on
> the proposal branch before review.
