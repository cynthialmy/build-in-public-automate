import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../src/config/credentials.js', () => ({
  getCredentials: vi.fn(),
}));

const gotoMock = vi.fn().mockResolvedValue(undefined);
const fillMock = vi.fn().mockResolvedValue(undefined);
const clickMock = vi.fn().mockResolvedValue(undefined);
const waitForSelectorMock = vi.fn().mockResolvedValue(undefined);
const waitForURLMock = vi.fn().mockResolvedValue(undefined);
const waitForTimeoutMock = vi.fn().mockResolvedValue(undefined);
const countMock = vi.fn().mockResolvedValue(0);
const storageStateMock = vi.fn().mockResolvedValue({ cookies: [] });
const closeMock = vi.fn().mockResolvedValue(undefined);

const page = {
  goto: gotoMock,
  fill: fillMock,
  click: clickMock,
  locator: vi.fn(() => ({ count: countMock })),
  waitForSelector: waitForSelectorMock,
  waitForURL: waitForURLMock,
  waitForTimeout: waitForTimeoutMock,
};

const newPageMock = vi.fn().mockResolvedValue(page);
const context = { newPage: newPageMock, storageState: storageStateMock };
const newContextMock = vi.fn().mockResolvedValue(context);
const launchMock = vi.fn().mockResolvedValue({ newContext: newContextMock, close: closeMock });

vi.mock('playwright', () => ({
  chromium: { launch: launchMock },
}));

const { LinkedInPlatform } = await import('../../src/platforms/linkedin.js');
import * as credentials from '../../src/config/credentials.js';
const { existsSync, readFileSync } = vi.mocked(await import('fs'));

const API_CREDS = { accessToken: 'token-123', personUrn: 'urn:li:person:abc' };

describe('LinkedInPlatform', () => {
  const platform = new LinkedInPlatform();

  beforeEach(() => {
    vi.clearAllMocks();
    existsSync.mockReturnValue(false);
    countMock.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('hasApiCredentials', () => {
    it('is false when no credentials are stored', () => {
      vi.mocked(credentials.getCredentials).mockReturnValue(undefined);
      expect(platform.hasApiCredentials()).toBe(false);
    });

    it('is false for the browser-login sentinel (empty accessToken/personUrn)', () => {
      // This is what `bip auth linkedin` stores when the person skips the
      // API token to use browser login instead — it must NOT be treated
      // as usable API credentials, or post() would call the API with an
      // empty token instead of falling back to the browser.
      vi.mocked(credentials.getCredentials).mockReturnValue({
        accessToken: '',
        personUrn: '',
      });
      expect(platform.hasApiCredentials()).toBe(false);
    });

    it('is true when a real access token and person URN are stored', () => {
      vi.mocked(credentials.getCredentials).mockReturnValue({
        accessToken: 'token-123',
        personUrn: 'urn:li:person:abc',
      });
      expect(platform.hasApiCredentials()).toBe(true);
    });
  });

  describe('postViaApi', () => {
    beforeEach(() => {
      vi.mocked(credentials.getCredentials).mockReturnValue(API_CREDS);
    });

    it('posts text-only content and builds the feed update URL', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'urn:li:share:1' }) })
      );

      const result = await platform.postViaApi({ platform: 'linkedin', text: 'hello world' });

      expect(fetch).toHaveBeenCalledWith(
        'https://api.linkedin.com/v2/ugcPosts',
        expect.objectContaining({ method: 'POST' })
      );
      const body = JSON.parse((fetch as any).mock.calls[0][1].body);
      expect(body.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory).toBe('NONE');
      expect(result).toEqual({
        platform: 'linkedin',
        success: true,
        url: 'https://www.linkedin.com/feed/update/urn:li:share:1',
      });
    });

    it('uploads the first attachment as an image asset and attaches it to the share', async () => {
      readFileSync.mockReturnValue(Buffer.from('fake-image-bytes'));
      const fetchMock = vi
        .fn()
        // registerUpload
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            value: {
              asset: 'urn:li:digitalmediaAsset:xyz',
              uploadMechanism: {
                'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': {
                  uploadUrl: 'https://upload.linkedin.com/put-here',
                },
              },
            },
          }),
        })
        // PUT image bytes
        .mockResolvedValueOnce({ ok: true })
        // ugcPosts
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'urn:li:share:2' }) });
      vi.stubGlobal('fetch', fetchMock);

      const result = await platform.postViaApi(
        { platform: 'linkedin', text: 'with image' },
        ['/tmp/shot.png']
      );

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://upload.linkedin.com/put-here',
        expect.objectContaining({ method: 'PUT' })
      );
      const shareBody = JSON.parse(fetchMock.mock.calls[2][1].body);
      expect(shareBody.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory).toBe(
        'IMAGE'
      );
      expect(result.success).toBe(true);
    });

    it('returns a failure result when the register-upload call fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' })
      );

      const result = await platform.postViaApi(
        { platform: 'linkedin', text: 'with image' },
        ['/tmp/shot.png']
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('registerUpload failed');
    });

    it('returns a failure result on a non-ok ugcPosts response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' })
      );

      const result = await platform.postViaApi({ platform: 'linkedin', text: 'hi' });

      expect(result).toEqual({
        platform: 'linkedin',
        success: false,
        error: 'HTTP 429: rate limited',
      });
    });

    it('returns a failure result when fetch throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

      const result = await platform.postViaApi({ platform: 'linkedin', text: 'hi' });

      expect(result).toEqual({ platform: 'linkedin', success: false, error: 'network down' });
    });
  });

  describe('postViaBrowser', () => {
    it('logs in when no session is saved, then composes and shares a post', async () => {
      vi.mocked(credentials.getCredentials).mockReturnValue(undefined);
      countMock.mockResolvedValue(0);

      const result = await platform.postViaBrowser({ platform: 'linkedin', text: 'hello world' });

      expect(waitForURLMock).toHaveBeenCalledWith(
        'https://www.linkedin.com/feed/',
        expect.objectContaining({ timeout: 120000 })
      );
      expect(fillMock).toHaveBeenCalledWith('.ql-editor', 'hello world');
      expect(result).toEqual({ platform: 'linkedin', success: true });
      expect(closeMock).toHaveBeenCalled();
    });

    it('skips the login flow when a saved session is already logged in', async () => {
      existsSync.mockReturnValue(true);
      countMock.mockResolvedValue(1);

      await platform.postViaBrowser({ platform: 'linkedin', text: 'hi' });

      expect(waitForURLMock).not.toHaveBeenCalled();
    });

    it('returns a failure result and still closes the browser when a page action throws', async () => {
      gotoMock.mockRejectedValueOnce(new Error('navigation timeout'));

      const result = await platform.postViaBrowser({ platform: 'linkedin', text: 'hi' });

      expect(result).toEqual({ platform: 'linkedin', success: false, error: 'navigation timeout' });
      expect(closeMock).toHaveBeenCalled();
    });
  });

  describe('post', () => {
    it('uses the API when credentials are configured', async () => {
      vi.mocked(credentials.getCredentials).mockReturnValue(API_CREDS);
      const apiSpy = vi.spyOn(platform, 'postViaApi').mockResolvedValue({ platform: 'linkedin', success: true });
      const browserSpy = vi.spyOn(platform, 'postViaBrowser').mockResolvedValue({ platform: 'linkedin', success: true });

      await platform.post({ platform: 'linkedin', text: 'hi' });

      expect(apiSpy).toHaveBeenCalled();
      expect(browserSpy).not.toHaveBeenCalled();
    });

    it('falls back to the browser when no API credentials are configured', async () => {
      vi.mocked(credentials.getCredentials).mockReturnValue(undefined);
      const apiSpy = vi.spyOn(platform, 'postViaApi');
      const browserSpy = vi.spyOn(platform, 'postViaBrowser').mockResolvedValue({ platform: 'linkedin', success: true });

      await platform.post({ platform: 'linkedin', text: 'hi' });

      expect(browserSpy).toHaveBeenCalled();
      expect(apiSpy).not.toHaveBeenCalled();
    });
  });
});
