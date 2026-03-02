import { readdirSync, readFileSync } from 'fs';
import { colors, divider } from '../core/branding.js';
import { isInitialized, postsDir } from '../config/settings.js';
import type { DraftPost } from '../config/types.js';

function loadAllDrafts(): DraftPost[] {
  try {
    const dir = postsDir();
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf-8')) as DraftPost)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

const STATUS_COLOR: Record<DraftPost['status'], (s: string) => string> = {
  posted: colors.success,
  partial: colors.warn,
  draft: colors.dim,
};

export async function historyCommand(options: { limit?: string }): Promise<void> {
  if (!isInitialized()) {
    console.error('bip is not initialized. Run `bip init` first.');
    process.exit(1);
  }

  const limit = options.limit ? parseInt(options.limit, 10) : 10;
  const drafts = loadAllDrafts().slice(0, limit);

  console.log();
  divider('bip history');
  console.log();

  if (drafts.length === 0) {
    console.log(colors.dim('  No drafts yet. Run `bip draft` to create one.'));
    console.log();
    return;
  }

  drafts.forEach((draft, i) => {
    const platforms = draft.posts.map((p) => p.platform).join(' · ');
    const statusFn = STATUS_COLOR[draft.status];
    const preview = draft.posts[0]?.text?.slice(0, 80) ?? '';
    const ellipsis = (draft.posts[0]?.text?.length ?? 0) > 80 ? '...' : '';

    console.log(
      `  ${colors.bold(String(i + 1))}. ${colors.dim(draft.id)}  [${statusFn(draft.status)}]  ${colors.dim(platforms)}`
    );
    console.log(`     ${colors.dim('"' + preview + ellipsis + '"')}`);
    console.log();
  });
}
