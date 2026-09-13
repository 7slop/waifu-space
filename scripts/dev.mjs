/**
 * Dev-server launcher.
 *
 * `bun run dev --edit` (or `bun run dev:edit`) starts the app with the map
 * editor enabled: the flag is translated into a WAIFU_EDITOR environment
 * variable that the server workers (and the /api/strike/edit-mode route)
 * read. Editing is therefore gated behind the launch flag — no user roles
 * are involved yet.
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const isEdit = args.includes('--edit') || args.includes('--editor');
if (isEdit) {
  process.env.WAIFU_EDITOR = '1';
}

const filteredArgs = args.filter((a) => a !== '--edit' && a !== '--editor');

// Resolve the local vinxi binary (exe on Windows, shell script elsewhere).
const cwd = process.cwd();
const candidates = [
  resolve(cwd, 'node_modules/.bin/vinxi.exe'),
  resolve(cwd, 'node_modules/.bin/vinxi'),
  'vinxi'
];
let bin = candidates.find((c) => c.startsWith(resolve(cwd)) ? existsSync(c) : true);
if (!bin) bin = 'vinxi';

const child = spawn(bin, ['dev', ...filteredArgs], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32'
});

child.on('error', (err) => {
  console.error('[dev.mjs] failed to start vinxi:', err.message);
  process.exit(1);
});
child.on('exit', (code) => {
  process.exit(code ?? 0);
});