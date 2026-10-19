// Compares legacy/ (pinned on the SHA in legacy/SOURCE) with the head of the upstream repository.
//
//   node tools/legacy-sync/sync.ts           report only: nothing under legacy/ is written
//   node tools/legacy-sync/sync.ts --apply   also copies upstream files into legacy/ and updates SOURCE
//
// See MIRRORED for what is copied.
// GITHUB_TOKEN is used when set, to lift the unauthenticated API rate limit.

import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const OWNER = 'mowglitchblaat';
const REPO = 'forestcard';
const BRANCH = 'main';

// Upstream paths mirrored into legacy/: the code, the SQL, the card frames, the tools and the
// workflows. Not the card images (img/), copied nightly from Supabase by a bot.
const MIRRORED =
  /^(moteur-combat\.js|combat\.html|swift-responder\.ts|index\.html|catalogue\.html|overlay\.html|package\.json|patchnotes\.json|tests\/.*|docs\/.*|\d{2}-.*\.sql|cadres\/.*|outils\/.*|\.github\/workflows\/.*)$/;

// The engine file whose diff is printed in full: it is the iso oracle.
const ENGINE_FILE = 'moteur-combat.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LEGACY_DIR = join(ROOT, 'legacy');
const SOURCE_FILE = join(LEGACY_DIR, 'SOURCE');

type TreeEntry = { path: string; type: string };

function apiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'forestcard-legacy-sync',
  };
  const token = process.env['GITHUB_TOKEN'];
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: apiHeaders() });
  if (!response.ok)
    throw new Error(`GET ${url} -> HTTP ${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
}

async function getRaw(sha: string, path: string): Promise<Buffer> {
  const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${sha}/${path}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'forestcard-legacy-sync' } });
  if (!response.ok) throw new Error(`GET ${url} -> HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

// Relative paths (with '/') of every file under legacy/, except SOURCE which is ours.
function listLegacyFiles(dir: string = LEGACY_DIR): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listLegacyFiles(full));
    else out.push(relative(LEGACY_DIR, full).split(sep).join('/'));
  }
  return out.filter(
    (path) => path !== 'SOURCE' && path !== 'node_modules' && !path.startsWith('node_modules/'),
  );
}

function printEngineDiff(oldFile: string, newFile: string): void {
  // git diff --no-index exits with 1 when the files differ: that is the expected case, not an error.
  const result = spawnSync('git', ['--no-pager', 'diff', '--no-index', '--', oldFile, newFile], {
    encoding: 'utf8',
  });
  if (result.status !== 0 && result.status !== 1)
    throw new Error(`git diff failed: ${result.stderr}`);
  process.stdout.write(result.stdout);
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const pinned = readFileSync(SOURCE_FILE, 'utf8').trim();

  const head = await getJson<{
    sha: string;
    commit: { message: string; committer: { date: string } };
  }>(`https://api.github.com/repos/${OWNER}/${REPO}/commits/${BRANCH}`);
  console.log(`Pinned   : ${pinned}`);
  console.log(
    `Upstream : ${head.sha} (${head.commit.committer.date}) ${head.commit.message.split('\n')[0]}`,
  );
  if (head.sha === pinned) {
    console.log('legacy/ is up to date.');
    return;
  }

  const tree = await getJson<{ tree: TreeEntry[]; truncated: boolean }>(
    `https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${head.sha}?recursive=1`,
  );
  if (tree.truncated)
    throw new Error('Upstream tree listing is truncated: refusing to compute a partial diff.');
  const upstreamPaths = tree.tree
    .filter((e) => e.type === 'blob' && MIRRORED.test(e.path))
    .map((e) => e.path);
  const localPaths = listLegacyFiles();

  const staging = mkdtempSync(join(tmpdir(), 'forestcard-legacy-'));
  try {
    const added: string[] = [];
    const modified: string[] = [];
    for (const path of upstreamPaths) {
      const content = await getRaw(head.sha, path);
      const staged = join(staging, path);
      mkdirSync(dirname(staged), { recursive: true });
      writeFileSync(staged, content);
      const local = join(LEGACY_DIR, path);
      if (!existsSync(local)) added.push(path);
      else if (!readFileSync(local).equals(content)) modified.push(path);
    }
    const removed = localPaths.filter((path) => !upstreamPaths.includes(path));

    console.log(`\nAdded    (${added.length}) : ${added.join(', ') || '-'}`);
    console.log(`Modified (${modified.length}) : ${modified.join(', ') || '-'}`);
    console.log(`Removed  (${removed.length}) : ${removed.join(', ') || '-'}`);

    if (modified.includes(ENGINE_FILE)) {
      console.log(`\n--- Diff of ${ENGINE_FILE} (the iso oracle) ---`);
      printEngineDiff(join(LEGACY_DIR, ENGINE_FILE), join(staging, ENGINE_FILE));
    } else {
      console.log(`\n${ENGINE_FILE} is unchanged.`);
    }

    if (!apply) {
      console.log('\nReport only. Re-run with --apply to update legacy/ and SOURCE.');
      return;
    }
    for (const path of [...added, ...modified]) {
      const target = join(LEGACY_DIR, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, readFileSync(join(staging, path)));
    }
    for (const path of removed) unlinkSync(join(LEGACY_DIR, path));
    writeFileSync(SOURCE_FILE, `${head.sha}\n`);
    console.log(
      `\nlegacy/ updated to ${head.sha}. Next: port the rule change, update docs/legacy, run the iso check.`,
    );
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

await main();
