import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isInitialized,
  ensureDirectories,
  readConfig,
  writeConfig,
  updateConfig,
  postsDir,
  capturesDir,
  skillsDir,
  memoryDir,
  soulPath,
  buildPublicMdPath,
} from '../../src/config/settings.js';
import { mkdirSync, rmdirSync, existsSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(process.cwd(), '.buildpublic-test');

describe('Config Settings', () => {
  beforeEach(() => {
    // Clean up and create test directory
    if (existsSync(TEST_DIR)) {
      rmdirSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up after tests
    if (existsSync(TEST_DIR)) {
      rmdirSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('isInitialized', () => {
    it('should return false when config file does not exist', () => {
      expect(isInitialized()).toBe(false);
    });

    it('should return true when config file exists', () => {
      mkdirSync(TEST_DIR, { recursive: true });
      const { writeFileSync } = require('fs');
      writeFileSync(join(TEST_DIR, 'config.json'), '{}');
      expect(isInitialized()).toBe(true);
    });
  });

  describe('ensureDirectories', () => {
    it('should create all required directories', () => {
      expect(() => ensureDirectories()).not.toThrow();

      const { existsSync } = require('fs');
      expect(existsSync(postsDir())).toBe(true);
      expect(existsSync(capturesDir())).toBe(true);
      expect(existsSync(skillsDir())).toBe(true);
      expect(existsSync(memoryDir())).toBe(true);
    });

    it('should not throw if directories already exist', () => {
      ensureDirectories();
      expect(() => ensureDirectories()).not.toThrow();
    });
  });

  describe('readConfig', () => {
    it('should throw error when not initialized', () => {
      expect(() => readConfig()).toThrow('bip is not initialized in this project');
    });

    it('should read and parse config file', () => {
      mkdirSync(TEST_DIR, { recursive: true });
      const { writeFileSync } = require('fs');
      const config = { projectName: 'test', platforms: {} };
      writeFileSync(join(TEST_DIR, 'config.json'), JSON.stringify(config));

      const result = readConfig();
      expect(result).toEqual(config);
    });

    it('should handle valid JSON', () => {
      mkdirSync(TEST_DIR, { recursive: true });
      const { writeFileSync } = require('fs');
      const config = { projectName: 'test', platforms: {} };
      writeFileSync(join(TEST_DIR, 'config.json'), JSON.stringify(config, null, 2));

      const result = readConfig();
      expect(result.projectName).toBe('test');
    });
  });

  describe('writeConfig', () => {
    it('should write config to file', () => {
      const config = { projectName: 'test', platforms: {} };
      writeConfig(config);

      const { existsSync, readFileSync } = require('fs');
      expect(existsSync(join(TEST_DIR, 'config.json'))).toBe(true);

      const content = readFileSync(join(TEST_DIR, 'config.json'), 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed).toEqual(config);
    });

    it('should create bip directory if it does not exist', () => {
      const config = { projectName: 'test', platforms: {} };
      writeConfig(config);

      expect(existsSync(TEST_DIR)).toBe(true);
    });

    it('should format JSON with proper indentation', () => {
      const config = { projectName: 'test', platforms: {} };
      writeConfig(config);

      const { readFileSync } = require('fs');
      const content = readFileSync(join(TEST_DIR, 'config.json'), 'utf-8');
      expect(content).toContain('{\n  ');
    });
  });

  describe('updateConfig', () => {
    it('should update existing config', () => {
      mkdirSync(TEST_DIR, { recursive: true });
      const { writeFileSync } = require('fs');
      const initialConfig = { projectName: 'test', platforms: {} };
      writeFileSync(join(TEST_DIR, 'config.json'), JSON.stringify(initialConfig));

      updateConfig({ projectName: 'updated' });

      const result = readConfig();
      expect(result.projectName).toBe('updated');
    });

    it('should merge partial updates', () => {
      mkdirSync(TEST_DIR, { recursive: true });
      const { writeFileSync } = require('fs');
      const initialConfig = { projectName: 'test', platforms: {} };
      writeFileSync(join(TEST_DIR, 'config.json'), JSON.stringify(initialConfig));

      updateConfig({ platforms: { x: { enabled: true } } });

      const result = readConfig();
      expect(result.projectName).toBe('test');
      expect(result.platforms.x).toEqual({ enabled: true });
    });
  });

  describe('Path helper functions', () => {
    it('should return correct paths', () => {
      expect(postsDir()).toContain('.buildpublic/posts');
      expect(capturesDir()).toContain('.buildpublic/captures');
      expect(skillsDir()).toContain('.buildpublic/skills');
      expect(memoryDir()).toContain('.buildpublic/memory');
      expect(soulPath()).toContain('.buildpublic/soul.md');
      expect(buildPublicMdPath()).toContain('BUILD_IN_PUBLIC.md');
    });
  });
});
