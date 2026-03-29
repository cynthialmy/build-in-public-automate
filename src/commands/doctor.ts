import { chromium } from 'playwright';
import { colors, divider } from '../core/branding.js';
import { isGitRepo } from '../ai/git.js';
import { isInitialized } from '../config/settings.js';
import { hasCredentials } from '../config/credentials.js';
import type { Platform } from '../config/types.js';
import {
  listAvailableProviders,
  PROVIDER_NAMES,
} from '../ai/providers.js';

const PLATFORMS: Platform[] = ['x', 'linkedin', 'reddit', 'hackernews'];
const PLATFORM_LABELS: Record<Platform, string> = {
  x: 'X (Twitter)',
  linkedin: 'LinkedIn',
  reddit: 'Reddit',
  hackernews: 'HackerNews',
};

function ok(msg: string): void {
  console.log(`  ${colors.success('✓')} ${msg}`);
}

function fail(msg: string, hint?: string): void {
  const suffix = hint ? colors.dim(`  →  run: ${hint}`) : '';
  console.log(`  ${colors.error('✗')} ${msg}${suffix}`);
}

export async function doctorCommand(): Promise<void> {
  console.log();
  divider('bip doctor');
  console.log();

  // 1. Git repo
  if (await isGitRepo()) {
    ok('git repository detected');
  } else {
    fail('not a git repository', 'git init');
  }

  // 2. Initialized
  if (isInitialized()) {
    ok('.buildpublic/ initialized');
  } else {
    fail('.buildpublic/ not initialized', 'bip init');
  }

  // 3. AI API keys (any supported provider)
  const aiProviders = listAvailableProviders();
  if (aiProviders.length > 0) {
    ok(
      `AI API key set (${aiProviders.map((p) => PROVIDER_NAMES[p]).join(', ')})`
    );
  } else {
    fail('No AI API key set', 'bip auth ai');
  }

  // 4. Per-platform credentials (only if initialized)
  if (isInitialized()) {
    for (const platform of PLATFORMS) {
      try {
        if (hasCredentials(platform)) {
          ok(`${PLATFORM_LABELS[platform]} credentials configured`);
        } else {
          fail(`${PLATFORM_LABELS[platform]} credentials missing`, `bip auth ${platform}`);
        }
      } catch {
        fail(`${PLATFORM_LABELS[platform]} credentials missing`, `bip auth ${platform}`);
      }
    }
  }

  // 5. Playwright chromium
  try {
    const execPath = chromium.executablePath();
    if (execPath) {
      ok('Playwright chromium installed');
    } else {
      fail('Playwright chromium not installed', 'npx playwright install chromium');
    }
  } catch {
    fail('Playwright chromium not installed', 'npx playwright install chromium');
  }

  console.log();
}
