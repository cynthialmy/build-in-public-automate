import { simpleGit } from 'simple-git';
import type { DefaultLogFields, ListLogLine } from 'simple-git';
import type { GitContext } from '../config/types.js';

const DIFF_MAX_CHARS = 8000;

const COMMIT_TYPE_PREFIXES = [
  'feat', 'fix', 'chore', 'refactor', 'docs', 'test', 'style', 'perf', 'ci', 'build',
];

export async function isGitRepo(): Promise<boolean> {
  const git = simpleGit(process.cwd());
  try {
    await git.status();
    return true;
  } catch {
    return false;
  }
}

function groupCommitsByType(commits: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const commit of commits) {
    // commit format: "abc1234 2026-01-01 feat: add something"
    const message = commit.split(' ').slice(2).join(' ');
    const match = message.match(/^(\w+)(?:\(.+?\))?[!:]?\s*:/);
    const type = match ? match[1].toLowerCase() : 'other';
    const key = COMMIT_TYPE_PREFIXES.includes(type) ? type : 'other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(message);
  }
  return groups;
}

/** True if `ref` resolves to a commit that still exists in this repo. */
async function refExists(git: ReturnType<typeof simpleGit>, ref: string): Promise<boolean> {
  try {
    await git.raw(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

export async function getContext(
  depth = 20,
  options: { baseline?: string } = {}
): Promise<GitContext> {
  const git = simpleGit(process.cwd());

  const [log, status, workingTreeDiff] = await Promise.all([
    git.log({ maxCount: depth }),
    git.status(),
    git.diff(['HEAD']).catch(() => git.diff()),
  ]);

  const branch = status.current ?? 'unknown';

  const commits = log.all.map(
    (c: DefaultLogFields & ListLogLine) =>
      `${c.hash.slice(0, 7)} ${c.date.slice(0, 10)} ${c.message}`
  );

  // `git diff HEAD` only shows *uncommitted* changes. On a clean tree right
  // after committing — exactly when someone runs `bip draft` — that's
  // empty, so the AI got nothing but bare commit subject lines to work
  // from. Diff the actual committed range too: from `options.baseline`
  // (typically the SHA of the last successful `bip post`) if it still
  // exists, otherwise from the oldest commit in this log window.
  let committedDiff = '';
  let committedChangedFiles: string[] = [];

  let baseRef: string | null = null;
  if (options.baseline && (await refExists(git, options.baseline))) {
    baseRef = options.baseline;
  } else if (log.all.length > 1) {
    baseRef = log.all[log.all.length - 1]!.hash;
  }

  if (baseRef) {
    committedDiff = await git.diff([`${baseRef}..HEAD`]).catch(() => '');
    const nameStatus = await git
      .diff(['--name-only', `${baseRef}..HEAD`])
      .catch(() => '');
    committedChangedFiles = nameStatus.split('\n').filter(Boolean);
  }

  const changedFiles = [
    ...committedChangedFiles,
    ...status.modified,
    ...status.created,
    ...status.deleted,
    ...status.renamed.map((r: { from: string; to: string }) => `${r.from} → ${r.to}`),
    ...status.staged,
  ].filter((v, i, a) => a.indexOf(v) === i); // dedupe

  const combinedDiff = [committedDiff, workingTreeDiff].filter(Boolean).join('\n');

  const truncatedDiff =
    combinedDiff.length > DIFF_MAX_CHARS
      ? combinedDiff.slice(0, DIFF_MAX_CHARS) + '\n... [diff truncated]'
      : combinedDiff;

  // Count lines added/removed from diff
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const line of combinedDiff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) linesAdded++;
    else if (line.startsWith('-') && !line.startsWith('---')) linesRemoved++;
  }

  const commitsByType = groupCommitsByType(commits);

  return {
    branch,
    commits,
    changedFiles,
    diff: truncatedDiff,
    linesAdded,
    linesRemoved,
    commitsByType,
  };
}

/** Current HEAD SHA, for recording as `lastPostedSha` after a successful post. */
export async function getHeadSha(): Promise<string | null> {
  const git = simpleGit(process.cwd());
  try {
    return (await git.revparse(['HEAD'])).trim();
  } catch {
    return null;
  }
}
