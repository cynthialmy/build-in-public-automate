import { TwitterApi } from 'twitter-api-v2';
import type { IPlatform } from './base.js';
import type { PlatformPost, PostResult, XCredentials } from '../config/types.js';
import { getCredentials } from '../config/credentials.js';
import { makeError } from './base.js';

export class TwitterPlatform implements IPlatform {
  readonly name = 'x';

  hasApiCredentials(): boolean {
    const creds = getCredentials('x');
    return !!(
      creds &&
      'appKey' in creds &&
      creds.appKey &&
      creds.appSecret &&
      creds.accessToken &&
      creds.accessSecret
    );
  }

  async postViaApi(post: PlatformPost): Promise<PostResult> {
    const creds = getCredentials('x') as XCredentials;
    const client = new TwitterApi({
      appKey: creds.appKey,
      appSecret: creds.appSecret,
      accessToken: creds.accessToken,
      accessSecret: creds.accessSecret,
    });

    try {
      const parts = post.threadParts?.length ? post.threadParts : [post.text];
      let lastTweetId: string | undefined;
      let firstUrl: string | undefined;

      for (const part of parts) {
        const payload: Parameters<typeof client.v2.tweet>[0] = { text: part };
        if (lastTweetId) {
          payload.reply = { in_reply_to_tweet_id: lastTweetId };
        }
        const result = await client.v2.tweet(payload);
        lastTweetId = result.data.id;
        if (!firstUrl) {
          const username = (await client.v2.me()).data.username;
          firstUrl = `https://x.com/${username}/status/${lastTweetId}`;
        }
      }

      return { platform: 'x', success: true, url: firstUrl };
    } catch (err) {
      return makeError('x', err);
    }
  }

  async postViaBrowser(post: PlatformPost): Promise<PostResult> {
    const { chromium } = await import('playwright');
    const creds = getCredentials('x') as XCredentials & { username?: string };
    if (!creds) {
      return { platform: 'x', success: false, error: 'No credentials configured' };
    }

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto('https://x.com/login');
      await page.fill('input[name="text"]', creds.accessToken); // username field
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1000);
      await page.fill('input[name="password"]', creds.accessSecret);
      await page.keyboard.press('Enter');
      await page.waitForURL('https://x.com/home', { timeout: 15000 });

      await page.click('[data-testid="SideNav_NewTweet_Button"]');
      await page.waitForSelector('[data-testid="tweetTextarea_0"]');
      await page.fill('[data-testid="tweetTextarea_0"]', post.text);
      await page.click('[data-testid="tweetButtonInline"]');
      await page.waitForTimeout(2000);

      return { platform: 'x', success: true };
    } catch (err) {
      return makeError('x', err);
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
