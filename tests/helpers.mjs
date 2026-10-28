// Utilidades de prueba: servidor PHP embebido con almacenamiento temporal y cliente HTTP con cookies.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SETUP_TOKEN = 'token-de-pruebas-0123456789abcdef';
export const ADMIN_PASSWORD = 'Contraseña-Segura-2026';

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

/** opts.router: script de router para `php -S` (p. ej. para imitar la reescritura de Apache en un subdirectorio). */
export async function startServer(extraConfig = {}, opts = {}) {
  const base = mkdtempSync(join(tmpdir(), 'contador-test-'));
  const storage = join(base, 'storage');
  const configFile = join(base, 'config.php');
  const cfg = { storage_dir: storage, setup_token: SETUP_TOKEN, ...extraConfig };
  writeFileSync(configFile, '<?php return ' + toPhp(cfg) + ';\n');
  const port = await freePort();
  const args = ['-S', `127.0.0.1:${port}`, '-t', join(ROOT, 'public')];
  if (opts.router) args.push(opts.router);
  const proc = spawn('php', args, {
    env: { ...process.env, CONTADOR_CONFIG: configFile },
    stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try { await fetch(url + '/api.php?action=session'); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  return {
    url, storage,
    async stop() { proc.kill(); rmSync(base, { recursive: true, force: true }); },
  };
}

function toPhp(v) {
  if (typeof v === 'string') return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  return '[' + Object.entries(v).map(([k, x]) => toPhp(k) + ' => ' + toPhp(x)).join(', ') + ']';
}

/** Cliente HTTP mínimo que conserva cookies y el token CSRF. */
export class Client {
  constructor(base) { this.base = base; this.cookies = {}; this.csrf = null; this.lastSetCookie = []; }

  async req(action, { method = 'GET', json, body, headers = {}, query = '' } = {}) {
    const h = { ...headers };
    const cookie = Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    if (cookie) h.Cookie = cookie;
    if (json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (method === 'POST' && this.csrf && !('X-CSRF-Token' in h)) h['X-CSRF-Token'] = this.csrf;
    const res = await fetch(`${this.base}/api.php?action=${action}${query}`, { method, headers: h, body, redirect: 'manual' });
    this.lastSetCookie = res.headers.getSetCookie();
    for (const c of this.lastSetCookie) {
      const [pair] = c.split(';');
      const [k, ...rest] = pair.split('=');
      const v = rest.join('=');
      if (v === '' || /expires=Thu, 01 Jan 1970/i.test(c) || /Max-Age=0/i.test(c)) delete this.cookies[k.trim()];
      else this.cookies[k.trim()] = v;
    }
    const type = res.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await res.json() : await res.arrayBuffer();
    if (data && data.csrf) this.csrf = data.csrf;
    return { status: res.status, headers: res.headers, data };
  }

  setup(password = ADMIN_PASSWORD, token = SETUP_TOKEN) {
    return this.req('setup', { method: 'POST', json: { token, password } });
  }
  login(password = ADMIN_PASSWORD) {
    return this.req('login', { method: 'POST', json: { password } });
  }
}

export function validState(overrides = {}) {
  return {
    cfg: {
      title: 'Foro Departamental TIC', subtitle: 'Pasto · 2026', footer: 'Gobernación de Nariño',
      logo: '', bgImage: '', bgFit: 'cover', bgOpacity: 100, fxTarget: 'text',
      minutes: 5, yellowAt: 120, redAt: 60, sound: true, voice: true, outline: true,
      elVoice: '', elModel: 'eleven_multilingual_v2', endPhrase: 'Su turno ha terminado', startPhrase: 'Inicia la ponencia de',
      colors: {}, ...(overrides.cfg || {}),
    },
    turns: overrides.turns || [{ name: 'Ana Pérez', profession: 'Ingeniera', minutes: 5 }],
    ...(overrides.rev !== undefined ? { rev: overrides.rev } : {}),
    ...(overrides.secrets ? { secrets: overrides.secrets } : {}),
  };
}

// PNG válido de 1×1 px.
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
