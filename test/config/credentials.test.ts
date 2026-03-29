import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getCredentials,
  setCredentials,
  hasCredentials,
} from '../../src/config/credentials.js';
import type {
  XCredentials,
  LinkedInCredentials,
  RedditCredentials,
  HackerNewsCredentials,
  Platform,
} from '../../src/config/types.js';
import { mkdirSync, rmdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(process.cwd(), '.buildpublic-test');

const mockXCredentials: XCredentials = {
  appKey: 'test-app-key',
  appSecret: 'test-app-secret',
  accessToken: 'test-access-token',
  accessSecret: 'test-access-secret',
  username: 'testuser',
  password: 'testpass',
};

const mockLinkedInCredentials: LinkedInCredentials = {
  accessToken: 'test-access-token',
  personUrn: 'test-person-urn',
};

const mockRedditCredentials: RedditCredentials = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  username: 'testuser',
  password: 'testpass',
};

const mockHackerNewsCredentials: HackerNewsCredentials = {
  username: 'testuser',
  password: 'testpass',
};

describe('Credentials', () => {
  beforeEach(() => {
    // Clean up and create test directory
    if (require('fs').existsSync(TEST_DIR)) {
      rmdirSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });

    // Initialize config
    const config = {
      projectName: 'test',
      postsDir: '.buildpublic/posts',
      capturesDir: '.buildpublic/captures',
      platforms: {},
    };
    writeFileSync(join(TEST_DIR, 'config.json'), JSON.stringify(config));
  });

  afterEach(() => {
    // Clean up after tests
    if (require('fs').existsSync(TEST_DIR)) {
      rmdirSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('getCredentials', () => {
    it('should return undefined for platform without credentials', () => {
      expect(getCredentials('x')).toBeUndefined();
    });

    it('should return X credentials when set', () => {
      setCredentials('x', mockXCredentials);
      const credentials = getCredentials('x');
      expect(credentials).toEqual(mockXCredentials);
    });

    it('should return LinkedIn credentials when set', () => {
      setCredentials('linkedin', mockLinkedInCredentials);
      const credentials = getCredentials('linkedin');
      expect(credentials).toEqual(mockLinkedInCredentials);
    });

    it('should return Reddit credentials when set', () => {
      setCredentials('reddit', mockRedditCredentials);
      const credentials = getCredentials('reddit');
      expect(credentials).toEqual(mockRedditCredentials);
    });

    it('should return HackerNews credentials when set', () => {
      setCredentials('hackernews', mockHackerNewsCredentials);
      const credentials = getCredentials('hackernews');
      expect(credentials).toEqual(mockHackerNewsCredentials);
    });
  });

  describe('setCredentials', () => {
    it('should set X credentials', () => {
      setCredentials('x', mockXCredentials);

      const { readFileSync } = require('fs');
      const config = JSON.parse(readFileSync(join(TEST_DIR, 'config.json'), 'utf-8'));
      expect(config.platforms.x.credentials).toEqual(mockXCredentials);
      expect(config.platforms.x.enabled).toBe(true);
    });

    it('should set LinkedIn credentials', () => {
      setCredentials('linkedin', mockLinkedInCredentials);

      const { readFileSync } = require('fs');
      const config = JSON.parse(readFileSync(join(TEST_DIR, 'config.json'), 'utf-8'));
      expect(config.platforms.linkedin.credentials).toEqual(mockLinkedInCredentials);
      expect(config.platforms.linkedin.enabled).toBe(true);
    });

    it('should set Reddit credentials', () => {
      setCredentials('reddit', mockRedditCredentials);

      const { readFileSync } = require('fs');
      const config = JSON.parse(readFileSync(join(TEST_DIR, 'config.json'), 'utf-8'));
      expect(config.platforms.reddit.credentials).toEqual(mockRedditCredentials);
      expect(config.platforms.reddit.enabled).toBe(true);
    });

    it('should set HackerNews credentials', () => {
      setCredentials('hackernews', mockHackerNewsCredentials);

      const { readFileSync } = require('fs');
      const config = JSON.parse(readFileSync(join(TEST_DIR, 'config.json'), 'utf-8'));
      expect(config.platforms.hackernews.credentials).toEqual(mockHackerNewsCredentials);
      expect(config.platforms.hackernews.enabled).toBe(true);
    });

    it('should enable platform when setting credentials', () => {
      const { readFileSync } = require('fs');

      setCredentials('x', mockXCredentials);
      let config = JSON.parse(readFileSync(join(TEST_DIR, 'config.json'), 'utf-8'));
      expect(config.platforms.x.enabled).toBe(true);

      // Update credentials again
      setCredentials('x', { ...mockXCredentials, username: 'newuser' });
      config = JSON.parse(readFileSync(join(TEST_DIR, 'config.json'), 'utf-8'));
      expect(config.platforms.x.enabled).toBe(true);
      expect(config.platforms.x.credentials.username).toBe('newuser');
    });
  });

  describe('hasCredentials', () => {
    it('should return false when platform has no credentials', () => {
      expect(hasCredentials('x')).toBe(false);
    });

    it('should return true when platform has credentials', () => {
      setCredentials('x', mockXCredentials);
      expect(hasCredentials('x')).toBe(true);
    });

    it('should work for all platforms', () => {
      expect(hasCredentials('x')).toBe(false);
      expect(hasCredentials('linkedin')).toBe(false);
      expect(hasCredentials('reddit')).toBe(false);
      expect(hasCredentials('hackernews')).toBe(false);

      setCredentials('x', mockXCredentials);
      setCredentials('linkedin', mockLinkedInCredentials);
      setCredentials('reddit', mockRedditCredentials);
      setCredentials('hackernews', mockHackerNewsCredentials);

      expect(hasCredentials('x')).toBe(true);
      expect(hasCredentials('linkedin')).toBe(true);
      expect(hasCredentials('reddit')).toBe(true);
      expect(hasCredentials('hackernews')).toBe(true);
    });
  });
});
