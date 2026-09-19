import { describe, it, expect } from 'vitest';
import { getCadenceNudge } from '../../src/core/cadence.js';
import type { BipConfig } from '../../src/config/types.js';

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

const baseConfig: BipConfig = {
  projectName: 'test',
  platforms: {},
  postsDir: '.buildpublic/posts',
  capturesDir: '.buildpublic/captures',
};

describe('getCadenceNudge', () => {
  it('returns null when nothing has ever been posted', () => {
    expect(getCadenceNudge(baseConfig)).toBeNull();
  });

  it('returns null when the last post was recent', () => {
    const config = { ...baseConfig, lastPostedAt: daysAgo(2) };
    expect(getCadenceNudge(config)).toBeNull();
  });

  it('returns a nudge once 7+ days have passed', () => {
    const config = { ...baseConfig, lastPostedAt: daysAgo(8) };
    const nudge = getCadenceNudge(config);
    expect(nudge).toContain('8 days');
    expect(nudge).toContain('bip draft');
  });

  it('returns null for an unparseable timestamp instead of throwing', () => {
    const config = { ...baseConfig, lastPostedAt: 'not-a-date' };
    expect(getCadenceNudge(config)).toBeNull();
  });
});
