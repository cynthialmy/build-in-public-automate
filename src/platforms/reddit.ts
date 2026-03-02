import type { IPlatform } from './base.js';
import type { PlatformPost, PostResult, RedditCredentials } from '../config/types.js';
import { getCredentials } from '../config/credentials.js';
import { readConfig } from '../config/settings.js';
import { makeError } from './base.js';

export class RedditPlatform implements IPlatform {
  readonly name = 'reddit';

  hasApiCredentials(): boolean {
    const creds = getCredentials('reddit');
    return !!(
      creds &&
      'clientId' in creds &&
      creds.clientId &&
      creds.clientSecret &&
      creds.username &&
      creds.password
    );
  }

  async postViaApi(post: PlatformPost): Promise<PostResult> {
    const creds = getCredentials('reddit') as RedditCredentials;
    const config = readConfig();
    const subreddit =
      config.platforms.reddit?.defaultSubreddit ?? 'programming';

    try {
      const Snoowrap = (await import('snoowrap')).default;
      const r = new Snoowrap({
        userAgent: 'bip-cli/0.1.0 by ' + creds.username,
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        username: creds.username,
        password: creds.password,
      });

      const submission = await (
        r.submitSelfpost({
          subredditName: subreddit,
          title: post.title ?? post.text.slice(0, 80),
          text: post.text,
        }) as unknown as Promise<{ permalink: string }>
      );

      return {
        platform: 'reddit',
        success: true,
        url: `https://reddit.com${submission.permalink}`,
      };
    } catch (err) {
      return makeError('reddit', err);
    }
  }

  async postViaBrowser(post: PlatformPost): Promise<PostResult> {
    const { chromium } = await import('playwright');
    const creds = getCredentials('reddit') as RedditCredentials;
    const config = readConfig();
    const subreddit =
      config.platforms.reddit?.defaultSubreddit ?? 'programming';

    if (!creds?.username || !creds?.password) {
      return {
        platform: 'reddit',
        success: false,
        error: 'No credentials configured',
      };
    }

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto('https://www.reddit.com/login');
      await page.fill('#loginUsername', creds.username);
      await page.fill('#loginPassword', creds.password);
      await page.click('[type="submit"]');
      await page.waitForURL(/reddit\.com\//, { timeout: 15000 });

      await page.goto(`https://www.reddit.com/r/${subreddit}/submit`);
      await page.click('[data-click-id="text"]');
      await page.fill('[placeholder="Title"]', post.title ?? post.text.slice(0, 80));
      await page.fill('.public-DraftEditor-content', post.text);
      await page.click('[data-click-id="submit"]');
      await page.waitForTimeout(3000);

      return { platform: 'reddit', success: true };
    } catch (err) {
      return makeError('reddit', err);
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
