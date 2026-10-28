// Pruebas de seguridad de la API (api.php) contra un servidor PHP embebido con datos temporales.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, Client, validState, PNG_1PX, ADMIN_PASSWORD } from './helpers.mjs';

function upload(client, name, type, content) {
  const form = new FormData();
  form.append('file', new Blob([content], { type }), name);
  return client.req('upload', { method: 'POST', body: form });
}

describe('API: lectura pública y cabeceras', () => {
  let srv;
  before(async () => { srv = await startServer(); });
  after(() => srv.stop());

  test('el estado público responde sin secretos y con cabeceras de seguridad', async () => {
    const c = new Client(srv.url);
    const r = await c.req('state');
    assert.equal(r.status, 200);
    assert.equal(r.data.ok, true);
    assert.equal(r.data.state, null);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('x-powered-by'), null);
    assert.equal(c.lastSetCookie.length, 0, 'un visitante anónimo no debe recibir cookie de sesión');
  });

  test('acción desconocida → 404 y método incorrecto → 405', async () => {
    const c = new Client(srv.url);
    assert.equal((await c.req('nada')).status, 404);
    assert.equal((await c.req('save')).status, 405);
    assert.equal((await c.req('state', { method: 'POST', json: {} })).status, 405);
  });

  test('escrituras sin sesión → 401', async () => {
    const c = new Client(srv.url);
    assert.equal((await c.req('save', { method: 'POST', json: validState() })).status, 401);
    assert.equal((await upload(c, 'a.png', 'image/png', PNG_1PX)).status, 401);
    assert.equal((await c.req('tts', { method: 'POST', json: { text: 'hola' } })).status, 401);
    assert.equal((await c.req('logout', { method: 'POST' })).status, 401);
  });

  test('el ID de imagen no permite recorrer rutas', async () => {
    const c = new Client(srv.url);
    for (const id of ['../../config/config.php', '..%2F..%2Fstorage%2Fauth.json', 'auth.json', 'x.php', '']) {
      const r = await c.req('asset', { query: '&id=' + id });
      assert.equal(r.status, 404, id);
    }
  });
});

describe('API: configuración inicial, sesión y CSRF', () => {
  let srv, admin;
  before(async () => { srv = await startServer(); admin = new Client(srv.url); });
  after(() => srv.stop());

  test('setup rechaza token incorrecto y contraseña débil', async () => {
    const c = new Client(srv.url);
    assert.equal((await c.setup(ADMIN_PASSWORD, 'token-equivocado')).status, 403);
    assert.equal((await c.setup('corta')).status, 422);
    assert.equal(existsSync(join(srv.storage, 'auth.json')), false);
  });

  test('setup correcto crea hash (no texto plano) y cookie segura', async () => {
    const r = await admin.setup();
    assert.equal(r.status, 200);
    assert.equal(r.data.authenticated, true);
    assert.match(r.data.csrf, /^[a-f0-9]{64}$/);
    const cookie = admin.lastSetCookie.join('\n');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    const auth = readFileSync(join(srv.storage, 'auth.json'), 'utf8');
    assert.ok(!auth.includes(ADMIN_PASSWORD), 'la contraseña no debe guardarse en claro');
    assert.match(JSON.parse(auth).hash, /^\$(2y|argon2)/);
  });

  test('setup no se puede repetir una vez creada la contraseña', async () => {
    const r = await new Client(srv.url).setup('Otra-Contraseña-Larga-1');
    assert.equal(r.status, 409);
  });

  test('guardar sin token CSRF → 403', async () => {
    const r = await admin.req('save', { method: 'POST', json: validState(), headers: { 'X-CSRF-Token': '' } });
    assert.equal(r.status, 403);
    const r2 = await admin.req('save', { method: 'POST', json: validState(), headers: { 'X-CSRF-Token': 'a'.repeat(64) } });
    assert.equal(r2.status, 403);
  });

  test('guardar desde otro origen → 403', async () => {
    const r = await admin.req('save', { method: 'POST', json: validState(), headers: { Origin: 'https://atacante.example' } });
    assert.equal(r.status, 403);
    const r2 = await admin.req('save', { method: 'POST', json: validState(), headers: { 'Sec-Fetch-Site': 'cross-site' } });
    assert.equal(r2.status, 403);
  });

  test('guardar con Content-Type de formulario → 415 (evita CSRF por formulario simple)', async () => {
    const r = await admin.req('save', { method: 'POST', body: JSON.stringify(validState()), headers: { 'Content-Type': 'text/plain' } });
    assert.equal(r.status, 415);
  });

  test('la sesión se renueva al iniciar sesión (fijación de sesión)', async () => {
    const c = new Client(srv.url);
    c.cookies.CONTADORSID = 'sesionfijadaporatacante1234567890';
    const r = await c.login();
    assert.equal(r.status, 200);
    assert.notEqual(c.cookies.CONTADORSID, 'sesionfijadaporatacante1234567890');
  });

  test('cerrar sesión invalida la cookie', async () => {
    const c = new Client(srv.url);
    await c.login();
    const sid = c.cookies.CONTADORSID;
    const csrf = c.csrf;
    assert.equal((await c.req('logout', { method: 'POST' })).status, 200);
    const stale = new Client(srv.url);
    stale.cookies.CONTADORSID = sid; stale.csrf = csrf;
    assert.equal((await stale.req('save', { method: 'POST', json: validState() })).status, 401);
  });
});

describe('API: validación de datos guardados', () => {
  let srv, admin;
  before(async () => { srv = await startServer(); admin = new Client(srv.url); await admin.setup(); });
  after(() => srv.stop());

  test('guarda y normaliza: limpia caracteres de control, recorta y acota números', async () => {
    const s = validState({
      cfg: { title: '  Foro\u0000‮ TIC\n' + 'x'.repeat(300), minutes: 999, bgOpacity: -4, yellowAt: 30, redAt: 60, extra: 'descartar' },
      turns: [{ name: '<img src=x onerror=alert(1)>', profession: 'QA', minutes: 0, rol: 'admin' }],
    });
    const r = await admin.req('save', { method: 'POST', json: s });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const cfg = r.data.state.cfg;
    assert.ok(cfg.title.startsWith('Foro TIC'));
    assert.ok(!/[\u0000-\u001f‮]/.test(cfg.title));
    assert.equal([...cfg.title].length, 160);
    assert.equal(cfg.minutes, 180);
    assert.equal(cfg.bgOpacity, 5);
    assert.ok(cfg.yellowAt > cfg.redAt, 'el amarillo siempre empieza antes que el rojo');
    assert.equal(cfg.extra, undefined);
    assert.equal(r.data.state.turns[0].minutes, 1);
    assert.equal(r.data.state.turns[0].rol, undefined);
    // El texto se guarda tal cual (el cliente lo pinta con textContent, nunca como HTML).
    assert.equal(r.data.state.turns[0].name, '<img src=x onerror=alert(1)>');
    const pub = await new Client(srv.url).req('state');
    assert.equal(pub.data.state.cfg.title, cfg.title);
    assert.ok(existsSync(join(srv.storage, 'state.json')));
  });

  for (const [name, patch] of [
    ['color inválido', { cfg: { colors: { bg: 'red; background:url(x)' } } }],
    ['logo con URL externa', { cfg: { logo: 'https://atacante.example/logo.png' } }],
    ['logo con javascript:', { cfg: { logo: 'javascript:alert(1)' } }],
    ['logo data: (solo modo local)', { cfg: { logo: 'data:image/png;base64,AAAA' } }],
    ['imagen inexistente', { cfg: { bgImage: 'api.php?action=asset&id=' + 'a'.repeat(32) + '.png' } }],
    ['fxTarget no permitido', { cfg: { fxTarget: 'script' } }],
    ['ID de voz con ruta', { cfg: { elVoice: '../../v1/user' } }],
    ['más de 100 turnos', { turns: Array.from({ length: 101 }, () => ({ name: 'x', profession: 'y', minutes: 1 })) }],
  ]) {
    test(`rechaza ${name} → 422`, async () => {
      const r = await admin.req('save', { method: 'POST', json: validState(patch) });
      assert.equal(r.status, 422, JSON.stringify(r.data));
    });
  }

  test('rechaza cuerpos de más de 256 KB → 413 y JSON mal formado → 400', async () => {
    const big = validState({ cfg: { title: 'x'.repeat(300 * 1024) } });
    assert.equal((await admin.req('save', { method: 'POST', json: big })).status, 413);
    const bad = await admin.req('save', { method: 'POST', body: '{"cfg":', headers: { 'Content-Type': 'application/json' } });
    assert.equal(bad.status, 400);
  });

  test('control de concurrencia: rev desactualizado → 409', async () => {
    const cur = (await new Client(srv.url).req('state')).data.rev;
    assert.equal((await admin.req('save', { method: 'POST', json: validState({ rev: cur }) })).status, 200);
    assert.equal((await admin.req('save', { method: 'POST', json: validState({ rev: cur }) })).status, 409);
  });

  test('la API key de ElevenLabs se guarda aparte y nunca se devuelve', async () => {
    const key = 'sk_prueba_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
    const r = await admin.req('save', { method: 'POST', json: validState({ secrets: { elKey: key } }) });
    assert.equal(r.status, 200);
    assert.equal(r.data.tts.keySet, true);
    assert.ok(!JSON.stringify(r.data).includes(key));
    const pub = await new Client(srv.url).req('state');
    assert.equal(pub.data.tts.keySet, true);
    assert.ok(!JSON.stringify(pub.data).includes(key));
    assert.ok(!readFileSync(join(srv.storage, 'state.json'), 'utf8').includes(key));
    assert.ok(readFileSync(join(srv.storage, 'secrets.json'), 'utf8').includes(key));
    const bad = await admin.req('save', { method: 'POST', json: validState({ secrets: { elKey: 'clave con espacios";' } }) });
    assert.equal(bad.status, 422);
  });

  test('TTS sin ID de voz configurado → 409 (no llama a servicios externos)', async () => {
    const r = await admin.req('tts', { method: 'POST', json: { text: 'Prueba' } });
    assert.equal(r.status, 409);
  });
});

describe('API: subida de imágenes', () => {
  let srv, admin;
  before(async () => { srv = await startServer(); admin = new Client(srv.url); await admin.setup(); });
  after(() => srv.stop());

  test('PNG válido se guarda con nombre aleatorio y se sirve con cabeceras seguras', async () => {
    const r = await upload(admin, '../../../evil.php.png', 'image/png', PNG_1PX);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.match(r.data.ref, /^api\.php\?action=asset&id=[a-f0-9]{32}\.png$/);
    const files = readdirSync(join(srv.storage, 'uploads'));
    assert.ok(files.every((f) => /^[a-f0-9]{32}\.png$/.test(f)), files.join());
    const id = r.data.ref.split('id=')[1];
    const img = await new Client(srv.url).req('asset', { query: '&id=' + id });
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
    assert.match(img.headers.get('content-security-policy'), /sandbox/);
    const saved = await admin.req('save', { method: 'POST', json: validState({ cfg: { logo: r.data.ref } }) });
    assert.equal(saved.status, 200);
  });

  test('rechaza un PHP disfrazado de imagen', async () => {
    const r = await upload(admin, 'shell.png', 'image/png', '<?php system($_GET["c"]); ?>');
    assert.equal(r.status, 415);
  });

  test('rechaza HTML disfrazado de imagen', async () => {
    const r = await upload(admin, 'x.gif', 'image/gif', '<html><script>alert(1)</script></html>');
    assert.equal(r.status, 415);
  });

  for (const [name, svg] of [
    ['script', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ['evento onload', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="1" height="1"/></svg>'],
    ['foreignObject', '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>x</div></foreignObject></svg>'],
    ['href externo', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="https://atacante.example/x.png"/></svg>'],
    ['javascript: en enlace', '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>x</text></a></svg>'],
    ['entidad XML (XXE)', '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&x;</text></svg>'],
  ]) {
    test(`rechaza SVG con ${name}`, async () => {
      const r = await upload(admin, 'logo.svg', 'image/svg+xml', svg);
      assert.equal(r.status, 415, JSON.stringify(r.data));
    });
  }

  test('acepta un SVG limpio y lo sirve en sandbox', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#10A13B"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/></svg>';
    const r = await upload(admin, 'logo.svg', 'image/svg+xml', svg);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const img = await new Client(srv.url).req('asset', { query: '&id=' + r.data.ref.split('id=')[1] });
    assert.equal(img.headers.get('content-type'), 'image/svg+xml');
    assert.match(img.headers.get('content-security-policy'), /default-src 'none'.*sandbox/);
  });

  test('rechaza archivos que superan el límite configurado', async () => {
    const tiny = await startServer({ max_upload_mb: 1 });
    try {
      const c = new Client(tiny.url);
      await c.setup();
      const big = Buffer.concat([PNG_1PX, Buffer.alloc(1024 * 1024 + 10)]);
      const r = await upload(c, 'big.png', 'image/png', big);
      assert.equal(r.status, 413);
    } finally { await tiny.stop(); }
  });
});

describe('API: límite de intentos (fuerza bruta)', () => {
  let srv;
  before(async () => { srv = await startServer(); await new Client(srv.url).setup(); });
  after(() => srv.stop());

  test('tras 5 contraseñas incorrectas responde 429 incluso con la correcta', async () => {
    const c = new Client(srv.url);
    for (let i = 0; i < 5; i++) assert.equal((await c.login('incorrecta-' + i)).status, 401);
    const blocked = await c.login();
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  });

  test('tras 5 tokens de setup incorrectos responde 429', async () => {
    const fresh = await startServer();
    try {
      const c = new Client(fresh.url);
      for (let i = 0; i < 5; i++) assert.equal((await c.setup(ADMIN_PASSWORD, 'malo-' + i)).status, 403);
      assert.equal((await c.setup()).status, 429);
    } finally { await fresh.stop(); }
  });
});

describe('API: asistente de instalación', () => {
  const tokenFrom = (storage) => {
    const m = readFileSync(join(storage, 'setup-token.php'), 'utf8').match(/TOKEN:\s*([a-f0-9]+)/);
    return m && m[1];
  };

  test('sin setup_token en config se genera un token en storage/setup-token.php y sirve para instalar', async () => {
    const srv = await startServer({ setup_token: '' });
    try {
      const c = new Client(srv.url);
      const s = await c.req('session');
      assert.equal(s.data.setupRequired, true);
      assert.equal(s.data.setupEnabled, true);
      assert.equal(s.data.tokenSource, 'file');
      const raw = readFileSync(join(srv.storage, 'setup-token.php'), 'utf8');
      assert.match(raw, /^<\?php http_response_code\(404\); exit; \?>/, 'el archivo responde 404 si se ejecuta por web');
      const token = tokenFrom(srv.storage);
      assert.match(token, /^[a-f0-9]{40}$/);
      assert.equal((await c.req('session')).data.tokenSource, 'file');
      assert.equal(tokenFrom(srv.storage), token, 'el token no cambia entre visitas');
      assert.equal((await c.setup(ADMIN_PASSWORD, '')).status, 403);
      assert.equal((await c.setup(ADMIN_PASSWORD, 'a'.repeat(40))).status, 403);
      assert.equal((await c.setup(ADMIN_PASSWORD, token)).status, 200);
      assert.equal(existsSync(join(srv.storage, 'setup-token.php')), false, 'el token se borra al instalar');
    } finally { await srv.stop(); }
  });

  test('con setup_token corto (menos de 16) se usa el token generado, no el de config', async () => {
    const srv = await startServer({ setup_token: 'Corto$26#abc' });
    try {
      const c = new Client(srv.url);
      const s = await c.req('session');
      assert.equal(s.data.setupEnabled, true);
      assert.equal(s.data.tokenSource, 'file');
      assert.equal((await c.setup(ADMIN_PASSWORD, 'Corto$26#abc')).status, 403);
      assert.equal((await c.setup(ADMIN_PASSWORD, tokenFrom(srv.storage))).status, 200);
    } finally { await srv.stop(); }
  });

  test('con setup_token válido en config no se crea archivo de token', async () => {
    const srv = await startServer();
    try {
      const s = await new Client(srv.url).req('session');
      assert.equal(s.data.tokenSource, 'config');
      assert.equal(existsSync(join(srv.storage, 'setup-token.php')), false);
    } finally { await srv.stop(); }
  });

  test('install_check: público antes de instalar, 403 después sin sesión, 200 con sesión', async () => {
    const srv = await startServer();
    try {
      const anon = new Client(srv.url);
      const r = await anon.req('install_check');
      assert.equal(r.status, 200);
      const ids = r.data.checks.map((c) => c.id);
      for (const id of ['php', 'ext-json', 'ext-mbstring', 'ext-fileinfo', 'storage', 'https', 'upload']) assert.ok(ids.includes(id), id);
      assert.ok(r.data.checks.every((c) => ['ok', 'warn', 'error'].includes(c.status)));
      assert.match(r.data.probe, /^[a-f0-9]{32}$/);
      assert.equal(readFileSync(join(srv.storage, 'install-probe.txt'), 'utf8'), r.data.probe);
      const admin = new Client(srv.url);
      await admin.setup();
      assert.equal(existsSync(join(srv.storage, 'install-probe.txt')), false, 'la prueba se borra al instalar');
      assert.equal((await new Client(srv.url).req('install_check')).status, 403);
      assert.equal((await admin.req('install_check')).status, 200);
      assert.equal((await admin.req('save', { method: 'POST', json: validState() })).status, 200);
      assert.equal(existsSync(join(srv.storage, 'install-probe.txt')), false);
    } finally { await srv.stop(); }
  });

  test('después de instalar, setup responde 409 sin revelar ni aceptar tokens', async () => {
    const srv = await startServer();
    try {
      await new Client(srv.url).setup();
      const c = new Client(srv.url);
      const s = await c.req('session');
      assert.equal(s.data.setupRequired, false);
      assert.equal(s.data.tokenSource, null);
      assert.equal((await c.setup()).status, 409);
    } finally { await srv.stop(); }
  });
});
