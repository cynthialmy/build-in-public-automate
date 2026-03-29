import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { BipConfig } from './types.js';

const BIP_DIR = process.env.BIP_TEST_DIR || '.buildpublic';
const CONFIG_FILE = 'config.json';

function bipDir(): string {
  return join(process.cwd(), BIP_DIR);
}

function configPath(): string {
  return join(bipDir(), CONFIG_FILE);
}

export function postsDir(): string {
  return join(bipDir(), 'posts');
}

export function capturesDir(): string {
  return join(bipDir(), 'captures');
}

export function skillsDir(): string {
  return join(bipDir(), 'skills');
}

export function skillPath(platform: string): string {
  return join(skillsDir(), `${platform}.md`);
}

export function soulPath(): string {
  return join(bipDir(), 'soul.md');
}

export function memoryDir(): string {
  return join(bipDir(), 'memory');
}

export function buildPublicMdPath(): string {
  return join(process.cwd(), 'BUILD_IN_PUBLIC.md');
}

export function isInitialized(): boolean {
  return existsSync(configPath());
}

export function ensureDirectories(): void {
  mkdirSync(postsDir(), { recursive: true });
  mkdirSync(capturesDir(), { recursive: true });
  mkdirSync(skillsDir(), { recursive: true });
  mkdirSync(memoryDir(), { recursive: true });
}

export function readConfig(): BipConfig {
  if (!isInitialized()) {
    throw new Error(
      'bip is not initialized in this project. Run `bip init` first.'
    );
  }
  const raw = readFileSync(configPath(), 'utf-8');
  return JSON.parse(raw) as BipConfig;
}

export function writeConfig(config: BipConfig): void {
  mkdirSync(bipDir(), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf-8');
}

export function updateConfig(partial: Partial<BipConfig>): void {
  const existing = readConfig();
  writeConfig({ ...existing, ...partial });
}
