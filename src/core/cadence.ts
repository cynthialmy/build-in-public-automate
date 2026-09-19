import type { BipConfig } from '../config/types.js';

/** Nudge threshold: consistency is the point of "build in public". */
const NUDGE_AFTER_DAYS = 7;

/**
 * Returns a human-readable nudge if it's been a while since the last
 * successful `bip post`, or null if there's nothing to say (never posted
 * yet, or posted recently). Mirrors `checkStaleness` in commands/evolve.ts,
 * but for *posting cadence* rather than the project doc going stale.
 */
export function getCadenceNudge(config: BipConfig): string | null {
  if (!config.lastPostedAt) return null;

  const lastPosted = new Date(config.lastPostedAt).getTime();
  if (Number.isNaN(lastPosted)) return null;

  const daysSince = Math.floor((Date.now() - lastPosted) / 86_400_000);
  if (daysSince < NUDGE_AFTER_DAYS) return null;

  return `You haven't posted in ${daysSince} days — consistency is the whole point of building in public. Run \`bip draft\` when you're ready.`;
}
