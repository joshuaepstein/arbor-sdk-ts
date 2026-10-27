/**
 * Shared setup for the example scripts (PHP: example-bootstrap.php + config.php).
 *
 * Reads connection settings from the environment, creates the API gateway and
 * makes it the default gateway, so `Student.retrieve()`, `model.save()` etc.
 * work without passing `api` around (no `connect($api)` calls needed).
 */
import { inspect } from 'node:util';
import { existsSync } from 'node:fs';
import { createClient } from '../src/index.js';

// Load .env from the project root if present. Variables already set in the shell win.
const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Fill in .env (copy .env.example) or set it in the shell.`,
    );
  }
  return value;
}

// PHP: date_default_timezone_set('Europe/London'). Dates are sent to the API in local time.
process.env.TZ ??= 'Europe/London';

export const api = createClient({
  baseUrl: requireEnv('ARBOR_BASE_URL'),
  user: requireEnv('ARBOR_USER'),
  password: requireEnv('ARBOR_PASSWORD'),
  applicationId: process.env.ARBOR_APPLICATION_ID || null,
  // ARBOR_DEBUG=1 logs every request (method, URL without query string, status).
  fetch: process.env.ARBOR_DEBUG
    ? async (url, init) => {
        const res = await fetch(url, init);
        console.log(`    ${init.method} ${url.replace(/\?.*/, '?…')} → ${res.status}`);
        return res;
      }
    : undefined,
});

/** Pretty-prints a value (PHP: `print_r()`); models print as their API representation. */
export function dump(value: unknown): void {
  const plain = JSON.parse(JSON.stringify(value ?? null));
  console.log(inspect(plain, { depth: null, colors: process.stdout.isTTY }));
}
