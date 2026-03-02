import type { IPlatform } from './base.js';
import type { PlatformPost, PostResult, LinkedInCredentials } from '../config/types.js';
import { getCredentials } from '../config/credentials.js';
import { makeError } from './base.js';

export class LinkedInPlatform implements IPlatform {
  readonly name = 'linkedin';

  hasApiCredentials(): boolean {
    const creds = getCredentials('linkedin');
    return !!(creds && 'accessToken' in creds && creds.accessToken && creds.personUrn);
  }

  async postViaApi(post: PlatformPost): Promise<PostResult> {
    const creds = getCredentials('linkedin') as LinkedInCredentials;

    const body = {
      author: creds.personUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: post.text },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    };

    try {
      const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        return { platform: 'linkedin', success: false, error: `HTTP ${res.status}: ${text}` };
      }

      const data = (await res.json()) as { id: string };
      return {
        platform: 'linkedin',
        success: true,
        url: `https://www.linkedin.com/feed/update/${data.id}`,
      };
    } catch (err) {
      return makeError('linkedin', err);
    }
  }

  async postViaBrowser(post: PlatformPost): Promise<PostResult> {
    const { chromium } = await import('playwright');
    const creds = getCredentials('linkedin') as LinkedInCredentials & {
      username?: string;
      password?: string;
    };
    if (!creds?.username || !creds?.password) {
      return {
        platform: 'linkedin',
        success: false,
        error: 'Browser fallback requires username and password credentials',
      };
    }

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto('https://www.linkedin.com/login');
      await page.fill('#username', creds.username);
      await page.fill('#password', creds.password);
      await page.click('[type="submit"]');
      await page.waitForURL('https://www.linkedin.com/feed/', { timeout: 15000 });

      await page.click('.share-box-feed-entry__trigger');
      await page.waitForSelector('.ql-editor');
      await page.fill('.ql-editor', post.text);
      await page.click('[data-control-name="share.post"]');
      await page.waitForTimeout(3000);

      return { platform: 'linkedin', success: true };
    } catch (err) {
      return makeError('linkedin', err);
    } finally {
      await browser.close();
    }
  }

  async post(post: PlatformPost): Promise<PostResult> {
    if (this.hasApiCredentials()) {
      return this.postViaApi(post);
    }
    return this.postViaBrowser(post);
  }
}
