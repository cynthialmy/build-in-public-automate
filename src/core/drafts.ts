import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { postsDir } from '../config/settings.js';
import type { DraftPost, PlatformPost } from '../config/types.js';

/** All saved drafts, newest first. Empty array if the posts dir is missing/unreadable. */
export function loadAllDrafts(): DraftPost[] {
  try {
    const dir = postsDir();
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as DraftPost)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

/** Writes a new draft file with the given posts and returns it. Caller must have already run `ensureDirectories()`. */
export function saveNewDraft(posts: PlatformPost[], attachments: string[] = []): DraftPost {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const draft: DraftPost = {
    id: `draft-${timestamp}`,
    createdAt: new Date().toISOString(),
    status: 'draft',
    postedTo: [],
    posts,
    attachments,
  };
  writeFileSync(join(postsDir(), `${draft.id}.json`), JSON.stringify(draft, null, 2), 'utf-8');
  return draft;
}
