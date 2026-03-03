import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { TwitterApi } from 'twitter-api-v2';
import type { IPlatform } from './base.js';
import type { PlatformPost, PostResult, XCredentials } from '../config/types.js';
import { getCredentials } from '../config/credentials.js';
import { makeError } from './base.js';

const STATE_PATH = join(process.cwd(), '.buildpublic', 'x-state.json');

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

    // Use real Chrome with automation detection disabled so Google sign-in works
    const browser = await chromium.launch({
      headless: false,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled'],
      ignoreDefaultArgs: ['--enable-automation'],
    });

    // Restore saved session if available
    const contextOptions: Parameters<typeof browser.newContext>[0] = {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    };
    if (existsSync(STATE_PATH)) {
      contextOptions.storageState = STATE_PATH;
    }

    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    try {
      await page.goto('https://x.com/home');

      // Check if already logged in
      const loggedIn = await page.locator('[data-testid="SideNav_NewTweet_Button"]').count() > 0;

      if (!loggedIn) {
        console.log('\n  Browser opened. Please log in to X (Google/Apple/password work), then wait...');
        await page.goto('https://x.com/login');
        await page.waitForURL('https://x.com/home', { timeout: 120000 });

        // Save session for next time
        const state = await context.storageState();
        writeFileSync(STATE_PATH, JSON.stringify(state), 'utf-8');
        console.log("  Session saved — you won't need to log in again.\n");
      }

      // Compose and post
      await page.click('[data-testid="SideNav_NewTweet_Button"]');
      await page.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 5000 });
      await page.fill('[data-testid="tweetTextarea_0"]', post.text);
      await page.click('[data-testid="tweetButtonInline"]');
      await page.waitForTimeout(2000);

      // Save updated session state
      const updatedState = await context.storageState();
      writeFileSync(STATE_PATH, JSON.stringify(updatedState), 'utf-8');

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
