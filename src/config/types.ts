import type { AIProvider } from '../ai/providers.js';

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
  /** Saved default when multiple AI API keys are present (see `bip draft` / provider prompt). */
  aiProvider?: AIProvider;
  /**
   * SHA of HEAD the last time `bip post` successfully published something.
   * Used as the diff baseline for the next `bip draft` so posts describe
   * work done *since you last posted*, not just the last N commits.
   */
  lastPostedSha?: string;
  /** ISO timestamp of the last successful `bip post`. Drives the cadence nudge. */
  lastPostedAt?: string;
  /** Saved URL `bip ship` screenshots by default, so it never has to ask twice. */
  previewUrl?: string;
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
  /** Where each successful post landed — needed to look metrics up later. */
  postResults?: Partial<Record<Platform, { url: string; postedAt: string }>>;
  /** Folder path per platform when saved for manual copy-paste instead of posted via bip. */
  manualExports?: Partial<Record<Platform, string>>;
}

export interface PostResult {
  platform: Platform;
  success: boolean;
  url?: string;
  error?: string;
}

/** Normalized engagement numbers — not every platform fills every field. */
export interface PostMetrics {
  likes?: number;
  comments?: number;
  shares?: number;
  impressions?: number;
  fetchedAt: string;
}

export interface PostPreferences {
  platforms: Platform[];
  includeScreenshot: boolean;
  screenshotUrl?: string;
}

export interface PostingRecord {
  draftId: string;
  createdAt: string;
  platform: Platform;
  variantChosen: 1 | 2;
  wasEdited: boolean;
  editDiff?: {
    aiGenerated: string;   // first 200 chars of AI version
    userFinal: string;     // first 200 chars of user-edited version
  };
  textPreview: string;     // first 120 chars of final text
  commitSummary: string;   // one-line summary of what commits covered
  postedSuccessfully: boolean;
}

export interface PostingPreferences {
  totalDrafts: number;
  variantPreferences: Record<Platform, { variant1: number; variant2: number }>;
  editRate: number;        // 0-1
  recentTopics: string[];  // extracted from commitSummary, last 10
  commonEdits: string[];   // patterns detected in editDiffs
  lastUpdated: string;
}
