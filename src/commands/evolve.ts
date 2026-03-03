import { existsSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { select, editor } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { simpleGit } from 'simple-git';
import { colors, divider } from '../core/branding.js';
import { isInitialized, buildPublicMdPath } from '../config/settings.js';
import { evolveProjectDoc } from '../ai/evolver.js';
import { getPostingHistory } from '../memory/index.js';

export async function evolveCommand(): Promise<void> {
  if (!isInitialized()) {
    console.error('bip is not initialized. Run `bip init` first.');
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY environment variable is not set.');
    process.exit(1);
  }

  const mdPath = buildPublicMdPath();
  if (!existsSync(mdPath)) {
    console.error('No BUILD_IN_PUBLIC.md found. Run `bip init` to create one.');
    process.exit(1);
  }

  const currentDoc = readFileSync(mdPath, 'utf-8');

  // Get recent git log
  const git = simpleGit(process.cwd());
  let gitLog: string;
  try {
    const log = await git.log({ maxCount: 50 });
    gitLog = log.all
      .map((c) => `${c.hash.slice(0, 7)} ${c.date.slice(0, 10)} ${c.message}`)
      .join('\n');
  } catch {
    gitLog = '(could not read git log)';
  }

  // Read package.json if available
  const pkgPath = join(process.cwd(), 'package.json');
  const packageJson = existsSync(pkgPath)
    ? readFileSync(pkgPath, 'utf-8')
    : null;

  const history = getPostingHistory();

  const spinner = ora('Analyzing project evolution...').start();
  let proposed: string;
  try {
    proposed = await evolveProjectDoc(currentDoc, gitLog, packageJson, history);
    spinner.succeed('Evolution suggestions ready!');
  } catch (err) {
    spinner.fail('Failed to generate suggestions');
    throw err;
  }

  divider('proposed BUILD_IN_PUBLIC.md');
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
      message: 'Edit the proposed BUILD_IN_PUBLIC.md (save and close to continue):',
      default: proposed,
    });
  }

  writeFileSync(mdPath, finalContent, 'utf-8');
  console.log(chalk.green('BUILD_IN_PUBLIC.md evolved!'));
}

/**
 * Check if BUILD_IN_PUBLIC.md is stale (not updated in 30+ days).
 * Returns a nudge message or null.
 */
export function checkStaleness(): string | null {
  const mdPath = buildPublicMdPath();
  if (!existsSync(mdPath)) return null;

  const content = readFileSync(mdPath, 'utf-8');

  // Check for "Last evolved" metadata
  const evolvedMatch = content.match(/<!-- Last evolved: (\d{4}-\d{2}-\d{2}) -->/);
  if (evolvedMatch) {
    const lastEvolved = new Date(evolvedMatch[1]);
    const daysSince = Math.floor((Date.now() - lastEvolved.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince > 30) {
      return `Your BUILD_IN_PUBLIC.md hasn't been updated in ${daysSince} days. Run ${chalk.cyan('bip evolve')} to refresh.`;
    }
    return null;
  }

  // No evolved date — check file mtime
  const { mtimeMs } = statSync(mdPath);
  const daysSince = Math.floor((Date.now() - mtimeMs) / (1000 * 60 * 60 * 24));
  if (daysSince > 30) {
    return `Your BUILD_IN_PUBLIC.md hasn't been updated in ${daysSince} days. Run ${chalk.cyan('bip evolve')} to refresh.`;
  }

  return null;
}
