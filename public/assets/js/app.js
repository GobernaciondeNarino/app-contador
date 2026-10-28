/* Contador de exposiciones — Gobernación de Nariño
 * Sin dependencias. Persiste en el servidor (api.php → JSON) o, sin servidor, en localStorage.
 * Todo texto de usuario se pinta con textContent: nunca innerHTML. */
(function () {
  'use strict';

  var API = 'api.php';
  var LOCAL_KEY = 'contador-exposiciones:v1';

  var DEFAULT_COLORS = {
    bg: '#FFFFFF', title: '#000000', subtitle: '#4A4A4A', header: '#003366',
    green: '#10A13B', yellow: '#FFD500', red: '#D62828',
    speaker: '#000000', profession: '#4A4A4A', label: '#0B7A2C', text: '#4A4A4A', accent: '#10A13B',
    onYellow: '#000000', onRed: '#FFFFFF'
  };

  /* [clave, etiqueta, fondo contra el que se mide, contraste mínimo] */
  var COLOR_ROWS = [
    ['bg', 'Fondo', null, 0],
    ['title', 'Título del evento', 'bg', 3],
    ['subtitle', 'Subtítulo', 'bg', 4.5],
    ['header', 'Botones y menú (texto blanco)', '#FFFFFF', 4.5],
    ['green', 'Contador: tiempo normal', 'bg', 3],
    ['yellow', 'Contador: franja de advertencia', 'bg', 3],
    ['red', 'Contador: franja final', 'bg', 3],
    ['speaker', 'Nombre del ponente', 'bg', 3],
    ['profession', 'Profesión', 'bg', 4.5],
    ['label', 'Etiqueta «Ponente en turno»', 'bg', 4.5],
    ['text', 'Texto inferior', 'bg', 4.5],
    ['accent', 'Acento y botón siguiente', 'bg', 3],
    ['onYellow', 'Texto sobre franja amarilla (fondo)', 'yellow', 4.5],
    ['onRed', 'Texto sobre franja roja (fondo)', 'red', 4.5]
  ];

  function defaultCfg() {
    return {
      title: '[Nombre del evento]', subtitle: '[Lugar · fecha]', footer: '[Texto inferior]',
      logo: '', bgImage: '', bgFit: 'cover', bgOpacity: 100, fxTarget: 'text',
      minutes: 5, yellowAt: 120, redAt: 60, sound: true, voice: true, outline: true,
      elVoice: '', elModel: 'eleven_multilingual_v2',
      endPhrase: 'Su turno ha terminado', startPhrase: 'Inicia la ponencia de',
      colors: Object.assign({}, DEFAULT_COLORS)
    };
  }
  function defaultTurns() {
    return [1, 2, 3].map(function (n) { return { name: '[Nombre del ponente ' + n + ']', profession: '[Profesión]', minutes: 5 }; });
  }

  var S = {
    cfg: defaultCfg(),
    turns: defaultTurns(),
    idx: 0, running: false, rem: 300, remaining: 300, total: 300,
    menuOpen: false, tab: 'general', dirty: false, pendingKey: null,
    server: { available: false, authenticated: false, setupRequired: false, setupEnabled: false, setupIssue: null, setupTokenMin: 16, csrf: null, rev: 0, keySet: false, keyLocked: false, uploadMb: 4, svg: true }
  };

  var reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var $ = function (id) { return document.getElementById(id); };
  var el = {};

  /* ---------------- utilidades ---------------- */

  function clamp(n, min, max) { n = Number(n); if (!isFinite(n)) n = min; return Math.max(min, Math.min(max, Math.round(n))); }
  function isHex(c) { return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c); }
  function safeImageSrc(src) {
    if (typeof src !== 'string' || !src) return '';
    if (/^api\.php\?action=asset&id=[a-f0-9]{32}\.(png|jpg|webp|gif|svg)$/.test(src)) return src;
    if (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(src)) return src;
    return '';
  }
  function fmt(rem) {
    var s = Math.max(0, Math.ceil(rem));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return h > 0 ? h + ':' + p(m) + ':' + p(ss) : p(m) + ':' + p(ss);
  }
  function spokenTime(rem) {
    var s = Math.max(0, Math.ceil(rem)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    var parts = [];
    if (h) parts.push(h + (h === 1 ? ' hora' : ' horas'));
    if (m || h) parts.push(m + (m === 1 ? ' minuto' : ' minutos'));
    parts.push(ss + (ss === 1 ? ' segundo' : ' segundos'));
    return parts.join(' ');
  }
  function luminance(hex) {
    var v = [1, 3, 5].map(function (i) {
      var c = parseInt(hex.substr(i, 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function contrast(a, b) {
    var la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function announce(text, urgent) {
    var node = urgent ? el.alerter : el.announcer;
    node.textContent = '';
    window.setTimeout(function () { node.textContent = text; }, 60);
  }

  /* ---------------- fases del contador ---------------- */

  function phase(rem) {
    var R = Math.max(1, Number(S.cfg.redAt) || 60);
    var Y = Math.max(R + 1, Number(S.cfg.yellowAt) || 120);
    if (rem <= 0) return { phase: 3, k: 1 };
    if (rem <= R) return { phase: 2, k: 1 - rem / R };
    if (rem <= Y) return { phase: 1, k: 1 - (rem - R) / (Y - R) };
    return { phase: 0, k: 0 };
  }

  /* ---------------- temporizador ---------------- */

  var last = Date.now();
  var flash = 0;

  function tick() {
    var now = Date.now(), dt = (now - last) / 1000;
    last = now;
    if (!S.running) return;
    var prev = S.rem;
    S.rem = Math.max(0, S.rem - dt);
    var p0 = phase(prev).phase, p1 = phase(S.rem).phase;
    if (prev > 60 && S.rem <= 60 && S.cfg.sound) chimeMinute();
    if (prev > 0 && S.rem <= 0) {
      if (S.cfg.sound) chimeEnd();
      window.setTimeout(function () { speak(S.cfg.endPhrase); }, 1300);
      S.running = false;
      S.remaining = 0;
      announce('Tiempo terminado.', true);
      renderTimer();
      return;
    }
    if (p1 !== p0 && p1 === 1) announce('Franja de advertencia: quedan ' + spokenTime(S.rem) + '.');
    if (p1 !== p0 && p1 === 2) announce('Franja final: quedan ' + spokenTime(S.rem) + '.');
    var sec = Math.ceil(S.rem);
    if (sec !== S.remaining) { S.remaining = sec; renderTime(); }
  }

  function loadTurn(i, autostart) {
    var t = S.turns[i];
    if (!t) return;
    var total = clamp(t.minutes, 1, 180) * 60;
    S.idx = i; S.rem = total; S.total = total; S.remaining = total; S.running = !!autostart;
    last = Date.now();
    if (!reduceMotion.matches) flash = 1;
    renderTimer();
    renderSpeaker();
  }

  /* ---------------- audio y voz ---------------- */

  var ac = null;
  function ensureAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!ac && AC) ac = new AC();
    if (ac && ac.state === 'suspended') ac.resume();
  }
  function tone(freq, at, dur, vol) {
    if (!ac) return;
    var t0 = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function chimeMinute() { ensureAudio(); tone(880, 0, 0.35, 0.35); tone(1175, 0.28, 0.5, 0.35); }
  function chimeEnd() { ensureAudio(); tone(784, 0, 0.45, 0.4); tone(659, 0.32, 0.45, 0.4); tone(523, 0.64, 0.9, 0.45); }

  function speak(text) {
    if (!S.cfg.voice || !text) return;
    var srv = S.server;
    if (srv.available && srv.authenticated && srv.keySet && S.cfg.elVoice) {
      api('tts', { method: 'POST', json: { text: text }, raw: true })
        .then(function (blob) {
          var url = URL.createObjectURL(blob), audio = new Audio(url);
          audio.addEventListener('ended', function () { URL.revokeObjectURL(url); });
          return audio.play();
        })
        .catch(function () { speakLocal(text); });
    } else {
      speakLocal(text);
    }
  }
  function speakLocal(text) {
    if (!window.speechSynthesis) return;
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'es-CO'; u.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  /* ---------------- contador en canvas ---------------- */

  var C = { ctx: null, w: 0, h: 0, dpr: 1, mask: null, outline: null, work: null, key: '', sig: '' };

  function initCanvas() {
    var ctx = el.canvas.getContext && el.canvas.getContext('2d');
    if (!ctx) { el.canvas.hidden = true; el.fallback.hidden = false; return; }
    C.ctx = ctx;
    C.work = document.createElement('canvas');
    fitCanvas();
    if (window.ResizeObserver) new ResizeObserver(fitCanvas).observe(el.counter);
    else window.addEventListener('resize', fitCanvas);
    if (document.fonts && document.fonts.load) {
      document.fonts.load('700 120px "Hind Madurai"').then(function () { C.key = ''; C.sig = ''; });
    }
    requestAnimationFrame(frame);
  }

  function fitCanvas() {
    var r = el.counter.getBoundingClientRect();
    C.dpr = Math.min(2, window.devicePixelRatio || 1);
    C.w = Math.max(1, Math.round(r.width * C.dpr));
    C.h = Math.max(1, Math.round(r.height * C.dpr));
    el.canvas.width = C.w; el.canvas.height = C.h;
    C.work.width = C.w; C.work.height = C.h;
    C.key = ''; C.sig = '';
  }

  /** Dibuja el texto en blanco (máscara) y su contorno; devuelve los límites verticales de los dígitos. */
  function buildMask(str, outlineColor) {
    var w = C.w, h = C.h;
    var mk = function () { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    var mask = mk(), ctx = mask.getContext('2d');
    var family = '"Hind Madurai", system-ui, sans-serif';
    var size = Math.floor(h * 0.87);
    ctx.font = '700 ' + size + 'px ' + family;
    var dw = 0;
    '0123456789'.split('').forEach(function (d) { dw = Math.max(dw, ctx.measureText(d).width); });
    var cw = ctx.measureText(':').width * 1.25;
    var cells = str.split('').map(function (ch) { return ch === ':' ? cw : dw; });
    var total = cells.reduce(function (a, b) { return a + b; }, 0);
    var scale = Math.min(1, (w * 0.96) / total);
    if (scale < 1) {
      size = Math.floor(size * scale);
      ctx.font = '700 ' + size + 'px ' + family;
      cells = cells.map(function (v) { return v * scale; });
      total *= scale;
    }
    var m = ctx.measureText('0');
    var asc = m.actualBoundingBoxAscent || size * 0.7, desc = m.actualBoundingBoxDescent || 0;
    var y = h / 2 + (asc - desc) / 2;
    var positions = [], x = (w - total) / 2;
    str.split('').forEach(function (ch, i) {
      positions.push([ch, x + cells[i] / 2, ch === ':' ? y - size * 0.04 : y]);
      x += cells[i];
    });
    ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    positions.forEach(function (p) { ctx.fillText(p[0], p[1], p[2]); });

    var outline = null;
    if (outlineColor) {
      outline = mk();
      var o = outline.getContext('2d');
      o.font = ctx.font; o.textAlign = 'center'; o.textBaseline = 'alphabetic';
      o.lineJoin = 'round'; o.lineWidth = Math.max(2, size * 0.045); o.strokeStyle = outlineColor;
      positions.forEach(function (p) { o.strokeText(p[0], p[1], p[2]); });
    }
    return { mask: mask, outline: outline, top: y - asc, bottom: y + desc };
  }

  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /** Colores de los números según fase y modo; replica el sombreador del diseño original. */
  function digitColors(ph, col, bgMode, time) {
    if (bgMode) {
      if (ph.phase === 0) return [col.green, col.green];
      if (ph.phase === 1) return [col.green, col.onYellow];
      if (ph.phase === 2) return [col.onYellow, col.onRed];
      return [col.onRed, col.onRed];
    }
    if (ph.phase === 0) return [col.green, col.green];
    if (ph.phase === 1) return [col.green, col.yellow];
    if (ph.phase === 2) return [col.yellow, col.red];
    var blink = reduceMotion.matches ? 1 : (Math.sin(time * 6) >= 0 ? 1 : 0.88);
    var red = blink === 1 ? col.red : shade(col.red, blink);
    return [red, red];
  }

  /** Color de contorno si algún color de los números contrasta menos de 3:1 con el fondo. */
  function outlineFor(colors, bg) {
    if (!S.cfg.outline) return '';
    var low = colors.some(function (c) { return isHex(c) && contrast(c, bg) < 3; });
    if (!low) return '';
    return contrast('#000000', bg) >= contrast('#FFFFFF', bg) ? '#000000' : '#FFFFFF';
  }

  var lastTime = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = (now - lastTime) / 1000; lastTime = now;
    if (flash > 0) flash = Math.max(0, flash - dt * 1.6);
    var col = S.cfg.colors, bgMode = S.cfg.fxTarget === 'bg';
    var ph = phase(S.rem);
    var time = now / 1000;
    var cols = digitColors(ph, col, bgMode, time);
    var rootRect = el.app.getBoundingClientRect();
    applyBgFx(bgMode, ph, col, rootRect);
    if (!C.ctx) { el.fallback.textContent = fmt(S.rem); el.fallback.style.color = cols[1]; return; }

    var str = fmt(S.rem);
    var bgRef = bgMode && ph.phase >= 2 ? (ph.phase === 3 ? col.red : col.yellow) : col.bg;
    var allCols = bgMode ? cols : [cols[0], cols[1]];
    var outlineColor = outlineFor(allCols.map(function (c) { return c.charAt(0) === '#' ? c : col.red; }), bgRef);
    var key = str + '|' + C.w + 'x' + C.h + '|' + outlineColor;
    if (key !== C.key) {
      var built = buildMask(str, outlineColor);
      C.mask = built.mask; C.outline = built.outline; C.top = built.top; C.bottom = built.bottom; C.key = key;
    }

    var split;
    if (bgMode) {
      var cr = el.canvas.getBoundingClientRect();
      var active = ph.phase === 1 || ph.phase === 2;
      var bandTop = active ? rootRect.bottom - rootRect.height * ph.k : rootRect.bottom + 1;
      split = (bandTop - cr.top) * C.dpr;
    } else {
      split = C.bottom - ph.k * (C.bottom - C.top);
    }
    var f = flash * flash;
    var sig = key + '|' + cols.join() + '|' + Math.round(split) + '|' + f.toFixed(3);
    if (sig === C.sig) return;
    C.sig = sig;

    var w = C.w, h = C.h, wctx = C.work.getContext('2d');
    wctx.globalCompositeOperation = 'source-over';
    wctx.clearRect(0, 0, w, h);
    wctx.drawImage(C.mask, 0, 0);
    wctx.globalCompositeOperation = 'source-in';
    wctx.fillStyle = cols[0];
    wctx.fillRect(0, 0, w, h);
    if (cols[1] !== cols[0] && split < h) {
      wctx.globalCompositeOperation = 'source-atop';
      wctx.fillStyle = cols[1];
      wctx.fillRect(0, Math.max(0, split), w, h);
    }
    wctx.globalCompositeOperation = 'source-over';

    var ctx = C.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    var s = 1 + 0.35 * f;
    ctx.translate(w / 2, h / 2); ctx.scale(s, s); ctx.translate(-w / 2, -h / 2);
    ctx.globalAlpha = 1 - 0.9 * f;
    if (C.outline) ctx.drawImage(C.outline, 0, 0);
    ctx.drawImage(C.work, 0, 0);
    ctx.restore();
  }

  /* Franja sobre el fondo: capa que sube de abajo hacia arriba; los textos cambian de color al quedar cubiertos. */
  var fxEls = null;
  function applyBgFx(bgMode, ph, col, rr) {
    var active = bgMode && (ph.phase === 1 || ph.phase === 2);
    var level = active ? rr.height * ph.k : 0;
    var base = !bgMode ? 'transparent' : (ph.phase === 2 ? col.yellow : (ph.phase === 3 ? col.red : 'transparent'));
    if (el.fxBase.style.background !== base) el.fxBase.style.background = base;
    el.fxBand.style.height = (active ? ph.k * 100 : 0) + '%';
    el.fxBand.style.background = ph.phase === 1 ? col.yellow : col.red;
    if (!fxEls) fxEls = Array.prototype.slice.call(document.querySelectorAll('[data-fx]'));
    for (var i = 0; i < fxEls.length; i++) {
      var node = fxEls[i], orig = col[node.getAttribute('data-color')] || '#000000', out = orig;
      if (bgMode && ph.phase > 0) {
        var r = node.getBoundingClientRect();
        var under = (rr.bottom - (r.top + r.bottom) / 2) <= level;
        if (ph.phase === 1) out = under ? col.onYellow : orig;
        else if (ph.phase === 2) out = under ? col.onRed : col.onYellow;
        else out = col.onRed;
      }
      if (node.dataset.applied !== out) { node.style.color = out; node.dataset.applied = out; }
    }
  }

  /* ---------------- renderizado del DOM ---------------- */

  function renderTime() {
    var ph = phase(S.remaining), c = S.cfg.colors;
    el.timer.textContent = 'Tiempo restante: ' + spokenTime(S.remaining);
    el.progress.style.width = (S.total ? Math.round((1 - S.remaining / S.total) * 1000) / 10 : 0) + '%';
    el.progress.style.background = ph.phase === 0 ? c.green : (ph.phase === 1 ? c.yellow : c.red);
  }

  function renderTimer() {
    var ended = S.remaining <= 0;
    renderTime();
    el.toggleLabel.textContent = S.running ? 'Pausar' : (ended ? 'Reiniciar e iniciar' : (S.remaining < S.total ? 'Continuar' : 'Iniciar'));
    el.iconPause.hidden = !S.running;
    el.iconPlay.hidden = S.running;
    el.status.textContent = ended ? 'Tiempo terminado' : (S.running ? 'En curso' : 'En pausa');
    el.status.dataset.state = ended ? 'ended' : (S.running ? 'running' : 'paused');
  }

  function renderSpeaker() {
    var turns = S.turns, idx = Math.min(S.idx, Math.max(0, turns.length - 1));
    var cur = turns[idx] || { name: '[Sin turnos configurados]', profession: '' };
    var next = turns[idx + 1];
    el.turnLabel.textContent = turns.length ? (idx + 1) + ' de ' + turns.length : '0 de 0';
    el.speakerName.textContent = cur.name;
    el.speakerProf.textContent = cur.profession;
    el.nextLabel.textContent = next ? 'Siguiente: ' + next.name + (next.profession ? ' · ' + next.profession : '') : 'Último turno de la jornada';
    el.nextBtn.disabled = !next;
    el.nextBtn.setAttribute('aria-label', next ? 'Pasar al siguiente turno: ' + next.name : 'Pasar al siguiente turno (no hay más turnos)');
  }

  function renderLook() {
    var cfg = S.cfg, c = cfg.colors;
    el.app.style.background = c.bg;
    el.title.textContent = cfg.title;
    el.subtitle.textContent = cfg.subtitle;
    el.footerText.textContent = cfg.footer;
    document.title = (cfg.title && cfg.title.charAt(0) !== '[' ? cfg.title + ' · ' : '') + 'Contador de exposiciones';

    var logo = safeImageSrc(cfg.logo);
    el.logo.hidden = !logo; el.logoPh.hidden = !!logo;
    if (logo && el.logo.getAttribute('src') !== logo) el.logo.src = logo;
    if (!logo) el.logo.removeAttribute('src');

    var bg = safeImageSrc(cfg.bgImage);
    el.bgImg.hidden = !bg;
    if (bg && el.bgImg.getAttribute('src') !== bg) el.bgImg.src = bg;
    if (!bg) el.bgImg.removeAttribute('src');
    el.bgImg.style.objectFit = cfg.bgFit === 'contain' ? 'contain' : 'cover';
    el.bgImg.style.opacity = String(clamp(cfg.bgOpacity, 5, 100) / 100);

    el.toggleBtn.style.background = c.header;
    el.menuBtn.style.color = c.header;
    el.nextBtn.style.background = c.accent;
    C.sig = '';
    // Los colores de los textos [data-fx] se aplican en cada cuadro (applyBgFx).
    if (fxEls) fxEls.forEach(function (n) { n.dataset.applied = ''; });
    renderTime();
  }

  function renderAll() { renderLook(); renderSpeaker(); renderTimer(); if (S.menuOpen) renderPanel(); }

  /* ---------------- panel de configuración ---------------- */

  var TABS = ['general', 'turns', 'colors', 'sound', 'access'];

  function openMenu() {
    S.menuOpen = true;
    lastFocus = document.activeElement;
    el.overlay.hidden = false;
    el.app.inert = true;
    el.app.setAttribute('aria-hidden', 'true');
    el.menuBtn.setAttribute('aria-expanded', 'true');
    renderPanel();
    $('tab-' + S.tab).focus();
  }
  var lastFocus = null;
  function closeMenu() {
    S.menuOpen = false;
    el.overlay.hidden = true;
    el.app.inert = false;
    el.app.removeAttribute('aria-hidden');
    el.menuBtn.setAttribute('aria-expanded', 'false');
    (lastFocus && document.body.contains(lastFocus) ? lastFocus : el.menuBtn).focus();
  }

  function selectTab(name, focus) {
    S.tab = name;
    TABS.forEach(function (t) {
      var tab = $('tab-' + t), panel = $('panel-' + t), sel = t === name;
      tab.setAttribute('aria-selected', sel ? 'true' : 'false');
      tab.tabIndex = sel ? 0 : -1;
      panel.hidden = !sel;
    });
    if (focus) $('tab-' + name).focus();
    renderPanel();
  }

  function renderPanel() {
    var cfg = S.cfg;
    document.querySelectorAll('[data-cfg]').forEach(function (input) {
      if (input === document.activeElement && input.type !== 'checkbox') return;
      var v = cfg[input.getAttribute('data-cfg')];
      if (input.hasAttribute('data-bool')) input.checked = !!v;
      else if (String(input.value) !== String(v)) input.value = v;
    });
    document.querySelectorAll('[data-color-value]').forEach(function (n) { n.textContent = cfg.colors[n.getAttribute('data-color-value')]; });
    document.querySelectorAll('[data-color-input]').forEach(function (n) { n.value = cfg.colors[n.getAttribute('data-color-input')].toLowerCase(); });
    $('f-bgo-val').textContent = String(cfg.bgOpacity);
    $('bg-options').hidden = !cfg.bgImage;
    $('clear-logo').hidden = !cfg.logo;

    var uploadHint = !S.server.available
      ? 'Sin servidor: la imagen se guarda solo en este navegador.'
      : (S.server.authenticated ? 'Máximo ' + S.server.uploadMb + ' MB.' : 'Inicie sesión (pestaña Acceso) para subir imágenes.');
    document.querySelectorAll('[data-upload-hint]').forEach(function (n) { n.textContent = uploadHint; });
    document.querySelectorAll('[data-upload]').forEach(function (n) { n.disabled = S.server.available && !S.server.authenticated; });

    if (S.tab === 'turns') renderTurnRows();
    if (S.tab === 'colors') renderColorRows();
    renderSoundPanel();
    renderAccess();
    renderSaveState();
  }

  function renderTurnRows() {
    var list = el.turnList, focusId = document.activeElement && document.activeElement.id;
    list.textContent = '';
    S.turns.forEach(function (t, i) {
      var li = document.createElement('li');
      li.className = 'turn';
      var head = document.createElement('div'); head.className = 'turn-head';
      var h4 = document.createElement('h4'); h4.id = 't-head-' + i; h4.textContent = 'Turno ' + (i + 1);
      head.appendChild(h4);
      if (i === S.idx) { var b = document.createElement('span'); b.className = 'badge'; b.textContent = 'En curso'; head.appendChild(b); }
      li.appendChild(head);
      li.setAttribute('aria-labelledby', h4.id);

      li.appendChild(textField('t-name-' + i, 'Nombre del ponente', t.name, 120, function (v) { setTurn(i, 'name', v); }));
      li.appendChild(textField('t-prof-' + i, 'Profesión', t.profession, 120, function (v) { setTurn(i, 'profession', v); }));

      var actions = document.createElement('div'); actions.className = 'turn-actions';
      var minField = document.createElement('div'); minField.className = 'field';
      var ml = document.createElement('label'); ml.htmlFor = 't-min-' + i; ml.textContent = 'Minutos';
      var mi = document.createElement('input');
      mi.id = 't-min-' + i; mi.className = 'input'; mi.type = 'number'; mi.min = '1'; mi.max = '180'; mi.inputMode = 'numeric'; mi.value = t.minutes;
      mi.addEventListener('change', function () { var v = clamp(mi.value, 1, 180); mi.value = v; setTurn(i, 'minutes', v); });
      minField.appendChild(ml); minField.appendChild(mi);
      actions.appendChild(minField);

      actions.appendChild(button('t-go-' + i, 'btn-blue', 'Ir a este turno', null, function () { loadTurn(i, false); renderTurnRows(); announce('Turno ' + (i + 1) + ' seleccionado: ' + t.name + '.'); }));
      actions.appendChild(iconButton('t-up-' + i, 'move', 'Subir turno ' + (i + 1), 'M12 19V5M5 12l7-7 7 7', i === 0, function () { moveTurn(i, -1); }));
      actions.appendChild(iconButton('t-down-' + i, 'move', 'Bajar turno ' + (i + 1), 'M12 5v14M5 12l7 7 7-7', i === S.turns.length - 1, function () { moveTurn(i, 1); }));
      actions.appendChild(iconButton('t-del-' + i, '', 'Eliminar turno ' + (i + 1), 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13', false, function () { removeTurn(i); }));
      li.appendChild(actions);
      list.appendChild(li);
    });
    if (focusId && $(focusId)) $(focusId).focus();
  }

  function textField(id, label, value, max, onInput) {
    var wrap = document.createElement('div'); wrap.className = 'field';
    var l = document.createElement('label'); l.htmlFor = id; l.textContent = label;
    var input = document.createElement('input');
    input.id = id; input.className = 'input'; input.type = 'text'; input.maxLength = max; input.value = value;
    input.addEventListener('input', function () { onInput(input.value); });
    wrap.appendChild(l); wrap.appendChild(input);
    return wrap;
  }
  function button(id, cls, text, label, onClick) {
    var b = document.createElement('button');
    b.type = 'button'; b.id = id; b.className = cls; b.textContent = text;
    if (label) b.setAttribute('aria-label', label);
    b.addEventListener('click', onClick);
    return b;
  }
  function iconButton(id, extra, label, path, disabled, onClick) {
    var b = document.createElement('button');
    b.type = 'button'; b.id = id; b.className = 'icon-sq' + (extra ? ' ' + extra : '');
    b.setAttribute('aria-label', label);
    b.disabled = disabled;
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), p = document.createElementNS(ns, 'path');
    svg.setAttribute('width', '20'); svg.setAttribute('height', '20'); svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    p.setAttribute('d', path);
    svg.appendChild(p); b.appendChild(svg);
    b.addEventListener('click', onClick);
    return b;
  }

  function renderColorRows() {
    var list = el.colorList, c = S.cfg.colors, focusId = document.activeElement && document.activeElement.id;
    list.textContent = '';
    COLOR_ROWS.forEach(function (row) {
      var key = row[0];
      var li = document.createElement('li'); li.className = 'color-row';
      var left = document.createElement('div');
      var l = document.createElement('label'); l.htmlFor = 'c-' + key; l.textContent = row[1];
      left.appendChild(l);
      var hintId = null;
      if (row[2]) {
        var against = row[2].charAt(0) === '#' ? row[2] : c[row[2]];
        var ratio = contrast(c[key], against), pass = ratio >= row[3];
        var small = document.createElement('span');
        hintId = 'c-' + key + '-ratio';
        small.id = hintId; small.className = 'contrast'; small.dataset.pass = pass ? '1' : '0';
        var digits = key === 'green' || key === 'yellow' || key === 'red';
        small.textContent = (pass ? 'Contraste ' : 'Contraste bajo ') + ratio.toFixed(1) + ':1 (mínimo ' + row[3] + ':1)' +
          (!pass && digits && S.cfg.outline ? ' · compensado con el contorno automático' : '');
        left.appendChild(small);
      }
      var right = document.createElement('div'); right.className = 'color-pick';
      var val = document.createElement('span'); val.className = 'mono'; val.textContent = c[key];
      var input = document.createElement('input');
      input.type = 'color'; input.id = 'c-' + key; input.value = c[key].toLowerCase();
      if (hintId) input.setAttribute('aria-describedby', hintId);
      input.addEventListener('input', function () { setColor(key, input.value); val.textContent = input.value.toUpperCase(); });
      input.addEventListener('change', function () { renderColorRows(); });
      right.appendChild(val); right.appendChild(input);
      li.appendChild(left); li.appendChild(right);
      list.appendChild(li);
    });
    if (focusId && $(focusId)) $(focusId).focus();
  }

  function renderSoundPanel() {
    var srv = S.server, key = $('f-key'), hint = $('f-key-hint');
    if (!srv.available) {
      key.disabled = true; key.placeholder = '';
      hint.textContent = 'La voz de ElevenLabs requiere el servidor: la clave nunca se expone en el navegador.';
    } else if (srv.keyLocked) {
      key.disabled = true; key.placeholder = 'Definida en config.php';
      hint.textContent = 'La clave está fijada en la configuración del servidor.';
    } else {
      key.disabled = !srv.authenticated;
      key.placeholder = srv.keySet ? '•••••••• (guardada)' : 'xi-api-key';
      hint.textContent = srv.authenticated ? 'Se guarda en el servidor y nunca se envía al navegador.' : 'Inicie sesión para cambiarla.';
    }
    $('clear-key').hidden = !(srv.available && srv.authenticated && srv.keySet && !srv.keyLocked);
    var ready = srv.available && srv.authenticated && srv.keySet && S.cfg.elVoice;
    $('voice-status').textContent = ready
      ? 'Voz de ElevenLabs configurada. Si la conexión falla, se usa la voz del navegador.'
      : 'Sin credenciales de ElevenLabs activas: se usa la voz del navegador.';
  }

  function renderAccess() {
    var srv = S.server, intro = $('access-intro');
    $('login-form').hidden = !(srv.available && !srv.authenticated && !srv.setupRequired);
    $('setup-form').hidden = !(srv.available && srv.setupRequired && srv.setupEnabled);
    $('logged-box').hidden = !(srv.available && srv.authenticated);
    if (!srv.available) intro.textContent = 'No se detectó el servidor (api.php). Los cambios se guardan solo en este navegador.';
    else if (srv.authenticated) intro.textContent = 'Sesión de administrador activa. Puede guardar cambios en el servidor.';
    else if (srv.setupRequired && srv.setupEnabled) intro.textContent = 'Primer uso: cree la contraseña de administrador con el token definido en config/config.php.';
    else if (srv.setupRequired && srv.setupIssue === 'token_short') intro.textContent = 'El setup_token de config/config.php es demasiado corto: debe tener al menos ' + srv.setupTokenMin + ' caracteres. Alárguelo, recargue esta página y cree la contraseña aquí (o ejecute bin/set-password.php).';
    else if (srv.setupRequired) intro.textContent = 'Falta crear la contraseña de administrador. Defina setup_token (' + srv.setupTokenMin + ' caracteres o más) en config/config.php y recargue la página, o ejecute bin/set-password.php.';
    else intro.textContent = 'Inicie sesión para guardar los cambios en el servidor. Sin sesión, los cambios se aplican solo en esta pantalla.';
  }

  function renderSaveState() {
    var st = el.saveStatus, srv = S.server;
    el.saveBtn.textContent = srv.available && !srv.authenticated ? 'Iniciar sesión para guardar' : 'Guardar cambios';
    if (st.dataset.lock === '1') return;
    if (S.dirty) { st.textContent = 'Cambios sin guardar.'; st.dataset.tone = 'warn'; }
    else { st.textContent = srv.available ? 'Sin cambios pendientes.' : 'Modo sin servidor: se guarda en este navegador.'; st.dataset.tone = 'ok'; }
  }
  function flashStatus(text, tone) {
    var st = el.saveStatus;
    st.textContent = text; st.dataset.tone = tone; st.dataset.lock = '1';
    window.clearTimeout(flashStatus.t);
    flashStatus.t = window.setTimeout(function () { st.dataset.lock = ''; renderSaveState(); }, 5000);
  }

  /* ---------------- cambios de estado ---------------- */

  function markDirty() { S.dirty = true; if (S.menuOpen) renderSaveState(); }
  function setCfg(k, v) { S.cfg[k] = v; markDirty(); renderLook(); }
  function setColor(k, v) { if (!isHex(v)) return; S.cfg.colors[k] = v.toUpperCase(); markDirty(); renderLook(); }
  function setTurn(i, k, v) {
    var t = S.turns[i]; if (!t) return;
    t[k] = v; markDirty();
    if (k === 'minutes' && i === S.idx && !S.running) loadTurn(i, false);
    renderSpeaker();
  }
  function moveTurn(i, d) {
    var j = i + d; if (j < 0 || j >= S.turns.length) return;
    var tmp = S.turns[i]; S.turns[i] = S.turns[j]; S.turns[j] = tmp;
    if (S.idx === i) S.idx = j; else if (S.idx === j) S.idx = i;
    markDirty(); renderSpeaker(); renderTurnRows();
    var target = $((d < 0 ? 't-up-' : 't-down-') + j);
    if (target && target.disabled) target = $('t-go-' + j);
    if (target) target.focus();
    announce('Turno movido a la posición ' + (j + 1) + '.');
  }
  function removeTurn(i) {
    var t = S.turns[i]; if (!t) return;
    if (!window.confirm('¿Eliminar el turno ' + (i + 1) + ' (' + t.name + ')?')) return;
    var wasCurrent = i === S.idx;
    S.turns.splice(i, 1);
    if (i < S.idx) S.idx--;
    S.idx = Math.max(0, Math.min(S.idx, S.turns.length - 1));
    markDirty();
    if (wasCurrent && S.turns.length) loadTurn(S.idx, false);
    renderSpeaker(); renderTurnRows();
    var next = $('t-del-' + Math.min(i, S.turns.length - 1)) || $('add-turn');
    next.focus();
    announce('Turno eliminado.');
  }

  /* ---------------- servidor ---------------- */

  function api(action, opts) {
    opts = opts || {};
    var headers = { 'Accept': 'application/json' };
    var body;
    if (opts.json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.json); }
    if (opts.form) body = opts.form;
    if (opts.method === 'POST' && S.server.csrf) headers['X-CSRF-Token'] = S.server.csrf;
    return fetch(API + '?action=' + encodeURIComponent(action), {
      method: opts.method || 'GET', headers: headers, body: body, credentials: 'same-origin', cache: 'no-store'
    }).then(function (r) {
      if (opts.raw && r.ok) return r.blob();
      return r.json().catch(function () { return { ok: false, message: 'Respuesta inválida del servidor.' }; }).then(function (data) {
        if (!r.ok || !data.ok) { var e = new Error(data.message || 'Error del servidor.'); e.status = r.status; e.data = data; throw e; }
        return data;
      });
    });
  }

  function applyRemoteState(state) {
    if (!state || typeof state !== 'object') return;
    var cfg = defaultCfg();
    var src = state.cfg || {};
    Object.keys(cfg).forEach(function (k) { if (k !== 'colors' && src[k] !== undefined) cfg[k] = src[k]; });
    Object.keys(DEFAULT_COLORS).forEach(function (k) { if (src.colors && isHex(src.colors[k])) cfg.colors[k] = src.colors[k]; });
    S.cfg = cfg;
    if (Array.isArray(state.turns)) {
      S.turns = state.turns.slice(0, 100).map(function (t) {
        return { name: String(t.name || ''), profession: String(t.profession || ''), minutes: clamp(t.minutes, 1, 180) };
      });
    }
    S.idx = Math.min(S.idx, Math.max(0, S.turns.length - 1));
  }

  function applyMeta(data) {
    if (typeof data.rev === 'number') S.server.rev = data.rev;
    if (data.tts) { S.server.keySet = !!data.tts.keySet; S.server.keyLocked = !!data.tts.keyLocked; }
    if (data.limits) { S.server.uploadMb = data.limits.uploadMb; S.server.svg = !!data.limits.svg; }
  }
  function applySession(data) {
    S.server.authenticated = !!data.authenticated;
    S.server.setupRequired = !!data.setupRequired;
    S.server.setupEnabled = !!data.setupEnabled;
    S.server.setupIssue = data.setupIssue || null;
    S.server.setupTokenMin = data.setupTokenMin || 16;
    S.server.csrf = data.csrf || null;
  }

  function loadInitial() {
    return api('state').then(function (data) {
      S.server.available = true;
      applyMeta(data);
      applyRemoteState(data.state);
      return api('session').then(applySession).catch(function () {});
    }).catch(function () {
      S.server.available = false;
      try {
        var raw = window.localStorage.getItem(LOCAL_KEY);
        if (raw) applyRemoteState(JSON.parse(raw));
      } catch (e) { /* almacenamiento local no disponible */ }
    }).then(function () {
      loadTurn(Math.min(S.idx, Math.max(0, S.turns.length - 1)), false);
      flash = 0;
      renderAll();
    });
  }

  function save() {
    if (!S.server.available) {
      try {
        window.localStorage.setItem(LOCAL_KEY, JSON.stringify({ cfg: S.cfg, turns: S.turns }));
        S.dirty = false; flashStatus('Guardado en este navegador.', 'ok');
      } catch (e) {
        flashStatus('No se pudo guardar en el navegador (¿imágenes muy grandes?).', 'error');
      }
      return;
    }
    if (!S.server.authenticated) {
      selectTab('access', true);
      if (!$('login-form').hidden) $('f-pass').focus();
      return;
    }
    var payload = { cfg: S.cfg, turns: S.turns, rev: S.server.rev };
    if (S.pendingKey !== null) payload.secrets = { elKey: S.pendingKey };
    el.saveBtn.disabled = true;
    flashStatus('Guardando…', 'warn');
    api('save', { method: 'POST', json: payload }).then(function (data) {
      applyMeta(data);
      applyRemoteState(data.state);
      S.dirty = false; S.pendingKey = null; $('f-key').value = '';
      renderAll();
      flashStatus('Cambios guardados en el servidor.', 'ok');
      announce('Cambios guardados.');
    }).catch(function (e) {
      if (e.status === 401) { S.server.authenticated = false; S.server.csrf = null; renderPanel(); }
      flashStatus(e.message, 'error');
      announce('Error al guardar: ' + e.message, true);
    }).then(function () { el.saveBtn.disabled = false; });
  }

  function uploadImage(input) {
    var key = input.getAttribute('data-upload');
    var file = input.files && input.files[0];
    if (!file) return;
    var allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (key === 'logo' && S.server.svg) allowed.push('image/svg+xml');
    if (allowed.indexOf(file.type) === -1) { flashStatus('Formato de imagen no permitido.', 'error'); input.value = ''; return; }
    if (file.size > S.server.uploadMb * 1024 * 1024) { flashStatus('La imagen supera ' + S.server.uploadMb + ' MB.', 'error'); input.value = ''; return; }

    if (!S.server.available) {
      if (file.type === 'image/svg+xml') { flashStatus('Sin servidor solo se admiten PNG, JPG, WEBP o GIF.', 'error'); return; }
      var r = new FileReader();
      r.onload = function () { setCfg(key, String(r.result)); renderPanel(); };
      r.readAsDataURL(file);
      return;
    }
    var form = new FormData();
    form.append('file', file);
    flashStatus('Subiendo imagen…', 'warn');
    api('upload', { method: 'POST', form: form }).then(function (data) {
      setCfg(key, data.ref);
      renderPanel();
      flashStatus('Imagen subida. Recuerde guardar los cambios.', 'ok');
    }).catch(function (e) { flashStatus(e.message, 'error'); })
      .then(function () { input.value = ''; });
  }

  /* ---------------- eventos ---------------- */

  function bind() {
    el.toggleBtn.addEventListener('click', function () {
      ensureAudio();
      if (S.running) { S.running = false; renderTimer(); announce('Contador en pausa.'); return; }
      if (S.rem <= 0) { S.rem = S.total; if (!reduceMotion.matches) flash = 1; }
      last = Date.now();
      S.running = true; S.remaining = Math.ceil(S.rem);
      renderTimer();
      announce('Contador en curso. Quedan ' + spokenTime(S.rem) + '.');
    });
    el.resetBtn.addEventListener('click', function () { loadTurn(S.idx, false); announce('Contador reiniciado.'); });
    el.nextBtn.addEventListener('click', function () {
      var next = S.turns[S.idx + 1];
      if (!next) return;
      ensureAudio();
      loadTurn(S.idx + 1, true);
      speak(S.cfg.startPhrase + ' ' + next.name + (next.profession ? ', ' + next.profession : ''));
      announce('Turno ' + (S.idx + 1) + ' de ' + S.turns.length + ': ' + next.name + '.');
      if (el.nextBtn.disabled) el.toggleBtn.focus();
    });

    el.menuBtn.addEventListener('click', openMenu);
    $('close-btn').addEventListener('click', closeMenu);
    el.overlay.addEventListener('mousedown', function (e) { if (e.target === el.overlay) closeMenu(); });
    el.overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
      if (e.key !== 'Tab') return;
      var focusables = Array.prototype.filter.call(
        el.panel.querySelectorAll('button, input, select, [tabindex]:not([tabindex="-1"])'),
        function (n) { return !n.disabled && n.offsetParent !== null && n.tabIndex !== -1; }
      );
      if (!focusables.length) return;
      var first = focusables[0], lastEl = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
    });

    TABS.forEach(function (t, i) {
      var tab = $('tab-' + t);
      tab.addEventListener('click', function () { selectTab(t, false); });
      tab.addEventListener('keydown', function (e) {
        var n = null;
        if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
        else if (e.key === 'ArrowLeft') n = (i - 1 + TABS.length) % TABS.length;
        else if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = TABS.length - 1;
        if (n !== null) { e.preventDefault(); selectTab(TABS[n], true); }
      });
    });

    document.querySelectorAll('[data-cfg]').forEach(function (input) {
      var k = input.getAttribute('data-cfg');
      if (input.hasAttribute('data-bool')) {
        input.addEventListener('change', function () { setCfg(k, input.checked); renderPanel(); });
      } else if (input.hasAttribute('data-num')) {
        var lim = input.getAttribute('data-num').split(',').map(Number);
        input.addEventListener('input', function () {
          var v = Number(input.value);
          if (input.value !== '' && isFinite(v) && v >= lim[0] && v <= lim[1]) setCfg(k, Math.round(v));
          if (k === 'bgOpacity') $('f-bgo-val').textContent = String(S.cfg.bgOpacity);
        });
        input.addEventListener('change', function () { var v = clamp(input.value, lim[0], lim[1]); input.value = v; setCfg(k, v); });
      } else {
        input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', function () { setCfg(k, input.value); });
      }
    });
    document.querySelectorAll('[data-color-input]').forEach(function (input) {
      input.addEventListener('input', function () { setColor(input.getAttribute('data-color-input'), input.value); renderPanel(); });
    });
    document.querySelectorAll('[data-upload]').forEach(function (input) {
      input.addEventListener('change', function () { uploadImage(input); });
    });

    $('apply-minutes').addEventListener('click', function () {
      var m = clamp(S.cfg.minutes, 1, 180);
      S.turns.forEach(function (t) { t.minutes = m; });
      markDirty(); loadTurn(S.idx, false);
      announce('Se aplicaron ' + m + ' minutos a todos los turnos.');
    });
    $('clear-bg').addEventListener('click', function () { setCfg('bgImage', ''); renderPanel(); $('f-bgi').focus(); });
    $('clear-logo').addEventListener('click', function () { setCfg('logo', ''); renderPanel(); $('f-logo').focus(); });
    $('add-turn').addEventListener('click', function () {
      if (S.turns.length >= 100) { flashStatus('Máximo 100 turnos.', 'error'); return; }
      S.turns.push({ name: '[Nombre del ponente ' + (S.turns.length + 1) + ']', profession: '[Profesión]', minutes: clamp(S.cfg.minutes, 1, 180) });
      markDirty(); renderSpeaker(); renderTurnRows();
      $('t-name-' + (S.turns.length - 1)).focus();
      announce('Turno ' + S.turns.length + ' agregado.');
    });
    $('reset-colors').addEventListener('click', function () { S.cfg.colors = Object.assign({}, DEFAULT_COLORS); markDirty(); renderLook(); renderPanel(); announce('Colores institucionales restablecidos.'); });

    // Campo vacío = no cambiar la clave guardada; para borrarla se usa el botón dedicado.
    $('f-key').addEventListener('input', function () { S.pendingKey = this.value.trim() || null; markDirty(); });
    $('clear-key').addEventListener('click', function () { S.pendingKey = ''; markDirty(); flashStatus('La clave se borrará al guardar.', 'warn'); });
    $('test-end').addEventListener('click', function () { ensureAudio(); if (S.cfg.sound) chimeEnd(); window.setTimeout(function () { speak(S.cfg.endPhrase); }, 1300); });
    $('test-start').addEventListener('click', function () {
      ensureAudio();
      var cur = S.turns[S.idx] || { name: '', profession: '' };
      speak(S.cfg.startPhrase + ' ' + cur.name + (cur.profession ? ', ' + cur.profession : ''));
    });

    var accessMsg = $('access-msg');
    $('login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var pass = $('f-pass');
      accessMsg.textContent = '';
      if (!pass.value) { accessMsg.textContent = 'Escriba la contraseña.'; pass.focus(); return; }
      api('login', { method: 'POST', json: { password: pass.value } }).then(function (data) {
        pass.value = ''; applySession(data); renderPanel();
        announce('Sesión iniciada.');
        el.saveBtn.focus();
      }).catch(function (err) { accessMsg.textContent = err.message; pass.focus(); });
    });
    $('setup-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var token = $('f-token'), p1 = $('f-newpass'), p2 = $('f-newpass2');
      accessMsg.textContent = '';
      if (p1.value.length < 12) { accessMsg.textContent = 'La contraseña debe tener al menos 12 caracteres.'; p1.focus(); return; }
      if (p1.value !== p2.value) { accessMsg.textContent = 'Las contraseñas no coinciden.'; p2.focus(); return; }
      api('setup', { method: 'POST', json: { token: token.value, password: p1.value } }).then(function (data) {
        token.value = p1.value = p2.value = '';
        applySession(data); renderPanel();
        announce('Contraseña creada y sesión iniciada.');
        el.saveBtn.focus();
      }).catch(function (err) { accessMsg.textContent = err.message; });
    });
    $('logout-btn').addEventListener('click', function () {
      api('logout', { method: 'POST' }).catch(function () {}).then(function () {
        S.server.authenticated = false; S.server.csrf = null; renderPanel();
        announce('Sesión cerrada.');
        $('tab-access').focus();
      });
    });

    el.saveBtn.addEventListener('click', save);
    window.addEventListener('beforeunload', function (e) {
      if (S.dirty) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  /* ---------------- arranque ---------------- */

  function start() {
    ['app', 'canvas', 'counter', 'fallback', 'timer', 'status', 'title', 'subtitle', 'logo', 'overlay', 'announcer', 'alerter']
      .forEach(function (id) { el[id] = $(id); });
    el.bgImg = $('bg-img'); el.fxBase = $('fx-base'); el.fxBand = $('fx-band'); el.logoPh = $('logo-ph');
    el.menuBtn = $('menu-btn'); el.toggleBtn = $('toggle-btn'); el.toggleLabel = $('toggle-label');
    el.iconPause = $('icon-pause'); el.iconPlay = $('icon-play'); el.resetBtn = $('reset-btn'); el.nextBtn = $('next-btn');
    el.turnLabel = $('turn-label'); el.speakerName = $('speaker-name'); el.speakerProf = $('speaker-prof');
    el.footerText = $('footer-text'); el.nextLabel = $('next-label'); el.progress = $('progress-bar');
    el.panel = $('settings'); el.turnList = $('turn-list'); el.colorList = $('color-list');
    el.saveBtn = $('save-btn'); el.saveStatus = $('save-status');

    bind();
    renderAll();
    initCanvas();
    window.setInterval(tick, 200);
    loadInitial();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
