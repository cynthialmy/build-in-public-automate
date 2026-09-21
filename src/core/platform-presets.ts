import type { ViewportPreset } from '../capture/screenshot.js';
import type { Platform } from '../config/types.js';

/** Which capture preset matches each platform's card/preview dimensions. */
export const PLATFORM_PRESET: Record<Platform, ViewportPreset> = {
  x: 'x',
  linkedin: 'linkedin',
  reddit: 'reddit',
  hackernews: 'hn',
};
