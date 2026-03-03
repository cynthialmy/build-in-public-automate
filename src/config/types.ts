export type Platform = 'x' | 'linkedin' | 'reddit' | 'hackernews';

export interface XCredentials {
  appKey: string;
  appSecret: string;
  accessToken: string;
  accessSecret: string;
  username?: string;   // for browser fallback login
  password?: string;  // for browser fallback login
}

export interface LinkedInCredentials {
  accessToken: string;
  personUrn: string;
}

export interface RedditCredentials {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
}

export interface HackerNewsCredentials {
  username: string;
  password: string;
}

export type PlatformCredentials =
  | XCredentials
  | LinkedInCredentials
  | RedditCredentials
  | HackerNewsCredentials;

export interface PlatformConfig {
  enabled: boolean;
  credentials?: PlatformCredentials;
  defaultSubreddit?: string; // Reddit only
}

export interface BipConfig {
  projectName: string;
  platforms: Partial<Record<Platform, PlatformConfig>>;
  postsDir: string;
  capturesDir: string;
}

export interface GitContext {
  branch: string;
  commits: string[];
  changedFiles: string[];
  diff: string;
  linesAdded: number;
  linesRemoved: number;
  commitsByType: Record<string, string[]>;
}

export interface PlatformPost {
  platform: Platform;
  text: string;
  threadParts?: string[]; // X threads
  title?: string;          // Reddit / HackerNews
  url?: string;            // HackerNews link posts
  variant?: 1 | 2;        // which variant this is
}

export interface DraftPost {
  id: string;
  createdAt: string;
  status: 'draft' | 'posted' | 'partial';
  postedTo: Platform[];
  posts: PlatformPost[];
  attachments?: string[];
}

export interface PostResult {
  platform: Platform;
  success: boolean;
  url?: string;
  error?: string;
}

export interface PostPreferences {
  platforms: Platform[];
  includeScreenshot: boolean;
  screenshotUrl?: string;
}
