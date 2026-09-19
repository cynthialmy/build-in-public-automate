import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'fs';
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

/** Diagnostic dumps (e.g. unparseable AI responses) — gitignored, not user-facing config. */
export function debugDir(): string {
  return join(bipDir(), 'debug');
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
  mkdirSync(debugDir(), { recursive: true });
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
  const path = configPath();
  writeFileSync(path, JSON.stringify(config, null, 2), 'utf-8');
  // config.json holds plaintext social platform credentials (X app secret,
  // Reddit password, LinkedIn token, HN password) — restrict to owner-only.
  try {
    chmodSync(path, 0o600);
  } catch {
    // best-effort — unsupported on some filesystems (e.g. Windows/FAT)
  }
}

export function updateConfig(partial: Partial<BipConfig>): void {
  const existing = readConfig();
  writeConfig({ ...existing, ...partial });
}
