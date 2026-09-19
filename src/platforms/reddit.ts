import type { IPlatform } from './base.js';
import type { PlatformPost, PostResult, PostMetrics, RedditCredentials } from '../config/types.js';
import { getCredentials } from '../config/credentials.js';
import { readConfig } from '../config/settings.js';
import { makeError } from './base.js';
import { submitSelfPost, getPostMetrics } from './reddit-client.js';

export class RedditPlatform implements IPlatform {
  readonly name = 'reddit';
  // Self-text posts can't carry image attachments; a link/image post is a
  // different submission type this command doesn't create.
  readonly supportsAttachments = false;

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
    const subreddit = config.platforms.reddit?.defaultSubreddit;
    if (!subreddit) {
      return {
        platform: 'reddit',
        success: false,
        error: 'No default subreddit configured. Run `bip auth reddit` to set one — bip will not guess a subreddit for you.',
      };
    }

    try {
      const submission = await submitSelfPost(creds, {
        subreddit,
        title: post.title ?? post.text.slice(0, 80),
        text: post.text,
      });

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
    const subreddit = config.platforms.reddit?.defaultSubreddit;

    if (!creds?.username || !creds?.password) {
      return {
        platform: 'reddit',
        success: false,
        error: 'No credentials configured',
      };
    }
    if (!subreddit) {
      return {
        platform: 'reddit',
        success: false,
        error: 'No default subreddit configured. Run `bip auth reddit` to set one — bip will not guess a subreddit for you.',
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

  async getMetrics(url: string): Promise<PostMetrics | null> {
    // Reddit permalinks look like /r/<sub>/comments/<id36>/<slug>/
    const postId36 = url.match(/\/comments\/([a-z0-9]+)\//)?.[1];
    if (!postId36 || !this.hasApiCredentials()) return null;

    const creds = getCredentials('reddit') as RedditCredentials;
    const result = await getPostMetrics(creds, postId36).catch(() => null);
    if (!result) return null;

    return {
      likes: result.score,
      comments: result.numComments,
      fetchedAt: new Date().toISOString(),
    };
  }
}
