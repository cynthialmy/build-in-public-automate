import type {
  Platform,
  PlatformCredentials,
  XCredentials,
  LinkedInCredentials,
  RedditCredentials,
  HackerNewsCredentials,
} from './types.js';
import { readConfig, writeConfig } from './settings.js';

export function getCredentials(platform: 'x'): XCredentials | undefined;
export function getCredentials(platform: 'linkedin'): LinkedInCredentials | undefined;
export function getCredentials(platform: 'reddit'): RedditCredentials | undefined;
export function getCredentials(platform: 'hackernews'): HackerNewsCredentials | undefined;
export function getCredentials(platform: Platform): PlatformCredentials | undefined {
  const config = readConfig();
  return config.platforms[platform]?.credentials;
}

export function setCredentials(platform: Platform, credentials: PlatformCredentials): void {
  const config = readConfig();
  if (!config.platforms[platform]) {
    config.platforms[platform] = { enabled: true };
  }
  config.platforms[platform]!.credentials = credentials;
  config.platforms[platform]!.enabled = true;
  writeConfig(config);
}

export function hasCredentials(platform: Platform): boolean {
  const config = readConfig();
  return !!config.platforms[platform]?.credentials;
}
