import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { join } from 'path';

/**
 * Copies the bundled Claude Code skill into the target project's
 * `.claude/skills/build-in-public/SKILL.md`, so `bip init` makes bip usable
 * as a Claude Code skill without any extra setup step. Returns true if the
 * file was (re)written, false if it already existed and `force` is false,
 * or the bundled template is missing.
 */
export function scaffoldClaudeSkill(cwd: string, templateDir: string, force: boolean): boolean {
  const src = join(templateDir, 'claude-skill', 'SKILL.md');
  if (!existsSync(src)) return false;

  const dest = join(cwd, '.claude', 'skills', 'build-in-public', 'SKILL.md');
  if (existsSync(dest) && !force) return false;

  mkdirSync(join(cwd, '.claude', 'skills', 'build-in-public'), { recursive: true });
  copyFileSync(src, dest);
  return true;
}
