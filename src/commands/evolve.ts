import { existsSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { simpleGit } from 'simple-git';
import { select, editor } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { colors, divider } from '../core/branding.js';
import { isInitialized, buildPublicMdPath } from '../config/settings.js';
import { getPostingHistory } from '../memory/index.js';
import {
  PROVIDER_ENV_KEYS,
  PROVIDER_NAMES,
  listAvailableProviders,
} from '../ai/providers.js';
import { resolveAiProviderForSession } from '../ai/provider-choice.js';
import { evolveProjectDoc } from '../ai/evolver.js';

export async function evolveCommand(options: { provider?: string } = {}): Promise<void> {
  if (!isInitialized()) {
    console.error('bip is not initialized. Run `bip init` first.');
    process.exit(1);
  }

  if (listAvailableProviders().length === 0) {
    const keys = Object.values(PROVIDER_ENV_KEYS).join(', ');
    console.error(`API key not set. Set one of: ${keys}`);
    process.exit(1);
  }

  const aiProvider = await resolveAiProviderForSession({
    cliProvider: options.provider,
  });
  if (!aiProvider) {
    const keys = Object.values(PROVIDER_ENV_KEYS).join(', ');
    console.error(`API key not set. Set one of: ${keys}`);
    process.exit(1);
  }

  console.log(`Using AI provider: ${PROVIDER_NAMES[aiProvider]}`);

  const mdPath = buildPublicMdPath();
  if (!existsSync(mdPath)) {
    console.error('No BUILD_IN_PUBLIC.md found. Run `bip init` to create one.');
    process.exit(1);
  }

  const staleMessage = checkStaleness(mdPath);
  if (staleMessage) {
    console.log(colors.warn(`  ${staleMessage}`));
    const continueAnyway = await select({
      message: 'Continue anyway?',
      choices: [
        { name: 'Yes, evolve anyway', value: 'continue' },
        { name: 'No, refresh first', value: 'refresh' },
      ],
    });

    if (continueAnyway === 'refresh') {
      console.log(colors.dim('Run `bip init` to create a fresh BUILD_IN_PUBLIC.md.'));
      return;
    }
  }

  let gitLog: string;
  try {
    const log = await simpleGit(process.cwd()).log({ maxCount: 50 });
    gitLog = log.all
      .map((c) => `${c.hash.slice(0, 7)} ${c.date.slice(0, 10)} ${c.message}`)
      .join('\n');
  } catch {
    gitLog = '(could not read git log)';
  }

  const pkgPath = join(process.cwd(), 'package.json');
  const packageJson = existsSync(pkgPath)
    ? readFileSync(pkgPath, 'utf-8')
    : null;

  const history = getPostingHistory();

  const currentDoc = readFileSync(mdPath, 'utf-8');

  const spinner = ora('Analyzing project evolution...').start();
  let proposed: string;
  try {
    proposed = await evolveProjectDoc(
      currentDoc,
      gitLog,
      packageJson,
      history,
      { provider: aiProvider }
    );
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

  // Update evolved date
  finalContent = finalContent.replace(
    /<!-- Last evolved: .* -->/,
    `<!-- Last evolved: ${new Date().toISOString().slice(0, 10)} -->`
  );

  writeFileSync(mdPath, finalContent, 'utf-8');
  console.log(chalk.green('BUILD_IN_PUBLIC.md evolved!'));
}

/**
 * Check if BUILD_IN_PUBLIC.md is stale (not updated in 30+ days).
 * Returns a nudge message or null.
 */
export function checkStaleness(mdPath: string): string | null {
  const { mtimeMs } = statSync(mdPath);
  const daysSince = Math.floor((Date.now() - mtimeMs) / (1000 * 60 * 60 * 24));

  // Check for "Last evolved" metadata
  const content = readFileSync(mdPath, 'utf-8');
  const evolvedMatch = content.match(/<!-- Last evolved: (\d{4}-\d{2}-\d{2}) -->/);

  if (evolvedMatch) {
    const lastEvolved = new Date(evolvedMatch[1]);
    const lastEvolvedDays = Math.floor((Date.now() - lastEvolved.getTime()) / (1000 * 60 * 60 * 24));
    if (lastEvolvedDays > 30) {
      return `Your BUILD_IN_PUBLIC.md hasn't been updated in ${lastEvolvedDays} days. Run ${chalk.cyan('bip evolve')} to refresh.`;
    }
  }

  return null;
}
