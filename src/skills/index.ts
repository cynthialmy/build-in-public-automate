import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { skillPath } from '../config/settings.js';
import type { Platform } from '../config/types.js';

// Same depth ambiguity as commands/init.ts's TEMPLATE_DIR: bundled dist/index.js
// vs. unbundled src/skills/index.ts under `tsx` sit at different depths from
// the repo's templates/ dir, and `.pathname` also mishandles Windows/space paths.
function resolveTemplateSkillsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, '../templates/skills'), join(here, '../../templates/skills')];
  return candidates.find((c) => existsSync(c)) ?? candidates[0]!;
}

const TEMPLATE_SKILLS_DIR = resolveTemplateSkillsDir();

export function loadSkill(platform: Platform): string | null {
  // Try user's .buildpublic/skills/ first
  const userPath = skillPath(platform);
  if (existsSync(userPath)) {
    return readFileSync(userPath, 'utf-8');
  }

  // Fall back to bundled templates
  const templatePath = join(TEMPLATE_SKILLS_DIR, `${platform}.md`);
  if (existsSync(templatePath)) {
    return readFileSync(templatePath, 'utf-8');
  }

  return null;
}

export function loadSkillsForPlatforms(platforms: Platform[]): string {
  const sections: string[] = [];

  for (const platform of platforms) {
    const content = loadSkill(platform);
    if (content) {
      sections.push(content.trim());
    }
  }

  if (sections.length === 0) return '';

  return `\n\nPlatform-specific skills and strategies:\n\n${sections.join('\n\n---\n\n')}`;
}
