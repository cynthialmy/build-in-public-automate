import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, copyFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { input, checkbox } from '@inquirer/prompts';
import { readConfig, writeConfig, ensureDirectories, isInitialized, skillsDir, soulPath } from '../config/settings.js';
import type { BipConfig, Platform } from '../config/types.js';

const TEMPLATE_DIR = new URL('../templates/', import.meta.url).pathname;

function getTemplate(name: string): string {
  const path = join(TEMPLATE_DIR, name);
  if (!existsSync(path)) {
    throw new Error(`Template not found: ${path}`);
  }
  return readFileSync(path, 'utf-8');
}

export async function initCommand(options: { force?: boolean }): Promise<void> {
  const cwd = process.cwd();

  // Read existing config before potentially overwriting it
  let existingConfig: BipConfig | undefined;
  if (isInitialized()) {
    if (!options.force) {
      console.error(
        'bip is already initialized in this project. Use --force to reinitialize.'
      );
      process.exit(1);
    }
    try {
      existingConfig = readConfig();
    } catch {
      // ignore if unreadable
    }
  }

  const projectName = await input({
    message: 'Project name:',
    default: cwd.split('/').pop() ?? 'my-project',
  });

  const selectedPlatforms = await checkbox<Platform>({
    message: 'Which platforms will you post to?',
    choices: [
      { name: 'X (Twitter)', value: 'x', checked: true },
      { name: 'LinkedIn', value: 'linkedin', checked: false },
      { name: 'Reddit', value: 'reddit', checked: true },
      { name: 'HackerNews', value: 'hackernews', checked: false },
    ],
  });

  // Create .buildpublic/ structure
  ensureDirectories();

  // Build platforms config — enable selected ones, preserving existing credentials
  const platformsConfig: BipConfig['platforms'] = {};
  for (const p of selectedPlatforms) {
    platformsConfig[p] = {
      enabled: true,
      // preserve any previously saved credentials
      ...(existingConfig?.platforms[p] ?? {}),
    };
  }

  // Write config
  const config: BipConfig = {
    projectName,
    platforms: platformsConfig,
    postsDir: '.buildpublic/posts',
    capturesDir: '.buildpublic/captures',
  };
  writeConfig(config);

  // Scaffold BUILD_IN_PUBLIC.md into project root
  const mdPath = join(cwd, 'BUILD_IN_PUBLIC.md');
  if (!existsSync(mdPath) || options.force) {
    const template = getTemplate('BUILD_IN_PUBLIC.md');
    writeFileSync(
      mdPath,
      template.replace(/\{\{\s*project_name\s*\}\}/g, projectName),
      'utf-8'
    );
    console.log('  Created BUILD_IN_PUBLIC.md');
  }

  // Scaffold soul.md
  const soulDest = soulPath();
  if (!existsSync(soulDest) || options.force) {
    const soulTemplate = getTemplate('soul.md');
    writeFileSync(soulDest, soulTemplate, 'utf-8');
    console.log('  Created soul.md');
  }

  // Scaffold skills/*.md
  const skillsTemplateDir = join(TEMPLATE_DIR, 'skills');
  const destSkillsDir = skillsDir();
  if (existsSync(skillsTemplateDir)) {
    const skillFiles = readdirSync(skillsTemplateDir).filter((f) => f.endsWith('.md'));
    for (const file of skillFiles) {
      const dest = join(destSkillsDir, file);
      if (!existsSync(dest) || options.force) {
        copyFileSync(join(skillsTemplateDir, file), dest);
      }
    }
    if (skillFiles.length > 0) {
      console.log(`  Created ${skillFiles.length} skill files in .buildpublic/skills/`);
    }
  }

  // Append to .gitignore
  const gitignorePath = join(cwd, '.gitignore');
  const gitignoreEntries = [
    '',
    '# bip — build in public',
    '.buildpublic/config.json',
    '.buildpublic/captures/',
    '.buildpublic/hn-state.json',
    '.buildpublic/x-state.json',
    '.buildpublic/memory/',
  ].join('\n');

  if (existsSync(gitignorePath)) {
    const existing = readFileSync(gitignorePath, 'utf-8');
    if (!existing.includes('.buildpublic/config.json')) {
      appendFileSync(gitignorePath, gitignoreEntries, 'utf-8');
    }
  } else {
    writeFileSync(gitignorePath, gitignoreEntries.trimStart(), 'utf-8');
  }

  const enabledList = selectedPlatforms.length > 0
    ? selectedPlatforms.join(', ')
    : 'none (add with `bip auth <platform>`)';

  console.log('\nbip initialized successfully!\n');
  console.log(`  Enabled platforms: ${enabledList}`);
  console.log('\nNext steps:');
  console.log('  1. Edit BUILD_IN_PUBLIC.md with your project context');
  console.log('  2. Define your voice: bip soul');
  console.log('  3. Set up credentials: bip auth x');
  console.log('  4. Generate a draft: bip draft');
}
