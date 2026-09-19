import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { IPlatform, Attachments } from './base.js';
import type { PlatformPost, PostResult, LinkedInCredentials } from '../config/types.js';
import { getCredentials } from '../config/credentials.js';
import { makeError } from './base.js';

const STATE_PATH = join(process.cwd(), '.buildpublic', 'linkedin-state.json');

/** Registers + uploads one image to LinkedIn, returning the resulting asset urn. */
async function uploadImageAsset(
  imagePath: string,
  creds: LinkedInCredentials
): Promise<string> {
  const registerRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: creds.personUrn,
        serviceRelationships: [
          { relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' },
        ],
      },
    }),
  });

  if (!registerRes.ok) {
    throw new Error(`LinkedIn registerUpload failed: HTTP ${registerRes.status}: ${await registerRes.text()}`);
  }

  const registerData = (await registerRes.json()) as {
    value: {
      asset: string;
      uploadMechanism: {
        'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': { uploadUrl: string };
      };
    };
  };

  const uploadUrl =
    registerData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
  const assetUrn = registerData.value.asset;

  const imageBytes = readFileSync(imagePath);
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${creds.accessToken}` },
    body: imageBytes,
  });

  if (!uploadRes.ok) {
    throw new Error(`LinkedIn image upload failed: HTTP ${uploadRes.status}`);
  }

  return assetUrn;
}

export class LinkedInPlatform implements IPlatform {
  readonly name = 'linkedin';
  readonly supportsAttachments = true;

  hasApiCredentials(): boolean {
    const creds = getCredentials('linkedin');
    return !!(creds && 'accessToken' in creds && creds.accessToken && creds.personUrn);
  }

  async postViaApi(post: PlatformPost, attachments: Attachments = []): Promise<PostResult> {
    const creds = getCredentials('linkedin') as LinkedInCredentials;

    try {
      // LinkedIn's UGC API supports one image asset per share via this flow;
      // only the first attachment is used if more than one is provided.
      let assetUrn: string | undefined;
      if (attachments.length > 0) {
        assetUrn = await uploadImageAsset(attachments[0]!, creds);
      }

      const body = {
        author: creds.personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: post.text },
            shareMediaCategory: assetUrn ? 'IMAGE' : 'NONE',
            ...(assetUrn ? { media: [{ status: 'READY', media: assetUrn }] } : {}),
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      };

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

    const browser = await chromium.launch({ headless: false });

    // Restore a saved session if we have one — same pattern as X and
    // HackerNews. LinkedIn is aggressive about detecting automated logins,
    // so this never auto-fills a password from disk: the person logs in
    // themselves in the opened window, and only the resulting session
    // cookies are persisted (no LinkedIn password is ever stored).
    const contextOptions: Parameters<typeof browser.newContext>[0] = {};
    if (existsSync(STATE_PATH)) {
      contextOptions.storageState = STATE_PATH;
    }

    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    try {
      await page.goto('https://www.linkedin.com/feed/');
      const loggedIn = await page.locator('.share-box-feed-entry__trigger').count() > 0;

      if (!loggedIn) {
        console.log('\n  Browser opened. Please log in to LinkedIn, then wait...');
        await page.goto('https://www.linkedin.com/login');
        await page.waitForURL('https://www.linkedin.com/feed/', { timeout: 120000 });

        const state = await context.storageState();
        writeFileSync(STATE_PATH, JSON.stringify(state), 'utf-8');
        console.log("  Session saved — you won't need to log in again.\n");
      }

      await page.click('.share-box-feed-entry__trigger');
      await page.waitForSelector('.ql-editor');
      await page.fill('.ql-editor', post.text);
      await page.click('[data-control-name="share.post"]');
      await page.waitForTimeout(3000);

      const updatedState = await context.storageState();
      writeFileSync(STATE_PATH, JSON.stringify(updatedState), 'utf-8');

      return { platform: 'linkedin', success: true };
    } catch (err) {
      return makeError('linkedin', err);
    } finally {
      await browser.close();
    }
  }

  async post(post: PlatformPost, attachments: Attachments = []): Promise<PostResult> {
    if (this.hasApiCredentials()) {
      return this.postViaApi(post, attachments);
    }
    // Browser fallback does not support image attachments (LinkedIn's
    // compose UI upload flow is not automated here).
    return this.postViaBrowser(post);
  }
}
