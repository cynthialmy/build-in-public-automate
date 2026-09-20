import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { scaffoldClaudeSkill } from '../../src/core/claude-skill.js';

const CWD = join(process.cwd(), '.buildpublic-test', 'project');
const TEMPLATE_DIR = join(process.cwd(), '.buildpublic-test', 'templates');
const DEST = join(CWD, '.claude', 'skills', 'build-in-public', 'SKILL.md');

describe('scaffoldClaudeSkill', () => {
  beforeEach(() => {
    mkdirSync(CWD, { recursive: true });
    mkdirSync(join(TEMPLATE_DIR, 'claude-skill'), { recursive: true });
    writeFileSync(join(TEMPLATE_DIR, 'claude-skill', 'SKILL.md'), '---\nname: build-in-public\n---\ncontent', 'utf-8');
  });

  it('copies the template into .claude/skills/build-in-public/SKILL.md', () => {
    const wrote = scaffoldClaudeSkill(CWD, TEMPLATE_DIR, false);
    expect(wrote).toBe(true);
    expect(existsSync(DEST)).toBe(true);
    expect(readFileSync(DEST, 'utf-8')).toContain('name: build-in-public');
  });

  it('does not overwrite an existing skill file without force', () => {
    scaffoldClaudeSkill(CWD, TEMPLATE_DIR, false);
    writeFileSync(DEST, 'user-edited content', 'utf-8');

    const wrote = scaffoldClaudeSkill(CWD, TEMPLATE_DIR, false);
    expect(wrote).toBe(false);
    expect(readFileSync(DEST, 'utf-8')).toBe('user-edited content');
  });

  it('overwrites the existing file when force is true', () => {
    scaffoldClaudeSkill(CWD, TEMPLATE_DIR, false);
    writeFileSync(DEST, 'user-edited content', 'utf-8');

    const wrote = scaffoldClaudeSkill(CWD, TEMPLATE_DIR, true);
    expect(wrote).toBe(true);
    expect(readFileSync(DEST, 'utf-8')).toContain('name: build-in-public');
  });

  it('returns false when the bundled template is missing', () => {
    rmSync(join(TEMPLATE_DIR, 'claude-skill'), { recursive: true, force: true });
    const wrote = scaffoldClaudeSkill(CWD, TEMPLATE_DIR, false);
    expect(wrote).toBe(false);
    expect(existsSync(DEST)).toBe(false);
  });
});
