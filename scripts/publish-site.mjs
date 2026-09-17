// Publishes this clone to the public GitHub repository as a filtered snapshot.
//
//   npm run publish:site              (add -- --dry-run to build the commit and not push it;
//                                      -- --skip-tests to publish without the e2e gate)
//
// This is also where the end-to-end suite gates a release. It cannot gate the deploy on
// GitHub's runner — no GPU there, and the cockpit renders at seconds per frame through
// SwiftShader — so it runs here, on the machine with the GPU, before the push. A run that
// skipped it says so in the published commit message.
//
// Why a script and not `git push origin main`. The owner keeps docs/, tasks/, .claude/ and
// CLAUDE.md out of the public repository — the spec, art direction, build report, lessons and
// agent skills stay private — and the public history is a series of snapshots that was made by
// hand (V0.0.-1, V0.0.0). This does the same thing on purpose: it takes the tree of the current
// commit, removes the private paths, and commits that tree on top of the public branch as one
// commit, then pushes it. Local `main` and public `main` therefore never share history, which
// is a feature: an accidental `git push origin main` is rejected as a non-fast-forward instead
// of leaking the private paths.
//
// Each published commit records the local commit it was cut from (`Source-Commit:` trailer),
// so the next publish can list what changed in between.
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REMOTE = 'origin';
const PUBLIC_BRANCH = 'main';
/** Paths that never leave this machine. Keep in sync with CLAUDE.md "Deployment". */
const PRIVATE_PATHS = ['docs', 'tasks', '.claude', 'CLAUDE.md'];

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dryRun = process.argv.includes('--dry-run');
const skipTests = process.argv.includes('--skip-tests');

// Returns trimmed stdout; with `stdio: 'inherit'` (the push, so the progress is visible)
// execFileSync returns null and there is nothing to trim.
const git = (args, opts = {}) =>
  (execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'], ...opts }) ?? '').trim();

const fail = (msg) => {
  console.error(`\npublish-site: ${msg}\n`);
  process.exit(1);
};

// 1. Only a committed tree gets published: what goes out must be reproducible from a SHA.
if (git(['status', '--porcelain'])) fail('the working tree has uncommitted changes; commit or stash them first');
const head = git(['rev-parse', 'HEAD']);
const headSubject = git(['log', '-1', '--format=%s', head]);

// 2. The gate: unit tests and the full end-to-end suite against the production build, on
//    this machine. `npm run test:e2e` builds dist/ itself (Playwright's webServer).
if (skipTests) {
  console.warn('\npublish-site: --skip-tests — publishing WITHOUT the end-to-end gate\n');
} else {
  console.log('\nRunning the gate: npm test && npm run test:e2e (a few minutes)\n');
  execFileSync('npm', ['test'], { cwd: repoRoot, stdio: 'inherit', shell: true });
  execFileSync('npm', ['run', 'test:e2e'], { cwd: repoRoot, stdio: 'inherit', shell: true });
}
if (git(['status', '--porcelain'])) fail('the gate left the working tree dirty; commit what changed and run again');

// 3. The public branch as it is right now.
let remoteUrl;
try {
  remoteUrl = git(['remote', 'get-url', REMOTE]);
} catch {
  fail(`no "${REMOTE}" remote; add it with: git remote add ${REMOTE} https://github.com/AbdulrahmanB27/AstroPortfolio.git`);
}
git(['fetch', '--quiet', REMOTE, PUBLIC_BRANCH]);
const publicHead = git(['rev-parse', `${REMOTE}/${PUBLIC_BRANCH}`]);

// 4. The filtered tree, built in a throwaway index so the real one is untouched.
const tmpIndex = resolve(repoRoot, '.git', 'publish-index');
const env = { ...process.env, GIT_INDEX_FILE: tmpIndex };
if (existsSync(tmpIndex)) rmSync(tmpIndex);
git(['read-tree', head], { env });
git(['rm', '-r', '--cached', '--quiet', '--ignore-unmatch', '--', ...PRIVATE_PATHS], { env });
const tree = git(['write-tree'], { env });
rmSync(tmpIndex, { force: true });

// Nothing private may survive the filter — refuse to push rather than trust the list.
const leaked = git(['ls-tree', '-r', '--name-only', tree])
  .split('\n')
  .filter((p) => PRIVATE_PATHS.some((priv) => p === priv || p.startsWith(`${priv}/`)));
if (leaked.length) fail(`private paths survived the filter: ${leaked.join(', ')}`);

const publicTree = git(['rev-parse', `${publicHead}^{tree}`]);
if (tree === publicTree) {
  console.log(`Nothing to publish: ${REMOTE}/${PUBLIC_BRANCH} (${publicHead.slice(0, 7)}) already has this tree.`);
  process.exit(0);
}

// 5. What changed since the last publish, for the message.
const lastMessage = git(['log', '-1', '--format=%B', publicHead]);
const previousSource = /^Source-Commit: ([0-9a-f]{40})$/m.exec(lastMessage)?.[1];
let sinceLines = [];
if (previousSource) {
  try {
    sinceLines = git(['log', '--format=  %h %s', `${previousSource}..${head}`]).split('\n').filter(Boolean);
  } catch {
    sinceLines = [];
  }
}
const count = sinceLines.length || 1;
const message = [
  `Publish ${count} commit${count === 1 ? '' : 's'}: ${headSubject}`,
  '',
  `Snapshot of the private clone at ${head.slice(0, 7)}, without ${PRIVATE_PATHS.join(', ')}.`,
  skipTests
    ? 'Published with --skip-tests: the end-to-end gate did NOT run for this snapshot.'
    : 'Gate: unit tests and the full end-to-end suite passed on the GPU machine before the push.',
  ...(sinceLines.length ? ['', ...sinceLines] : []),
  '',
  `Source-Commit: ${head}`,
  '',
].join('\n');

const commit = git(['commit-tree', tree, '-p', publicHead, '-F', '-'], { input: message });
git(['update-ref', 'refs/heads/public', commit]);

console.log(`\nPublic commit ${commit.slice(0, 7)} on top of ${publicHead.slice(0, 7)} (${REMOTE}/${PUBLIC_BRANCH}):\n`);
console.log(message.replace(/^/gm, '  '));
console.log(`  files: ${git(['ls-tree', '-r', '--name-only', tree]).split('\n').length}`);
console.log(`  diff vs public: ${git(['diff', '--shortstat', publicHead, commit]) || 'none'}`);

if (dryRun) {
  console.log('\n--dry-run: not pushing. Inspect with `git show --stat public`.');
  process.exit(0);
}

// 6. Fast-forward push (the parent is the current public head, so this cannot rewrite history).
git(['push', REMOTE, `refs/heads/public:refs/heads/${PUBLIC_BRANCH}`], { stdio: 'inherit' });
const repoWeb = remoteUrl.replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/');
console.log(`\nPushed. Watch the deploy at ${repoWeb}/actions`);
