import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { postsDir } from '../config/settings.js';
import type { DraftPost } from '../config/types.js';

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
