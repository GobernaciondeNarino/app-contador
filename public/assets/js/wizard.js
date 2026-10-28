/* Asistente de instalación y configuración del Contador de exposiciones.
 * app.js lo abre al iniciar si el sistema no está instalado (sin administrador o sin configuración guardada)
 * y desde el menú (pestaña Acceso). Trabaja sobre una copia de la configuración: si se omite, no cambia nada.
 * Todo texto de usuario se pinta con textContent. */
(function () {
  'use strict';

  var STEPS = [
    ['check', 'Servidor', 'Verificación del servidor'],
    ['admin', 'Administrador', 'Cuenta de administrador'],
    ['event', 'Evento', 'Datos del evento'],
    ['times', 'Tiempos', 'Tiempos y alertas'],
    ['turns', 'Ponentes', 'Ponentes y orden'],
    ['voice', 'Voz', 'Sonido y voz'],
    ['summary', 'Resumen', 'Resumen y guardado']
  ];
  var STATUS_TEXT = { ok: 'Correcto', warn: 'Advertencia', error: 'Error', pending: 'Verificando' };
  var STATUS_ICON = { ok: '✓', warn: '!', error: '✕', pending: '…' };

  function create(ctx) {
    var S = ctx.S;
    var $ = function (id) { return document.getElementById(id); };
    var root = $('wizard'), form = $('wz-form'), errorBox = $('wz-error');
    var step = 0, draft = null, pendingKey = null, checksOk = false, busy = false, lastFocus = null;

    /* ---------- utilidades ---------- */

    function placeholder(v) { return typeof v === 'string' && /^\[.*\]$/.test(v.trim()); }
    function clean(v) { return placeholder(v) ? '' : String(v || ''); }
    function el(tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text !== undefined) n.textContent = text;
      return n;
    }
    function fmtSeconds(s) {
      var m = Math.floor(s / 60), r = s % 60;
      return m + ':' + (r < 10 ? '0' : '') + r;
    }
    function clearErrors() {
      errorBox.textContent = '';
      form.querySelectorAll('[aria-invalid="true"]').forEach(function (n) {
        n.removeAttribute('aria-invalid');
        var d = (n.getAttribute('aria-describedby') || '').split(' ').filter(function (x) { return x !== 'wz-error'; }).join(' ');
        if (d) n.setAttribute('aria-describedby', d); else n.removeAttribute('aria-describedby');
      });
    }
    function showError(msg, field) {
      errorBox.textContent = msg;
      if (field) {
        field.setAttribute('aria-invalid', 'true');
        var d = field.getAttribute('aria-describedby');
        field.setAttribute('aria-describedby', (d ? d + ' ' : '') + 'wz-error');
        field.focus();
      }
      return false;
    }
    function setBusy(on, label) {
      busy = on;
      $('wz-next').disabled = on;
      $('wz-back').disabled = on || step === 0;
      if (label) $('wz-next').textContent = label;
    }

    /* ---------- apertura y cierre ---------- */

    function open(opts) {
      opts = opts || {};
      draft = {
        cfg: JSON.parse(JSON.stringify(S.cfg)),
        turns: S.turns.filter(function (t) { return !placeholder(t.name); }).map(function (t) { return Object.assign({}, t); })
      };
      if (!draft.turns.length) draft.turns.push({ name: '', profession: '', minutes: ctx.clamp(draft.cfg.minutes, 1, 180) });
      pendingKey = null;
      lastFocus = document.activeElement;
      root.hidden = false;
      ctx.setAppInert(true);
      buildStepList();
      fillFields();
      go(opts.start ? indexOf(opts.start) : 0);
    }

    function close(message) {
      root.hidden = true;
      ctx.setAppInert(false);
      if (message) ctx.announce(message);
      var target = lastFocus && document.body.contains(lastFocus) && !root.contains(lastFocus) && lastFocus.offsetParent !== null ? lastFocus : $('toggle-btn');
      target.focus();
    }

    function indexOf(id) {
      for (var i = 0; i < STEPS.length; i++) if (STEPS[i][0] === id) return i;
      return 0;
    }

    /* ---------- navegación ---------- */

    function buildStepList() {
      var list = $('wz-steps');
      list.textContent = '';
      STEPS.forEach(function (s, i) {
        var li = el('li');
        li.id = 'wz-step-' + s[0];
        li.appendChild(el('span', '', (i + 1) + '. ' + s[1]));
        list.appendChild(li);
      });
    }

    function go(i) {
      clearErrors();
      step = Math.max(0, Math.min(STEPS.length - 1, i));
      var id = STEPS[step][0];
      form.querySelectorAll('.wz-step').forEach(function (sec) { sec.hidden = sec.getAttribute('data-step') !== id; });
      STEPS.forEach(function (s, j) {
        var li = $('wz-step-' + s[0]);
        if (j === step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
        li.dataset.state = j < step ? 'done' : '';
      });
      $('wz-title').textContent = STEPS[step][2];
      $('wz-progress').textContent = 'Paso ' + (step + 1) + ' de ' + STEPS.length + ': ' + STEPS[step][1];
      $('wz-back').disabled = step === 0;
      $('wz-next').textContent = id === 'summary' ? 'Guardar y abrir el contador' : 'Siguiente';
      $('wz-next').disabled = false;
      enter[id]();
      $('wz-title').focus();
    }

    var enter = {
      check: runChecks,
      admin: renderAdmin,
      event: renderLogo,
      times: renderTimesExample,
      turns: renderTurns,
      voice: renderVoice,
      summary: renderSummary
    };

    var leave = {
      check: function () {
        if (!checksOk) return Promise.resolve(showError('Corrija los errores marcados antes de continuar y pulse «Volver a verificar».'));
        return Promise.resolve(true);
      },
      admin: submitAdmin,
      event: function () {
        readCfgInputs();
        if (!draft.cfg.title.trim()) return Promise.resolve(showError('Escriba el nombre del evento.', $('wz-title-in')));
        return Promise.resolve(true);
      },
      times: function () {
        readCfgInputs();
        var c = draft.cfg;
        if (c.redAt >= c.yellowAt) return Promise.resolve(showError('El amarillo debe empezar antes que el rojo: «Amarillo desde» tiene que ser mayor que «Rojo desde».', $('wz-yel')));
        return Promise.resolve(true);
      },
      turns: function () {
        readTurns();
        var filled = draft.turns.filter(function (t) { return t.name.trim(); });
        if (!filled.length) return Promise.resolve(showError('Agregue al menos un ponente con nombre.', $('wz-t-name-0')));
        for (var i = 0; i < draft.turns.length; i++) {
          if (!draft.turns[i].name.trim()) return Promise.resolve(showError('Escriba el nombre del ponente ' + (i + 1) + ' o elimine esa fila.', $('wz-t-name-' + i)));
        }
        return Promise.resolve(true);
      },
      voice: function () {
        draft.cfg.sound = $('wz-sound').checked;
        draft.cfg.voice = $('wz-voice').checked;
        draft.cfg.elVoice = $('wz-voice-id').value.trim();
        var key = $('wz-key').value.trim();
        pendingKey = key || null;
        if (draft.cfg.elVoice && !/^[A-Za-z0-9_-]+$/.test(draft.cfg.elVoice)) return Promise.resolve(showError('El ID de voz solo admite letras, números, guion y guion bajo.', $('wz-voice-id')));
        if (key && !/^[A-Za-z0-9_-]{10,200}$/.test(key)) return Promise.resolve(showError('La API key tiene un formato no válido.', $('wz-key')));
        return Promise.resolve(true);
      },
      summary: saveAll
    };

    function next() {
      if (busy) return;
      clearErrors();
      var id = STEPS[step][0];
      leave[id]().then(function (ok) {
        if (ok && id !== 'summary') go(step + 1);
      });
    }

    /* ---------- paso 1: verificación ---------- */

    function checkItem(status, label, detail) {
      var li = el('li', 'wz-check');
      li.dataset.status = status;
      var icon = el('span', 'icon', STATUS_ICON[status]);
      icon.setAttribute('aria-hidden', 'true');
      li.appendChild(icon);
      li.appendChild(el('strong', '', label));
      li.appendChild(el('span', 'tag', STATUS_TEXT[status]));
      li.appendChild(el('span', 'detail', detail));
      return li;
    }

    function runChecks() {
      var list = $('wz-checks');
      checksOk = false;
      list.textContent = '';
      list.setAttribute('aria-busy', 'true');
      list.appendChild(checkItem('pending', 'Servidor', 'Consultando requisitos…'));
      setBusy(true);
      ctx.api('install_check').then(function (data) {
        list.textContent = '';
        var errors = 0;
        data.checks.forEach(function (c) {
          if (c.status === 'error') errors++;
          list.appendChild(checkItem(c.status, c.label, c.detail));
        });
        return probeStorage(data.probe).then(function (exposed) {
          if (exposed) errors++;
          list.appendChild(checkItem(exposed ? 'error' : 'ok', 'Datos protegidos de internet',
            exposed ? 'La carpeta storage/ se puede descargar desde el navegador. Apunte la raíz del documento de Plesk a public/ o verifique los archivos .htaccess / web.config.'
              : 'La carpeta storage/ no es accesible por web'));
          checksOk = errors === 0;
          ctx.announce(checksOk ? 'Verificación completada sin errores.' : 'Verificación con ' + errors + ' error(es).');
        });
      }).catch(function (e) {
        list.textContent = '';
        if (e.status === 403) {
          list.appendChild(checkItem('ok', 'Sistema instalado', 'El servidor ya fue verificado durante la instalación. Inicie sesión para continuar.'));
          checksOk = true;
        } else {
          list.appendChild(checkItem('error', 'Servidor', e.message || 'No se pudo consultar api.php.'));
        }
      }).then(function () {
        list.removeAttribute('aria-busy');
        setBusy(false, 'Siguiente');
      });
    }

    /** Intenta descargar el archivo de prueba desde las rutas donde quedaría storage/ si estuviera expuesta. */
    function probeStorage(value) {
      if (!value) return Promise.resolve(false);
      var urls = ['storage/install-probe.txt', '../storage/install-probe.txt'];
      return Promise.all(urls.map(function (u) {
        return fetch(u, { cache: 'no-store', credentials: 'omit' })
          .then(function (r) { return r.ok ? r.text() : ''; })
          .then(function (t) { return t.trim() === value; })
          .catch(function () { return false; });
      })).then(function (res) { return res.some(Boolean); });
    }

    /* ---------- paso 2: administrador ---------- */

    function renderAdmin() {
      var srv = S.server;
      $('wz-setup').hidden = !(srv.setupRequired && !srv.authenticated);
      $('wz-login').hidden = !(!srv.setupRequired && !srv.authenticated);
      $('wz-admin-done').hidden = !srv.authenticated;
      var help = $('wz-token-help');
      help.textContent = '';
      if (srv.tokenSource === 'config') {
        help.appendChild(document.createTextNode('Escriba el valor de '));
        help.appendChild(el('code', '', 'setup_token'));
        help.appendChild(document.createTextNode(' que definió en '));
        help.appendChild(el('code', '', 'config/config.php'));
        help.appendChild(document.createTextNode('.'));
      } else if (srv.tokenSource === 'file') {
        help.appendChild(document.createTextNode('Por seguridad, el servidor generó un token que solo puede leer quien administra el hosting. En Plesk abra el Administrador de archivos, entre a '));
        help.appendChild(el('code', '', 'storage/setup-token.php'));
        help.appendChild(document.createTextNode(' y copie el código que aparece después de «TOKEN:». Si tiene SSH, también puede ejecutar '));
        help.appendChild(el('code', '', 'php bin/set-password.php'));
        help.appendChild(document.createTextNode(' y recargar esta página.'));
      } else {
        help.textContent = 'No se pudo generar el token de instalación: revise los permisos de escritura de storage/ (paso 1) o ejecute php bin/set-password.php por SSH.';
      }
    }

    function submitAdmin() {
      var srv = S.server;
      if (srv.authenticated) return Promise.resolve(true);
      if (srv.setupRequired) {
        var token = $('wz-token'), p1 = $('wz-pass1'), p2 = $('wz-pass2');
        if (!token.value.trim()) return Promise.resolve(showError('Escriba el token de instalación.', token));
        if (p1.value.length < 12) return Promise.resolve(showError('La contraseña debe tener al menos 12 caracteres.', p1));
        if (p1.value !== p2.value) return Promise.resolve(showError('Las contraseñas no coinciden.', p2));
        setBusy(true);
        return ctx.api('setup', { method: 'POST', json: { token: token.value.trim(), password: p1.value } }).then(function (data) {
          ctx.applySession(data);
          token.value = p1.value = p2.value = '';
          ctx.announce('Contraseña creada. Sesión de administrador iniciada.');
          return true;
        }).catch(function (e) {
          return showError(e.message, e.data && e.data.error === 'weak_password' ? p1 : token);
        }).then(function (ok) { setBusy(false); return ok; });
      }
      var pass = $('wz-loginpass');
      if (!pass.value) return Promise.resolve(showError('Escriba la contraseña.', pass));
      setBusy(true);
      return ctx.api('login', { method: 'POST', json: { password: pass.value } }).then(function (data) {
        ctx.applySession(data);
        pass.value = '';
        ctx.announce('Sesión iniciada.');
        return true;
      }).catch(function (e) { return showError(e.message, pass); })
        .then(function (ok) { setBusy(false); return ok; });
    }

    /* ---------- pasos 3 a 6 ---------- */

    function fillFields() {
      var c = draft.cfg;
      $('wz-title-in').value = clean(c.title);
      $('wz-sub-in').value = clean(c.subtitle);
      $('wz-foot-in').value = clean(c.footer);
      $('wz-bg').value = c.colors.bg.toLowerCase();
      $('wz-min').value = c.minutes;
      $('wz-yel').value = c.yellowAt;
      $('wz-red').value = c.redAt;
      $('wz-fx').value = c.fxTarget;
      $('wz-sound').checked = !!c.sound;
      $('wz-voice').checked = !!c.voice;
      $('wz-voice-id').value = c.elVoice || '';
      $('wz-key').value = '';
      $('wz-showpass').checked = false;
      ['wz-pass1', 'wz-pass2'].forEach(function (id) { $(id).type = 'password'; });
    }

    function readCfgInputs() {
      var c = draft.cfg;
      c.title = $('wz-title-in').value.trim();
      c.subtitle = $('wz-sub-in').value.trim();
      c.footer = $('wz-foot-in').value.trim();
      if (ctx.isHex($('wz-bg').value)) c.colors.bg = $('wz-bg').value.toUpperCase();
      form.querySelectorAll('[data-wz-num]').forEach(function (input) {
        var p = input.getAttribute('data-wz-num').split(',');
        c[p[0]] = ctx.clamp(input.value, Number(p[1]), Number(p[2]));
        input.value = c[p[0]];
      });
      c.fxTarget = $('wz-fx').value === 'bg' ? 'bg' : 'text';
    }

    function renderLogo() {
      var src = ctx.safeImageSrc(draft.cfg.logo);
      $('wz-logo-box').hidden = !src;
      if (src) $('wz-logo-img').src = src; else $('wz-logo-img').removeAttribute('src');
      $('wz-logo-hint').textContent = 'Opcional. Máximo ' + S.server.uploadMb + ' MB. Se muestra arriba a la izquierda.';
    }

    function uploadLogo() {
      var input = $('wz-logo'), file = input.files && input.files[0];
      if (!file) return;
      var allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
      if (S.server.svg) allowed.push('image/svg+xml');
      if (allowed.indexOf(file.type) === -1) { input.value = ''; showError('Formato de imagen no permitido.', input); return; }
      if (file.size > S.server.uploadMb * 1024 * 1024) { input.value = ''; showError('La imagen supera ' + S.server.uploadMb + ' MB.', input); return; }
      clearErrors();
      var data = new FormData();
      data.append('file', file);
      $('wz-logo-hint').textContent = 'Subiendo imagen…';
      ctx.api('upload', { method: 'POST', form: data }).then(function (res) {
        draft.cfg.logo = res.ref;
        renderLogo();
        ctx.announce('Logo cargado.');
      }).catch(function (e) { renderLogo(); showError(e.message, input); })
        .then(function () { input.value = ''; });
    }

    function renderTimesExample() {
      var m = ctx.clamp($('wz-min').value, 1, 180), y = ctx.clamp($('wz-yel').value, 10, 10800), r = ctx.clamp($('wz-red').value, 5, 10800);
      $('wz-times-example').textContent = 'Con ' + m + (m === 1 ? ' minuto' : ' minutos') + ' por turno, el contador se ve verde hasta ' +
        fmtSeconds(Math.min(y, m * 60)) + ', amarillo hasta ' + fmtSeconds(Math.min(r, m * 60)) + ' y rojo desde ahí hasta 0:00.';
    }

    function readTurns() {
      draft.turns.forEach(function (t, i) {
        t.name = $('wz-t-name-' + i).value.trim();
        t.profession = $('wz-t-prof-' + i).value.trim();
        t.minutes = ctx.clamp($('wz-t-min-' + i).value, 1, 180);
      });
    }

    function field(id, label, value, type, attrs) {
      var wrap = el('div', 'field');
      var l = el('label', '', label); l.htmlFor = id;
      var input = el('input', 'input');
      input.id = id; input.type = type; input.value = value;
      Object.keys(attrs || {}).forEach(function (k) { input.setAttribute(k, attrs[k]); });
      wrap.appendChild(l); wrap.appendChild(input);
      return wrap;
    }

    function renderTurns(focusId) {
      var list = $('wz-turns');
      list.textContent = '';
      draft.turns.forEach(function (t, i) {
        var li = el('li', 'turn');
        var h = el('h4', '', 'Ponente ' + (i + 1));
        h.id = 'wz-t-head-' + i;
        var head = el('div', 'turn-head'); head.appendChild(h);
        li.setAttribute('aria-labelledby', h.id);
        li.appendChild(head);
        li.appendChild(field('wz-t-name-' + i, 'Nombre', t.name, 'text', { maxlength: '120', autocomplete: 'off' }));
        li.appendChild(field('wz-t-prof-' + i, 'Profesión o cargo', t.profession, 'text', { maxlength: '120', autocomplete: 'off' }));
        var actions = el('div', 'turn-actions');
        actions.appendChild(field('wz-t-min-' + i, 'Minutos', t.minutes, 'number', { min: '1', max: '180', inputmode: 'numeric' }));
        var del = el('button', 'btn-plain', 'Eliminar');
        del.type = 'button'; del.id = 'wz-t-del-' + i;
        del.setAttribute('aria-label', 'Eliminar ponente ' + (i + 1));
        del.disabled = draft.turns.length === 1;
        del.addEventListener('click', function () {
          readTurns();
          draft.turns.splice(i, 1);
          renderTurns('wz-t-del-' + Math.min(i, draft.turns.length - 1));
          if (draft.turns.length === 1) $('wz-add-turn').focus();
          ctx.announce('Ponente eliminado. Quedan ' + draft.turns.length + '.');
        });
        actions.appendChild(del);
        li.appendChild(actions);
        list.appendChild(li);
      });
      if (typeof focusId === 'string' && $(focusId) && !$(focusId).disabled) $(focusId).focus();
    }

    function renderVoice() {
      var srv = S.server, key = $('wz-key'), hint = $('wz-key-hint');
      if (srv.keyLocked) {
        key.disabled = true; key.placeholder = 'Definida en config.php';
        hint.textContent = 'La API key ya está configurada en el servidor (config/config.php).';
      } else {
        key.disabled = false;
        key.placeholder = srv.keySet ? '•••••••• (guardada; escriba otra para reemplazarla)' : 'xi-api-key';
        hint.textContent = 'Se guarda en el servidor y nunca se envía al navegador.';
      }
    }

    /* ---------- paso 7: resumen y guardado ---------- */

    function renderSummary() {
      var c = draft.cfg, dl = $('wz-summary');
      dl.textContent = '';
      var row = function (term, value) {
        dl.appendChild(el('dt', '', term));
        var dd = el('dd');
        if (value instanceof Node) dd.appendChild(value); else dd.textContent = value;
        dl.appendChild(dd);
      };
      row('Evento', c.title);
      if (c.subtitle) row('Lugar y fecha', c.subtitle);
      if (c.footer) row('Texto inferior', c.footer);
      row('Logo', c.logo ? 'Cargado' : 'Sin logo');
      row('Color de fondo', c.colors.bg);
      row('Tiempos', c.minutes + ' min por turno · amarillo desde ' + fmtSeconds(c.yellowAt) + ' · rojo desde ' + fmtSeconds(c.redAt));
      row('Efecto de la franja', c.fxTarget === 'bg' ? 'En el fondo' : 'En los números');
      var ol = el('ol');
      draft.turns.forEach(function (t) {
        ol.appendChild(el('li', '', t.name + (t.profession ? ' · ' + t.profession : '') + ' (' + t.minutes + ' min)'));
      });
      row('Ponentes (' + draft.turns.length + ')', ol);
      row('Alertas', (c.sound ? 'Sonido activado' : 'Sin sonido') + ' · ' + (c.voice ? 'voz activada' : 'sin voz'));
      var tts = (pendingKey || S.server.keySet) && c.elVoice ? 'ElevenLabs' : 'Voz del navegador';
      row('Voz', tts);
    }

    function saveAll() {
      var payload = { cfg: draft.cfg, turns: draft.turns, rev: S.server.rev };
      if (pendingKey) payload.secrets = { elKey: pendingKey };
      setBusy(true, 'Guardando…');
      return ctx.api('save', { method: 'POST', json: payload }).then(function (data) {
        ctx.applyMeta(data);
        ctx.applyRemoteState(data.state);
        S.server.hasState = true;
        S.dirty = false;
        ctx.loadTurn(0, false);
        ctx.renderAll();
        close('Instalación completada. El contador está listo con el primer ponente.');
        return true;
      }).catch(function (e) {
        setBusy(false, 'Guardar y abrir el contador');
        if (e.status === 401) {
          S.server.authenticated = false;
          showError('La sesión expiró. Vuelva al paso 2 para iniciar sesión.');
        } else {
          showError(e.message + (e.data && e.data.field ? ' (campo: ' + e.data.field + ')' : ''));
        }
        return false;
      });
    }

    /* ---------- eventos ---------- */

    form.addEventListener('submit', function (e) { e.preventDefault(); next(); });
    $('wz-back').addEventListener('click', function () { if (!busy && step > 0) { readStep(); go(step - 1); } });
    $('wz-skip').addEventListener('click', function () {
      try { window.sessionStorage.setItem('contador-wizard-omitido', '1'); } catch (err) { /* sin almacenamiento */ }
      close('Asistente omitido. Puede abrirlo desde el menú, pestaña Acceso.');
    });
    $('wz-recheck').addEventListener('click', runChecks);
    $('wz-logo').addEventListener('change', uploadLogo);
    $('wz-logo-clear').addEventListener('click', function () { draft.cfg.logo = ''; renderLogo(); $('wz-logo').focus(); ctx.announce('Logo quitado.'); });
    $('wz-add-turn').addEventListener('click', function () {
      if (draft.turns.length >= 100) { showError('Máximo 100 ponentes.'); return; }
      readTurns();
      var mins = ctx.clamp($('wz-min').value, 1, 180);
      draft.turns.push({ name: '', profession: '', minutes: mins });
      renderTurns('wz-t-name-' + (draft.turns.length - 1));
      ctx.announce('Ponente ' + draft.turns.length + ' agregado.');
    });
    $('wz-showpass').addEventListener('change', function () {
      var t = this.checked ? 'text' : 'password';
      ['wz-pass1', 'wz-pass2'].forEach(function (id) { $(id).type = t; });
    });
    ['wz-min', 'wz-yel', 'wz-red'].forEach(function (id) { $(id).addEventListener('input', renderTimesExample); });
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = Array.prototype.filter.call(form.querySelectorAll('button, input, select, [tabindex]:not([tabindex="-1"])'),
        function (n) { return !n.disabled && n.offsetParent !== null; });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });

    /** Conserva lo escrito al retroceder sin validar. */
    function readStep() {
      var id = STEPS[step][0];
      if (id === 'event' || id === 'times') readCfgInputs();
      if (id === 'turns') readTurns();
    }

    return { open: open, isOpen: function () { return !root.hidden; } };
  }

  window.ContadorWizard = { create: create };
})();
