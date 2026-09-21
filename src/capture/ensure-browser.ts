import { spawn } from 'child_process';
import ora from 'ora';

let checkedThisRun = false;

async function isInstalled(): Promise<boolean> {
  try {
    const { chromium } = await import('playwright');
    return !!chromium.executablePath();
  } catch {
    return false;
  }
}

/**
 * Playwright's browser binary isn't bundled by `npm install` — it needs its
 * own `npx playwright install chromium` step, which used to just fail with
 * a manual-fix error on every screenshot/recording attempt until someone
 * ran that command by hand. This installs it transparently, once, the
 * first time it's actually needed.
 */
export async function ensureChromiumInstalled(): Promise<void> {
  if (checkedThisRun || (await isInstalled())) {
    checkedThisRun = true;
    return;
  }

  const spinner = ora('Installing browser for screenshots/recording (one-time, ~300MB)...').start();
  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('npx', ['playwright', 'install', 'chromium'], { stdio: 'ignore' });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`npx playwright install exited with code ${code}`));
      });
      proc.on('error', reject);
    });
    spinner.succeed('Browser installed.');
  } catch (err) {
    // Don't block the caller here — let the subsequent chromium.launch()
    // fail with its own descriptive error if the install genuinely failed.
    spinner.fail(
      `Automatic browser install failed (${err instanceof Error ? err.message : String(err)}). ` +
        'Falling back to the manual path.'
    );
  }
  checkedThisRun = true;
}
