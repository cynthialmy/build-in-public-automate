import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { saveManualExport, manualExportDir } from '../../src/commands/manual-export.js';
import { ensureDirectories } from '../../src/config/settings.js';
import type { PlatformPost } from '../../src/config/types.js';

describe('manual-export', () => {
  beforeEach(() => {
    ensureDirectories();
  });

  describe('saveManualExport', () => {
    it('writes post.txt with the plain post text', () => {
      const post: PlatformPost = { platform: 'linkedin', text: 'Hello world' };
      const dir = saveManualExport('draft-1', post);

      expect(dir).toBe(manualExportDir('draft-1', 'linkedin'));
      expect(readFileSync(join(dir, 'post.txt'), 'utf-8')).toContain('Hello world');
    });

    it('includes title and thread parts for platforms that have them', () => {
      const post: PlatformPost = {
        platform: 'x',
        text: 'ignored',
        threadParts: ['first tweet', 'second tweet'],
      };
      const dir = saveManualExport('draft-2', post);
      const content = readFileSync(join(dir, 'post.txt'), 'utf-8');

      expect(content).toContain('[1/2]');
      expect(content).toContain('first tweet');
      expect(content).toContain('[2/2]');
      expect(content).toContain('second tweet');
    });

    it('includes a title line and a link line when present', () => {
      const post: PlatformPost = {
        platform: 'hackernews',
        text: 'ignored',
        title: 'Show HN: bip',
        url: 'https://github.com/cynthialmy/build-in-public-automate',
      };
      const dir = saveManualExport('draft-3', post);
      const content = readFileSync(join(dir, 'post.txt'), 'utf-8');

      expect(content).toContain('Title: Show HN: bip');
      expect(content).toContain('Link: https://github.com/cynthialmy/build-in-public-automate');
    });

    it('copies attachments into the export folder', () => {
      const post: PlatformPost = { platform: 'linkedin', text: 'Hello' };
      const fakeScreenshotPath = join(manualExportDir('draft-4', 'source'), '..', 'fake.png');
      mkdirSync(join(manualExportDir('draft-4', 'source'), '..'), { recursive: true });
      writeFileSync(fakeScreenshotPath, 'not a real png', 'utf-8');

      const dir = saveManualExport('draft-4', post, [fakeScreenshotPath]);

      expect(existsSync(join(dir, 'screenshot-1.png'))).toBe(true);
    });
  });
});
