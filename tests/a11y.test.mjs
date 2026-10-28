// Pruebas de accesibilidad (WCAG 2.1/2.2 A y AA) con axe-core + Playwright, y pruebas de teclado y lector de pantalla.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, Client, validState, ROOT, SETUP_TOKEN, ADMIN_PASSWORD } from './helpers.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const REPORTS = join(ROOT, 'tests/reports');

async function axe(page, label) {
  await page.evaluate(AXE);
  const res = await page.evaluate(async (tags) => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations', 'incomplete'] });
    return { violations: r.violations, incomplete: r.incomplete.map((i) => i.id + ' (' + i.nodes.length + ')').join(', ') || '—' };
  }, TAGS);
  const summary = res.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  results.push({ label, violations: res.violations.length, incomplete: res.incomplete, details: summary });
  assert.deepEqual(summary, [], `${label}: violaciones de accesibilidad`);
}

const results = [];
let srv, browser;

describe('Accesibilidad', () => {
  before(async () => {
    srv = await startServer();
    const admin = new Client(srv.url);
    await admin.setup();
    await admin.req('save', {
      method: 'POST',
      json: validState({
        cfg: { title: '<img src=x onerror="window.__xss=1">Foro TIC', subtitle: 'Pasto · 27 de octubre de 2026' },
        turns: [
          { name: 'Ana Pérez', profession: 'Ingeniera de sistemas', minutes: 5 },
          { name: '<script>window.__xss=2</script>Luis', profession: 'Abogado', minutes: 3 },
        ],
      }),
    });
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    await srv?.stop();
  });

  async function open(opts = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss(); });
    await page.goto(srv.url + '/', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.getElementById('speaker-name').textContent === 'Ana Pérez');
    return { page, ctx, errors };
  }

  test('pantalla principal sin violaciones WCAG', async () => {
    const { page, ctx, errors } = await open();
    await axe(page, 'Pantalla principal');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  for (const tab of ['general', 'turns', 'colors', 'sound', 'access']) {
    test(`panel de configuración, pestaña ${tab}, sin violaciones WCAG`, async () => {
      const { page, ctx } = await open();
      await page.click('#menu-btn');
      await page.click('#tab-' + tab);
      await axe(page, `Configuración · ${tab}`);
      await ctx.close();
    });
  }

  test('franja de advertencia en el fondo mantiene el contraste de los textos', async () => {
    const { page, ctx } = await open();
    await page.click('#menu-btn');
    await page.selectOption('#f-fx', 'bg');
    await page.fill('#f-yel', '400'); await page.press('#f-yel', 'Tab');
    await page.fill('#f-red', '200'); await page.press('#f-red', 'Tab');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await axe(page, 'Franja amarilla en el fondo');
    await ctx.close();
  });

  test('los textos peligrosos se muestran como texto (sin XSS)', async () => {
    const { page, ctx, errors } = await open();
    assert.equal(await page.textContent('#title'), '<img src=x onerror="window.__xss=1">Foro TIC');
    assert.equal(await page.locator('#title img').count(), 0);
    await page.click('#next-btn');
    assert.equal(await page.textContent('#speaker-name'), '<script>window.__xss=2</script>Luis');
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test('teclado: abrir, navegar pestañas con flechas, cerrar con Escape y devolver el foco', async () => {
    const { page, ctx } = await open();
    await page.focus('#menu-btn');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-general');
    assert.equal(await page.getAttribute('#menu-btn', 'aria-expanded'), 'true');
    assert.equal(await page.evaluate(() => document.getElementById('app').inert), true, 'el fondo queda inerte');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-turns');
    assert.equal(await page.getAttribute('#tab-turns', 'aria-selected'), 'true');
    assert.equal(await page.isVisible('#panel-turns'), true);
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-access');
    await page.keyboard.press('Home');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'tab-general');
    await page.keyboard.press('Escape');
    assert.equal(await page.isVisible('#overlay'), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'menu-btn');
    await ctx.close();
  });

  test('teclado: el foco queda atrapado dentro del diálogo', async () => {
    const { page, ctx } = await open();
    await page.click('#menu-btn');
    await page.click('#tab-access');
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => document.getElementById('settings').contains(document.activeElement));
      assert.ok(inside, 'el foco salió del diálogo en la tabulación ' + i);
    }
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Shift+Tab');
      assert.ok(await page.evaluate(() => document.getElementById('settings').contains(document.activeElement)));
    }
    await ctx.close();
  });

  test('teclado: todos los controles principales son alcanzables con Tab y tienen foco visible', async () => {
    const { page, ctx } = await open();
    const seen = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const a = document.activeElement, cs = getComputedStyle(a);
        return { id: a.id, ring: cs.boxShadow !== 'none' || cs.outlineStyle !== 'none' };
      });
      seen.push(info.id);
      assert.ok(info.ring, 'sin indicador de foco en ' + info.id);
    }
    for (const id of ['menu-btn', 'toggle-btn', 'reset-btn', 'next-btn']) assert.ok(seen.includes(id), `${id} no es alcanzable: ${seen}`);
    await ctx.close();
  });

  test('lector de pantalla: temporizador accesible y anuncios en regiones vivas', async () => {
    const { page, ctx } = await open();
    assert.equal(await page.getAttribute('#timer', 'role'), 'timer');
    assert.match(await page.textContent('#timer'), /Tiempo restante: 5 minutos 0 segundos/);
    await page.click('#toggle-btn');
    await page.waitForFunction(() => /en curso/i.test(document.getElementById('announcer').textContent));
    await page.waitForTimeout(1300);
    assert.match(await page.textContent('#timer'), /4 minutos 5\d segundos/);
    await page.click('#next-btn');
    await page.waitForFunction(() => /Turno 2 de 2/.test(document.getElementById('announcer').textContent));
    assert.equal(await page.getAttribute('#next-btn', 'aria-label'), 'Pasar al siguiente turno (no hay más turnos)');
    assert.equal(await page.isDisabled('#next-btn'), true);
    await ctx.close();
  });

  test('reflujo a 320 px (equivale a zoom 400 %) sin desplazamiento horizontal', async () => {
    const { page, ctx } = await open({ viewport: { width: 320, height: 640 } });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `desplazamiento horizontal de ${overflow}px`);
    await axe(page, 'Móvil 320 px');
    await page.click('#menu-btn');
    const panelOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(panelOverflow <= 0);
    await ctx.close();
  });

  test('movimiento reducido: sin destello al cambiar de turno', async () => {
    const { page, ctx } = await open({ reducedMotion: 'reduce' });
    await page.click('#next-btn');
    await page.waitForTimeout(50);
    // El destello amplía y desvanece los números; con movimiento reducido el lienzo se pinta opaco de inmediato.
    const alpha = await page.evaluate(() => {
      const c = document.getElementById('canvas'), ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let max = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > max) max = d[i];
      return max;
    });
    assert.equal(alpha, 255);
    await ctx.close();
  });

  test('contraste de la paleta institucional por defecto', () => {
    const lum = (hex) => {
      const v = [1, 3, 5].map((i) => { const c = parseInt(hex.substr(i, 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const checks = [
      ['Título #000000 / blanco', '#000000', '#FFFFFF', 3],
      ['Subtítulo #4A4A4A / blanco', '#4A4A4A', '#FFFFFF', 4.5],
      ['Etiqueta #0B7A2C / blanco', '#0B7A2C', '#FFFFFF', 4.5],
      ['Botón blanco / #003366', '#FFFFFF', '#003366', 4.5],
      ['Insignia blanco / #0B7A2C', '#FFFFFF', '#0B7A2C', 4.5],
      ['Insignia blanco / #A61B1B', '#FFFFFF', '#A61B1B', 4.5],
      ['Números verdes #10A13B / blanco (texto grande)', '#10A13B', '#FFFFFF', 3],
      ['Números rojos #D62828 / blanco (texto grande)', '#D62828', '#FFFFFF', 3],
      ['Texto negro / franja amarilla', '#000000', '#FFD500', 4.5],
      ['Texto blanco / franja roja', '#FFFFFF', '#D62828', 4.5],
      ['Icono siguiente blanco / #10A13B (no textual)', '#FFFFFF', '#10A13B', 3],
    ];
    for (const [name, fg, bg, min] of checks) assert.ok(ratio(fg, bg) >= min, `${name}: ${ratio(fg, bg).toFixed(2)} < ${min}`);
  });
});

describe('Asistente de instalación', () => {
  let wsrv, wbrowser;
  before(async () => { wsrv = await startServer(); wbrowser = await chromium.launch(); });
  after(async () => { await wbrowser?.close(); await wsrv?.stop(); });

  async function openFresh(opts = {}) {
    const ctx = await wbrowser.newContext({ viewport: { width: 1280, height: 860 }, ...opts });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(wsrv.url + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#wizard:not([hidden])');
    await page.waitForFunction(() => !document.getElementById('wz-next').disabled);
    return { page, ctx, errors };
  }
  const active = (page) => page.evaluate(() => document.activeElement.id);

  test('se abre al iniciar sin instalar; el contador queda inerte y se puede omitir', async () => {
    const { page, ctx } = await openFresh();
    assert.equal(await page.getAttribute('#wz-form', 'role'), 'dialog');
    assert.equal(await page.getAttribute('#wz-form', 'aria-modal'), 'true');
    assert.equal(await page.evaluate(() => document.getElementById('app').inert), true);
    assert.equal(await active(page), 'wz-title', 'el foco inicia en el título del paso');
    assert.equal(await page.getAttribute('#wz-step-check', 'aria-current'), 'step');
    await page.click('#wz-skip');
    assert.equal(await page.isHidden('#wizard'), true);
    assert.equal(await page.evaluate(() => document.getElementById('app').inert), false);
    assert.equal(await active(page), 'toggle-btn');
    await page.waitForFunction(() => /omitido/.test(document.getElementById('announcer').textContent));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    assert.equal(await page.isHidden('#wizard'), true, 'omitido no reaparece en la misma sesión del navegador');
    await page.click('#menu-btn'); await page.click('#tab-access');
    assert.equal(await page.isVisible('#open-wizard'), true, 'se puede reabrir desde Acceso');
    await page.click('#open-wizard');
    assert.equal(await page.isVisible('#wizard'), true);
    await ctx.close();
  });

  test('recorrido completo con teclado, validación accesible y axe en cada paso', async () => {
    const { page, ctx, errors } = await openFresh();
    await axe(page, 'Asistente · 1 Servidor');
    assert.equal(await page.locator('.wz-check[data-status="error"]').count(), 0);

    await page.focus('#wz-next');
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-step="admin"]:not([hidden])');
    assert.equal(await active(page), 'wz-title');
    await axe(page, 'Asistente · 2 Administrador');
    await page.click('#wz-next');
    assert.match(await page.textContent('#wz-error'), /token/i);
    assert.equal(await page.getAttribute('#wz-token', 'aria-invalid'), 'true');
    assert.match(await page.getAttribute('#wz-token', 'aria-describedby'), /wz-error/);
    assert.equal(await active(page), 'wz-token', 'el foco va al campo con error');
    await page.fill('#wz-token', SETUP_TOKEN);
    await page.fill('#wz-pass1', ADMIN_PASSWORD);
    await page.fill('#wz-pass2', ADMIN_PASSWORD + 'x');
    await page.keyboard.press('Enter');  // Enter dentro de un campo envía el paso
    assert.match(await page.textContent('#wz-error'), /no coinciden/);
    assert.equal(await active(page), 'wz-pass2');
    await page.fill('#wz-pass2', ADMIN_PASSWORD);
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-step="event"]:not([hidden])');
    assert.equal(await page.getAttribute('#wz-token', 'aria-invalid'), null, 'los errores se limpian al avanzar');

    await axe(page, 'Asistente · 3 Evento');
    await page.fill('#wz-title-in', 'Foro Departamental TIC');
    await page.fill('#wz-sub-in', 'Pasto · 28 de octubre de 2026');
    await page.click('#wz-next');

    await page.waitForSelector('[data-step="times"]:not([hidden])');
    await axe(page, 'Asistente · 4 Tiempos');
    await page.fill('#wz-yel', '50'); await page.fill('#wz-red', '60');
    await page.click('#wz-next');
    assert.equal(await active(page), 'wz-yel');
    await page.fill('#wz-yel', '120');
    await page.click('#wz-next');

    await page.waitForSelector('[data-step="turns"]:not([hidden])');
    await page.click('#wz-next');
    assert.equal(await active(page), 'wz-t-name-0', 'exige al menos un ponente');
    await page.fill('#wz-t-name-0', 'Ana Pérez');
    await page.fill('#wz-t-prof-0', 'Ingeniera de sistemas');
    await page.click('#wz-add-turn');
    assert.equal(await active(page), 'wz-t-name-1', 'el foco va al nuevo ponente');
    await page.keyboard.type('Luis Gómez');
    await axe(page, 'Asistente · 5 Ponentes');
    await page.click('#wz-next');

    await page.waitForSelector('[data-step="voice"]:not([hidden])');
    await axe(page, 'Asistente · 6 Voz');
    await page.click('#wz-next');

    await page.waitForSelector('[data-step="summary"]:not([hidden])');
    await axe(page, 'Asistente · 7 Resumen');
    assert.match(await page.textContent('#wz-summary'), /Ana Pérez · Ingeniera de sistemas/);
    assert.equal(await page.textContent('#wz-next'), 'Guardar y abrir el contador');

    // Atrás conserva lo escrito
    await page.click('#wz-back'); await page.click('#wz-back');
    assert.equal(await page.inputValue('#wz-t-name-1'), 'Luis Gómez');
    await page.click('#wz-next'); await page.click('#wz-next');

    await page.click('#wz-next');
    await page.waitForSelector('#wizard', { state: 'hidden' });
    assert.equal(await page.textContent('#title'), 'Foro Departamental TIC');
    assert.equal(await page.textContent('#speaker-name'), 'Ana Pérez');
    assert.equal(await active(page), 'toggle-btn');
    await page.waitForFunction(() => /Instalación completada/.test(document.getElementById('announcer').textContent));
    const saved = JSON.parse(readFileSync(join(wsrv.storage, 'state.json'), 'utf8'));
    assert.equal(saved.turns.length, 2);
    assert.equal(saved.cfg.subtitle, 'Pasto · 28 de octubre de 2026');
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test('ya instalado, no se abre al iniciar y se puede reabrir desde Acceso con sesión', async () => {
    const ctx = await wbrowser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    await page.goto(wsrv.url + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    assert.equal(await page.isHidden('#wizard'), true);
    await page.click('#menu-btn'); await page.click('#tab-access');
    await page.fill('#f-pass', ADMIN_PASSWORD); await page.keyboard.press('Enter');
    await page.waitForSelector('#rerun-wizard:visible');
    await page.click('#rerun-wizard');
    await page.waitForSelector('[data-step="event"]:not([hidden])');
    assert.equal(await page.inputValue('#wz-title-in'), 'Foro Departamental TIC', 'precarga la configuración guardada');
    await page.click('#wz-skip');
    assert.equal(await page.isHidden('#wizard'), true);
    await ctx.close();
  });

  test('reflujo del asistente a 320 px sin desplazamiento horizontal', async () => {
    const fresh = await startServer();
    const ctx = await wbrowser.newContext({ viewport: { width: 320, height: 640 } });
    try {
      const page = await ctx.newPage();
      await page.goto(fresh.url + '/', { waitUntil: 'networkidle' });
      await page.waitForSelector('#wizard:not([hidden])');
      await page.waitForFunction(() => !document.getElementById('wz-next').disabled);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 0, `desplazamiento horizontal de ${overflow}px`);
      await axe(page, 'Asistente · móvil 320 px');
    } finally { await ctx.close(); await fresh.stop(); }
  });
});

describe('Asistente en subdirectorio con reescritura (como tic.narino.gov.co/app/tiempo/)', () => {
  let rsrv, rbrowser;
  before(async () => {
    rsrv = await startServer({ setup_token: 'Corto$26#' }, { router: join(ROOT, 'tests/php/rewrite-router.php') });
    rbrowser = await chromium.launch();
  });
  after(async () => { await rbrowser?.close(); await rsrv?.stop(); });

  test('instala con token generado, recupera una sesión perdida y guarda', async () => {
    const ctx = await rbrowser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(rsrv.url + '/app/tiempo/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#wizard:not([hidden])');
    await page.waitForFunction(() => !document.getElementById('wz-next').disabled);
    assert.equal(await page.locator('.wz-check[data-status="error"]').count(), 0);
    await page.click('#wz-next');

    const token = readFileSync(join(rsrv.storage, 'setup-token.php'), 'utf8').match(/TOKEN:\s*([a-f0-9]+)/)[1];
    await page.fill('#wz-token', token);
    await page.fill('#wz-pass1', ADMIN_PASSWORD);
    await page.fill('#wz-pass2', ADMIN_PASSWORD);
    await page.click('#wz-next');
    await page.waitForSelector('[data-step="event"]:not([hidden])');
    const cookies = await ctx.cookies();
    assert.equal(cookies.find((c) => c.name === 'CONTADORSID').path, '/app/tiempo/');

    await page.fill('#wz-title-in', 'Evento en subdirectorio');
    for (const stepId of ['times', 'turns']) { await page.click('#wz-next'); await page.waitForSelector(`[data-step="${stepId}"]:not([hidden])`); }
    await page.fill('#wz-t-name-0', 'Ana Pérez');
    for (const stepId of ['voice', 'summary']) { await page.click('#wz-next'); await page.waitForSelector(`[data-step="${stepId}"]:not([hidden])`); }

    // Sesión perdida justo antes de guardar: el asistente lleva al inicio de sesión y vuelve al resumen.
    await ctx.clearCookies();
    await page.click('#wz-next');
    await page.waitForSelector('[data-step="admin"]:not([hidden])');
    assert.equal(await page.isVisible('#wz-login'), true);
    assert.match(await page.textContent('#wz-error'), /Inicie sesión/);
    await page.fill('#wz-loginpass', ADMIN_PASSWORD);
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-step="summary"]:not([hidden])');
    assert.match(await page.textContent('#wz-summary'), /Evento en subdirectorio/);
    await page.click('#wz-next');
    await page.waitForSelector('#wizard', { state: 'hidden' });
    assert.equal(await page.textContent('#title'), 'Evento en subdirectorio');
    assert.equal(JSON.parse(readFileSync(join(rsrv.storage, 'state.json'), 'utf8')).cfg.title, 'Evento en subdirectorio');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
});

after(() => {
  mkdirSync(REPORTS, { recursive: true });
  const lines = ['# Resultado axe-core', '', `Etiquetas: ${TAGS.join(', ')}`, '', '| Vista | Violaciones | Revisión manual (incomplete) |', '|---|---|---|'];
  for (const r of results) lines.push(`| ${r.label} | ${r.violations} | ${r.incomplete} |`);
  for (const r of results.filter((x) => x.details.length)) lines.push('', `## ${r.label}`, ...r.details.map((d) => `- ${d}`));
  require('node:fs').writeFileSync(join(REPORTS, 'axe-resultados.md'), lines.join('\n') + '\n');
});
