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

export async function getContext(depth = 20): Promise<GitContext> {
  const git = simpleGit(process.cwd());

  const [log, status, diff] = await Promise.all([
    git.log({ maxCount: depth }),
    git.status(),
    git.diff(['HEAD']).catch(() => git.diff()),
  ]);

  const branch = status.current ?? 'unknown';

  const commits = log.all.map(
    (c: DefaultLogFields & ListLogLine) =>
      `${c.hash.slice(0, 7)} ${c.date.slice(0, 10)} ${c.message}`
  );

  const changedFiles = [
    ...status.modified,
    ...status.created,
    ...status.deleted,
    ...status.renamed.map((r: { from: string; to: string }) => `${r.from} → ${r.to}`),
    ...status.staged,
  ].filter((v, i, a) => a.indexOf(v) === i); // dedupe

  const truncatedDiff =
    diff.length > DIFF_MAX_CHARS
      ? diff.slice(0, DIFF_MAX_CHARS) + '\n... [diff truncated]'
      : diff;

  // Count lines added/removed from diff
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const line of diff.split('\n')) {
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
