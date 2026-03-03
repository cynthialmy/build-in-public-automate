import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { skillPath } from '../config/settings.js';
import type { Platform } from '../config/types.js';

const TEMPLATE_SKILLS_DIR = new URL('../templates/skills/', import.meta.url).pathname;

function loadSkill(platform: Platform): string | null {
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
