import chalk, { type ChalkInstance } from 'chalk';
import type { Platform } from '../config/types.js';

export const colors = {
  success: chalk.green,
  error: chalk.red,
  warn: chalk.yellow,
  info: chalk.cyan,
  dim: chalk.dim,
  bold: chalk.bold,
  accent: chalk.hex('#6366f1'),
};

export function banner(): void {
  console.log(colors.accent.bold(`
  ██████╗ ██╗██████╗
  ██╔══██╗██║██╔══██╗
  ██████╔╝██║██████╔╝
  ██╔══██╗██║██╔═══╝
  ██████╔╝██║██║
  ╚═════╝ ╚═╝╚═╝  build in public
`));
}

export function divider(label?: string): void {
  if (label) {
    const line = '─'.repeat(Math.max(0, 40 - label.length - 2));
    console.log(colors.dim(`── ${label} ${line}`));
  } else {
    console.log(colors.dim('─'.repeat(44)));
  }
}

const PLATFORM_COLORS: Record<Platform, ChalkInstance> = {
  x: chalk.white,
  linkedin: chalk.blue,
  reddit: chalk.hex('#FF4500'),
  hackernews: chalk.hex('#FF6600'),
};

const PLATFORM_SHORT: Record<Platform, string> = {
  x: 'X',
  linkedin: 'LI',
  reddit: 'RD',
  hackernews: 'HN',
};

export function platformBadge(p: Platform): string {
  return PLATFORM_COLORS[p].bold(`[${PLATFORM_SHORT[p]}]`);
}
