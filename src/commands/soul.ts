import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { input, select, editor, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { colors, divider } from '../core/branding.js';
import { isInitialized, soulPath } from '../config/settings.js';
import { getEditDiffs, getPostingHistory } from '../memory/index.js';
import { evolveSoul } from '../ai/evolver.js';

export async function soulCommand(): Promise<void> {
  if (!isInitialized()) {
    console.error('bip is not initialized. Run `bip init` first.');
    process.exit(1);
  }

  const path = soulPath();
  const exists = existsSync(path);

  if (exists) {
    const action = await select({
      message: 'soul.md already exists. What would you like to do?',
      choices: [
        { name: 'Re-do the questionnaire (overwrites)', value: 'redo' },
        { name: 'Edit in your editor', value: 'edit' },
        { name: 'Cancel', value: 'cancel' },
      ],
    });

    if (action === 'cancel') return;
    if (action === 'edit') {
      const current = readFileSync(path, 'utf-8');
      const edited = await editor({
        message: 'Edit your soul.md (save and close to continue):',
        default: current,
      });
      writeFileSync(path, edited, 'utf-8');
      console.log(chalk.green('soul.md updated!'));
      return;
    }
  }

  // Questionnaire
  divider('voice questionnaire');
  console.log(colors.dim('  This defines your posting voice. You can always edit soul.md later.\n'));

  const tone = await input({
    message: 'How would you describe your posting tone?',
    default: 'casual and direct',
  });

  const perspective = await select({
    message: 'What perspective do you use?',
    choices: [
      { name: 'I/me (first person singular)', value: 'I/me — first person singular' },
      { name: 'we/us (first person plural)', value: 'we/us — first person plural' },
      { name: 'Third person', value: 'third person' },
    ],
  });

  const avoid = await input({
    message: 'Words or phrases to avoid? (comma-separated, or leave blank)',
    default: '',
  });

  const themes = await input({
    message: 'Recurring themes in your posts? (comma-separated, or leave blank)',
    default: '',
  });

  const wantExample = await confirm({
    message: 'Want to paste an example post you like?',
    default: false,
  });

  let examplePost = '';
  if (wantExample) {
    examplePost = await editor({
      message: 'Paste an example post (save and close to continue):',
      default: '',
    });
  }

  // Build soul.md content
  const avoidList = avoid
    ? avoid.split(',').map((s) => `- ${s.trim()}`).join('\n')
    : '<!-- nothing specified yet -->';

  const themesList = themes
    ? themes.split(',').map((s) => `- ${s.trim()}`).join('\n')
    : '<!-- nothing specified yet -->';

  const content = `<!-- This file evolves as you use bip. Edit anytime, or let bip suggest updates based on your posting patterns. -->
<!-- Last evolved: ${new Date().toISOString().slice(0, 10)} -->

# Voice & Personality

## Tone
${tone}

## Perspective
${perspective}

## Recurring Themes
${themesList}

## Avoid
${avoidList}

## Example Post
${examplePost.trim() || '<!-- paste an example post here -->'}
`;

  writeFileSync(path, content, 'utf-8');
  console.log(`\n${chalk.green('soul.md created!')} ${colors.dim(path)}`);
  console.log(colors.dim('Edit anytime, or run `bip soul evolve` after a few drafts to refine.'));
}

export async function soulEvolveCommand(): Promise<void> {
  if (!isInitialized()) {
    console.error('bip is not initialized. Run `bip init` first.');
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY environment variable is not set.');
    process.exit(1);
  }

  const path = soulPath();
  if (!existsSync(path)) {
    console.error('No soul.md found. Run `bip soul` first to create one.');
    process.exit(1);
  }

  const editDiffs = getEditDiffs();
  const history = getPostingHistory();

  if (editDiffs.length === 0 && history.length < 3) {
    console.log('Not enough posting history to suggest soul evolution.');
    console.log(colors.dim('Generate a few more drafts with `bip draft` and edit some posts.'));
    return;
  }

  const currentSoul = readFileSync(path, 'utf-8');

  const spinner = ora('Analyzing your posting patterns...').start();
  let proposed: string;
  try {
    proposed = await evolveSoul(currentSoul, editDiffs, history);
    spinner.succeed('Evolution suggestions ready!');
  } catch (err) {
    spinner.fail('Failed to generate suggestions');
    throw err;
  }

  // Show diff
  divider('proposed soul.md changes');
  console.log();
  console.log(proposed);
  console.log();

  const action = await select({
    message: 'What would you like to do?',
    choices: [
      { name: 'Accept as-is', value: 'accept' },
      { name: 'Edit before saving', value: 'edit' },
      { name: 'Discard', value: 'discard' },
    ],
  });

  if (action === 'discard') {
    console.log('Changes discarded.');
    return;
  }

  let finalContent = proposed;
  if (action === 'edit') {
    finalContent = await editor({
      message: 'Edit the proposed soul.md (save and close to continue):',
      default: proposed,
    });
  }

  // Update the evolved date
  finalContent = finalContent.replace(
    /<!-- Last evolved: .* -->/,
    `<!-- Last evolved: ${new Date().toISOString().slice(0, 10)} -->`
  );

  writeFileSync(path, finalContent, 'utf-8');
  console.log(chalk.green('soul.md evolved!'));
}
