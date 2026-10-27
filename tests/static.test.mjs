// Revisión estática: patrones peligrosos en el frontend, compatibilidad con CSP y protección de carpetas privadas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const js = read('public/assets/js/app.js');
const html = read('public/index.html');

test('app.js no usa sumideros de XSS ni evaluación dinámica', () => {
  for (const pattern of [/\.innerHTML\s*=/, /\.outerHTML\s*=/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new Function\s*\(/, /setTimeout\(\s*['"]/, /setInterval\(\s*['"]/]) {
    assert.ok(!pattern.test(js), `patrón no permitido: ${pattern}`);
  }
});

test('app.js no llama a servicios externos directamente (la API key nunca llega al navegador)', () => {
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(js), 'no debe haber URLs absolutas a terceros');
  assert.ok(!/xi-api-key/i.test(js.replace(/placeholder = .*xi-api-key.*/g, '')), 'no debe enviar la cabecera xi-api-key');
});

test('index.html es compatible con una CSP sin unsafe-inline', () => {
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'sin scripts en línea');
  assert.ok(!/\sstyle\s*=/i.test(html), 'sin atributos style');
  assert.ok(!/<style/i.test(html), 'sin bloques <style>');
  assert.ok(!/\son[a-z]+\s*=/i.test(html), 'sin manejadores de eventos en línea');
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  assert.ok(!/unsafe-inline|unsafe-eval/.test(html));
});

test('no se cargan recursos de terceros (fuentes autoalojadas)', () => {
  assert.ok(!/(src|href)="https?:\/\//i.test(html));
  assert.ok(!/fonts\.googleapis|fonts\.gstatic|cdn\./i.test(read('public/assets/css/app.css')));
});

test('las carpetas privadas bloquean el acceso web en Apache e IIS', () => {
  for (const dir of ['storage', 'config', 'src', 'bin']) {
    assert.match(read(`${dir}/.htaccess`), /Require all denied/, dir);
    assert.match(read(`${dir}/web.config`), /allowUnlisted="false"/, dir);
  }
  assert.match(read('public/.htaccess'), /Options -Indexes/);
  assert.match(read('public/.htaccess'), /Content-Security-Policy/);
});

test('la configuración con secretos no se versiona', () => {
  const ignore = read('.gitignore');
  assert.match(ignore, /^\/config\/config\.php$/m);
  assert.match(ignore, /^\/storage\/\*$/m);
  assert.ok(!existsSync(join(ROOT, 'public/config.php')));
});

test('el backend usa comparaciones en tiempo constante y hash de contraseñas', () => {
  const php = read('public/api.php') + read('src/bootstrap.php');
  assert.match(php, /password_hash\(/);
  assert.match(php, /password_verify\(/);
  assert.ok((php.match(/hash_equals\(/g) || []).length >= 3);
  assert.ok(!/\bmd5\(|\bsha1\(|\bunserialize\(|\bextract\(|\beval\(|shell_exec|passthru|\bsystem\(/.test(php));
  assert.match(php, /CURLPROTO_HTTPS/);
});
