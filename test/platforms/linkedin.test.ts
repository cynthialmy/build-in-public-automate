import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LinkedInPlatform } from '../../src/platforms/linkedin.js';
import * as credentials from '../../src/config/credentials.js';

vi.mock('../../src/config/credentials.js', () => ({
  getCredentials: vi.fn(),
}));

describe('LinkedInPlatform', () => {
  const platform = new LinkedInPlatform();

  beforeEach(() => {
    vi.clearAllMocks();
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
});
