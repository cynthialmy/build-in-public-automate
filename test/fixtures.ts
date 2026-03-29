import type {
  BipConfig,
  PlatformPost,
  Platform,
  GitContext,
  PostingRecord,
} from '../src/config/types.js';

export const mockConfig: BipConfig = {
  projectName: 'test-project',
  postsDir: '.buildpublic/posts',
  capturesDir: '.buildpublic/captures',
  platforms: {
    x: {
      enabled: true,
      credentials: {
        appKey: 'test-app-key',
        appSecret: 'test-app-secret',
        accessToken: 'test-access-token',
        accessSecret: 'test-access-secret',
        username: 'testuser',
        password: 'testpass',
      },
    },
    linkedin: {
      enabled: true,
      credentials: {
        accessToken: 'test-access-token',
        personUrn: 'test-person-urn',
      },
    },
    reddit: {
      enabled: true,
      credentials: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        username: 'testuser',
        password: 'testpass',
      },
      defaultSubreddit: 'r/test',
    },
    hackernews: {
      enabled: true,
      credentials: {
        username: 'testuser',
        password: 'testpass',
      },
    },
  },
};

export const mockGitContext: GitContext = {
  branch: 'main',
  commits: [
    'abc1234 2026-01-01 feat: add new feature',
    'def5678 2026-01-02 fix: fix bug in feature',
    'ghi9012 2026-01-03 docs: update documentation',
  ],
  changedFiles: ['src/index.ts', 'src/commands/draft.ts', 'package.json'],
  diff: '+ some new code\n- some old code\n+ more new code',
  linesAdded: 150,
  linesRemoved: 50,
  commitsByType: {
    feat: ['feat: add new feature'],
    fix: ['fix: fix bug in feature'],
    docs: ['docs: update documentation'],
  },
};

export const mockPlatformPost: PlatformPost = {
  platform: 'x',
  text: 'Just shipped a new feature! Check it out 🚀',
  threadParts: ['Part 1', 'Part 2'],
  variant: 1,
};

export const mockRedditPost: PlatformPost = {
  platform: 'reddit',
  text: 'Just shipped a new feature! Check it out',
  title: 'New Feature Release',
  variant: 1,
};

export const mockHackerNewsPost: PlatformPost = {
  platform: 'hackernews',
  text: 'Just shipped a new feature',
  title: 'New Feature Release',
  url: 'https://example.com',
  variant: 1,
};

export const mockPostingRecord: PostingRecord = {
  draftId: 'test-draft-1',
  createdAt: '2026-01-01T00:00:00Z',
  platform: 'x',
  variantChosen: 1,
  wasEdited: true,
  textPreview: 'Just shipped a new feature',
  commitSummary: 'feat: add new feature',
  postedSuccessfully: true,
  editDiff: {
    aiGenerated: 'Just shipped a new feature! Check it out 🚀',
    userFinal: 'Just shipped a new feature',
  },
};

export const mockSoulContent = `# My Posting Voice

I'm a developer who loves shipping fast and sharing the journey.

## Tone
- Technical but accessible
- Honest about failures
- Celebrate small wins

## Style
- Use emojis sparingly
- Keep it short and punchy
- Share specific metrics when possible

## What I Post About
- New features
- Technical challenges
- Learning moments
- Tools and workflows
`;

export const mockBuildInPublicMd = `# BUILD_IN_PUBLIC.md

## Project Description
A CLI tool for automating build-in-public workflows.

## Tech Stack
- TypeScript
- Node.js
- Playwright
- Claude AI

## Milestones
- [x] Initial release
- [ ] Multi-platform support
- [ ] Advanced analytics

## Target Audience
Developers building in public.

## Post Style
Technical, authentic, and actionable.
`;
