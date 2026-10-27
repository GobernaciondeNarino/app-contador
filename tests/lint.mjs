// Verificación de sintaxis de JS y PHP (equivalente local a "node --check" y "php -l").
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

let failed = 0;
for (const file of walk(join(root, 'public/assets/js')).filter((f) => f.endsWith('.js'))) {
  try { execFileSync('node', ['--check', file], { stdio: 'pipe' }); console.log('ok  ', file.replace(root + '/', '')); }
  catch (e) { failed++; console.error('FAIL', file, String(e.stderr)); }
}
for (const dir of ['public', 'src', 'bin', 'config']) {
  for (const file of walk(join(root, dir)).filter((f) => f.endsWith('.php'))) {
    try { execFileSync('php', ['-l', file], { stdio: 'pipe' }); console.log('ok  ', file.replace(root + '/', '')); }
    catch (e) { failed++; console.error('FAIL', file, String(e.stdout)); }
  }
}
process.exit(failed ? 1 : 0);
