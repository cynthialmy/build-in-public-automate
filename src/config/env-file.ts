import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Upsert a single KEY=value in the project `.env` file (preserves comments and other keys).
 */
export function upsertEnvKey(cwd: string, key: string, value: string): void {
  const envPath = join(cwd, '.env');
  let lines: string[] = [];
  if (existsSync(envPath)) {
    lines = readFileSync(envPath, 'utf-8').split(/\r?\n/);
  }

  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const needsQuote = /[\s#"'=]/.test(value) || value === '';
  const newLine = needsQuote ? `${key}="${escaped}"` : `${key}=${value}`;

  const out: string[] = [];
  let replaced = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) {
      out.push(line);
      continue;
    }
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m?.[1] === key) {
      if (!replaced) {
        out.push(newLine);
        replaced = true;
      }
      continue;
    }
    out.push(line);
  }
  if (!replaced) {
    out.push(newLine);
  }

  const body = out.join('\n');
  writeFileSync(envPath, (body.endsWith('\n') ? body : `${body}\n`), 'utf-8');
}
