import { mkdirSync, writeFileSync, copyFileSync } from 'fs';
import { extname, join } from 'path';
import { postsDir } from '../config/settings.js';
import type { PlatformPost } from '../config/types.js';

/**
 * Local, no-credentials-needed fallback: instead of failing when someone
 * doesn't have API access or a browser-login session for a platform, save
 * the post text (and any screenshot) into a folder they can open, copy
 * from, and paste into the platform by hand.
 */
export function manualExportDir(draftId: string, platform: string): string {
  return join(postsDir(), draftId, platform);
}

function renderPostText(post: PlatformPost): string {
  const lines: string[] = [];

  if (post.title) {
    lines.push(`Title: ${post.title}`, '');
  }

  if (post.threadParts?.length) {
    post.threadParts.forEach((part, i) => {
      lines.push(`[${i + 1}/${post.threadParts!.length}]`, part, '');
    });
  } else {
    lines.push(post.text);
  }

  if (post.url) {
    lines.push('', `Link: ${post.url}`);
  }

  return lines.join('\n').trim() + '\n';
}

/**
 * Writes `post.txt` (and copies any attachments) into
 * `.buildpublic/posts/<draftId>/<platform>/`, and returns that folder path.
 */
export function saveManualExport(
  draftId: string,
  post: PlatformPost,
  attachments: string[] = []
): string {
  const dir = manualExportDir(draftId, post.platform);
  mkdirSync(dir, { recursive: true });

  writeFileSync(join(dir, 'post.txt'), renderPostText(post), 'utf-8');

  attachments.forEach((path, i) => {
    const ext = extname(path) || '.png';
    copyFileSync(path, join(dir, `screenshot-${i + 1}${ext}`));
  });

  return dir;
}
