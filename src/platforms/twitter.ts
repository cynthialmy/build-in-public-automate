import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { TwitterApi } from 'twitter-api-v2';
import type { IPlatform, Attachments } from './base.js';
import type { PlatformPost, PostResult, XCredentials } from '../config/types.js';
import { getCredentials } from '../config/credentials.js';
import { makeError } from './base.js';

const STATE_PATH = join(process.cwd(), '.buildpublic', 'x-state.json');

export class TwitterPlatform implements IPlatform {
  readonly name = 'x';
  readonly supportsAttachments = true;

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

  async postViaApi(post: PlatformPost, attachments: Attachments = []): Promise<PostResult> {
    const creds = getCredentials('x') as XCredentials;
    const client = new TwitterApi({
      appKey: creds.appKey,
      appSecret: creds.appSecret,
      accessToken: creds.accessToken,
      accessSecret: creds.accessSecret,
    });

    try {
      // X only accepts media on v1.1 upload; up to 4 images per tweet.
      let mediaIds: string[] | undefined;
      if (attachments.length > 0) {
        mediaIds = await Promise.all(
          attachments.slice(0, 4).map((path) => client.v1.uploadMedia(path))
        );
      }

      const parts = post.threadParts?.length ? post.threadParts : [post.text];
      let lastTweetId: string | undefined;
      let firstUrl: string | undefined;

      for (const [i, part] of parts.entries()) {
        const payload: Parameters<typeof client.v2.tweet>[0] = { text: part };
        if (lastTweetId) {
          payload.reply = { in_reply_to_tweet_id: lastTweetId };
        }
        // Attach media to the first tweet in the thread only.
        if (i === 0 && mediaIds?.length) {
          // twitter-api-v2 types media_ids as a fixed-length tuple (1-4);
          // we've already capped attachments to 4 above.
          payload.media = { media_ids: mediaIds as [string, string, string, string] };
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

  async postViaBrowser(post: PlatformPost, attachments: Attachments = []): Promise<PostResult> {
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

      const parts = post.threadParts?.length ? post.threadParts : [post.text];
      await page.fill('[data-testid="tweetTextarea_0"]', parts[0]!);

      if (attachments.length > 0) {
        const fileInput = page.locator('[data-testid="fileInput"]').first();
        if ((await fileInput.count()) > 0) {
          await fileInput.setInputFiles(attachments.slice(0, 4));
          await page.waitForTimeout(1500); // let uploads finish rendering
        }
      }

      // Build out the rest of the thread by clicking "Add" between tweets.
      for (let i = 1; i < parts.length; i++) {
        await page.click('[data-testid="addButton"]');
        await page.waitForSelector(`[data-testid="tweetTextarea_${i}"]`, { timeout: 5000 });
        await page.fill(`[data-testid="tweetTextarea_${i}"]`, parts[i]!);
      }

      const postButton = parts.length > 1
        ? '[data-testid="tweetButton"]'
        : '[data-testid="tweetButtonInline"]';
      await page.click(postButton);
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

  async post(post: PlatformPost, attachments: Attachments = []): Promise<PostResult> {
    if (this.hasApiCredentials()) {
      return this.postViaApi(post, attachments);
    }
    return this.postViaBrowser(post, attachments);
  }
}
