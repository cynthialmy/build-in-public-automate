import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { IPlatform } from './base.js';
import type { PlatformPost, PostResult, HackerNewsCredentials } from '../config/types.js';
import { getCredentials } from '../config/credentials.js';
import { makeError } from './base.js';

const STATE_PATH = join(process.cwd(), '.buildpublic', 'hn-state.json');

export class HackerNewsPlatform implements IPlatform {
  readonly name = 'hackernews';

  hasApiCredentials(): boolean {
    // HN has no submit API — always use browser
    return false;
  }

  async postViaApi(_post: PlatformPost): Promise<PostResult> {
    return {
      platform: 'hackernews',
      success: false,
      error: 'HackerNews does not have an official submit API. Use postViaBrowser.',
    };
  }

  async postViaBrowser(post: PlatformPost): Promise<PostResult> {
    const { chromium } = await import('playwright');
    const creds = getCredentials('hackernews') as HackerNewsCredentials;

    if (!creds?.username || !creds?.password) {
      return {
        platform: 'hackernews',
        success: false,
        error: 'HackerNews credentials not configured. Run `bip auth hackernews`.',
      };
    }

    const browser = await chromium.launch({ headless: false });

    // Restore saved session state if available
    const contextOptions: Parameters<typeof browser.newContext>[0] = {};
    if (existsSync(STATE_PATH)) {
      contextOptions.storageState = STATE_PATH;
    }

    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    try {
      // Check if already logged in
      await page.goto('https://news.ycombinator.com');
      const loggedIn = await page.locator(`a:text("${creds.username}")`).count() > 0;

      if (!loggedIn) {
        await page.goto('https://news.ycombinator.com/login');
        await page.fill('input[name="acct"]', creds.username);
        await page.fill('input[name="pw"]', creds.password);
        await page.click('input[type="submit"]');
        await page.waitForURL('https://news.ycombinator.com/', { timeout: 10000 });

        // Save session state for next time
        const state = await context.storageState();
        writeFileSync(STATE_PATH, JSON.stringify(state), 'utf-8');
      }

      await page.goto('https://news.ycombinator.com/submit');
      await page.fill('input[name="title"]', post.title ?? post.text.slice(0, 80));

      if (post.url) {
        await page.fill('input[name="url"]', post.url);
      } else {
        await page.fill('textarea[name="text"]', post.text);
      }

      await page.click('input[type="submit"]');
      await page.waitForTimeout(2000);

      const currentUrl = page.url();
      return {
        platform: 'hackernews',
        success: true,
        url: currentUrl.includes('item?id=') ? currentUrl : undefined,
      };
    } catch (err) {
      return makeError('hackernews', err);
    } finally {
      await browser.close();
    }
  }

  async post(post: PlatformPost): Promise<PostResult> {
    return this.postViaBrowser(post);
  }
}
