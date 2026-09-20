import { colors, divider, platformBadge } from '../core/branding.js';
import { isInitialized, readConfig } from '../config/settings.js';
import { hasCredentials } from '../config/credentials.js';
import { getCadenceNudge } from '../core/cadence.js';
import { loadAllDrafts } from '../core/drafts.js';
import type { Platform } from '../config/types.js';

const PLATFORMS: Platform[] = ['x', 'linkedin', 'reddit', 'hackernews'];

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export async function statusCommand(): Promise<void> {
  if (!isInitialized()) {
    console.error('bip is not initialized. Run `bip init` first.');
    process.exit(1);
  }

  const config = readConfig();
  console.log();
  divider('bip status');
  console.log();

  // Project info
  console.log(`  Project:   ${colors.bold(config.projectName)}`);

  // Platform status
  const platformStatus = PLATFORMS.map((p) => {
    let hasCreds = false;
    try { hasCreds = hasCredentials(p); } catch { /* not configured */ }
    const badge = platformBadge(p);
    const mark = hasCreds ? colors.success('✓') : colors.error('✗');
    return `${badge} ${mark}`;
  }).join('  ');
  console.log(`  Platforms: ${platformStatus}`);

  // Recent drafts
  const drafts = loadAllDrafts();
  console.log();
  if (drafts.length === 0) {
    console.log(colors.dim('  No drafts yet.'));
  } else {
    console.log(colors.bold('  Recent drafts:'));
    for (const draft of drafts.slice(0, 5)) {
      const platforms = draft.posts.map((p) => p.platform).join(', ');
      const statusColor =
        draft.status === 'posted'
          ? colors.success
          : draft.status === 'partial'
          ? colors.warn
          : colors.dim;
      const age = timeAgo(draft.createdAt);
      console.log(
        `    ${colors.dim(draft.id)}  ${colors.dim(platforms)}  ${statusColor(draft.status)}  ${colors.dim(age)}`
      );
    }
  }

  const nudge = getCadenceNudge(config);
  if (nudge) {
    console.log();
    console.log(colors.warn(`  ⚠ ${nudge}`));
  }

  console.log();
  console.log(colors.dim("  Run `bip draft` to generate a new post."));
  console.log();
}
