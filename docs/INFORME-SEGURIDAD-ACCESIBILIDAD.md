# Informe de pruebas de seguridad y accesibilidad

**Aplicación:** Contador de exposiciones — Gobernación de Nariño
**Versión evaluada:** 1.1.1 (rama `claude/dreamy-edison-c86vkv`)
**Fecha:** 27 de octubre de 2026
**Alcance:** frontend (`public/index.html`, `assets/`), API PHP (`public/api.php`, `src/`), configuración de servidor para Plesk (`.htaccess`, `web.config`, `.user.ini`).
**Marco de referencia:** OWASP Top 10 (2021) y OWASP ASVS 4.0 nivel 1; WCAG 2.1 y 2.2 nivel AA, exigido por la Resolución 1519 de 2020 de MinTIC (Anexo 1) para sitios de entidades públicas; NTC 5854.

---

## 1. Resumen

| Prueba | Herramienta | Resultado |
|---|---|---|
| Seguridad de la API (44 casos) | `node:test` contra un servidor PHP real con datos temporales, incluido un despliegue en subdirectorio con reescritura | **44/44 aprobadas** |
| Revisión estática y unitaria (8 casos) | `tests/static.test.mjs`, `tests/php/client-ip.php` | **8/8 aprobadas** |
| Análisis estático (SAST) | Semgrep 127 reglas (`p/php`, `p/javascript`, `p/secrets`) | 3 avisos, **falsos positivos** verificados (ver 3.3) |
| Dependencias | `npm audit` | 0 vulnerabilidades (en producción no hay dependencias de terceros) |
| Accesibilidad automática | axe-core 4.10 (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`) en 16 vistas (incluye los 7 pasos del asistente) | **0 violaciones** |
| Accesibilidad funcional (12 casos) | Playwright: teclado, foco, lector de pantalla, reflujo, movimiento reducido, contraste, asistente de instalación | **12/12 aprobadas** |
| **Total** | `npm test` | **72/72 aprobadas** |

Ejecutar: `npm install && npm test` (requiere PHP 7.4+, Node 20+ y Playwright con Chromium).

---

## 2. Hallazgos en el diseño original y corrección aplicada

El archivo exportado (`design/Main.dc.html`) era una maqueta de una herramienta de diseño, no apta para producción. Estos fueron los problemas encontrados:

### Seguridad

| # | Hallazgo en la maqueta | Riesgo | Corrección |
|---|---|---|---|
| S1 | La API key de ElevenLabs se escribía en el navegador y se enviaba desde el cliente (`fetch` directo a `api.elevenlabs.io` con `xi-api-key`) | **Alto**: cualquiera con acceso a la pantalla o a las herramientas del navegador podía copiar la clave y consumir el saldo | La clave se guarda en el servidor (`storage/secrets.json` o `config.php`) y la voz se pide a través de `api.php?action=tts`, solo con sesión de administrador y con límite de 40 peticiones / 10 min. La clave nunca vuelve al navegador |
| S2 | Sin persistencia: todo se perdía al recargar | Operativo | Almacenamiento JSON en el servidor con escritura atómica, bloqueo de archivo, copia `.bak` y control de concurrencia (`rev`) |
| S3 | Sin autenticación: cualquier persona podía cambiar la configuración | Alto (en cuanto se agrega persistencia) | Contraseña de administrador con `password_hash` (bcrypt/argon2), sesión con cookie `HttpOnly` + `SameSite=Strict` + `Secure` en HTTPS, regeneración de ID al iniciar sesión, expiración por inactividad |
| S4 | Imágenes como `data:` URL sin validar | Medio | Subida validada en servidor: tipo real con `finfo`, `getimagesize`, límite de tamaño, nombre aleatorio de 128 bits, almacenamiento fuera de la raíz web. SVG solo si no tiene scripts, eventos, `foreignObject`, entidades XML ni referencias externas, y se sirve con `CSP: sandbox` |
| S5 | Dependencias pesadas cargadas sin integridad: React, un runtime de diseño y Three.js (≈ 800 KB) | Medio (cadena de suministro) | Reescrito en JavaScript sin dependencias (≈ 47 KB sin minificar). El contador WebGL se reemplazó por Canvas 2D con el mismo efecto visual |
| S6 | Fuentes cargadas desde Google Fonts | Bajo (privacidad, Ley 1581 de 2012) | Fuentes Hind Madurai y Nunito Sans autoalojadas (licencia OFL incluida) |
| S7 | Sin cabeceras de seguridad | Medio | CSP estricta sin `unsafe-inline`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP, HSTS |

### Accesibilidad

| # | Hallazgo en la maqueta | Criterio WCAG | Corrección |
|---|---|---|---|
| A1 | Texto blanco sobre la franja amarilla (`#FFFFFF` / `#FFD500` = 1,4:1) | 1.4.3 Contraste (AA) | Color por defecto del texto sobre amarillo cambiado a negro (14,8:1) |
| A2 | Etiqueta "Ponente en turno" en verde `#10A13B` a 13 px (3,4:1) | 1.4.3 | Nuevo color `label` = `#0B7A2C` (5,5:1, tono oscuro del verde institucional) y 14 px en negrita. El verde institucional se mantiene en el botón y los números |
| A3 | Insignia "En curso" blanco sobre `#10A13B` (3,4:1) | 1.4.3 | Fondo `#0B7A2C` (5,5:1) |
| A4 | Números amarillos sobre fondo blanco (1,4:1) | 1.4.11 / 1.4.3 | Contorno automático (negro o blanco según el fondo) cuando algún color de los números contrasta menos de 3:1. Desactivable en *General* |
| A5 | Bordes de campos y botones `#B8C0BC` sobre blanco (1,9:1) | 1.4.11 Contraste no textual | Bordes `#767F7B` (4,1:1) |
| A6 | Indicador de foco amarillo sobre blanco (1,4:1) | 2.4.7 / 2.4.11 / 1.4.11 | Anillo de dos tonos (negro 3 px + amarillo 3 px) visible en fondos claros y oscuros |
| A7 | Diálogo sin gestión de foco: no se movía el foco, no había trampa de foco, no cerraba con Escape ni devolvía el foco | 2.1.1, 2.1.2, 2.4.3 | Foco a la pestaña activa al abrir, trampa de foco, `inert` en el fondo, Escape y clic en el fondo cierran, el foco vuelve al botón de menú |
| A8 | Pestañas sin navegación por teclado ni relación con su panel | 4.1.2, 2.1.1 | Patrón ARIA de pestañas: `aria-controls`, `role=tabpanel`, `aria-labelledby`, tabindex itinerante, flechas, Inicio y Fin |
| A9 | Cambios de estado (inicio, pausa, turno, franjas, fin de tiempo) no se anunciaban | 4.1.3 Mensajes de estado | Regiones `aria-live` (cortés y asertiva) y temporizador con `role=timer` y texto natural ("4 minutos 59 segundos") |
| A10 | Altura fija de 100vh con `overflow: hidden`: contenido cortado al ampliar | 1.4.10 Reflujo, 1.4.4 | A menos de 720 px de ancho o 520 px de alto la página fluye y permite desplazamiento; verificado a 320 px |
| A11 | Destello y parpadeo sin alternativa | 2.3.3 / 2.2.2 | Se respetan las preferencias de *movimiento reducido*: sin destello ni parpadeo |
| A12 | Los colores se elegían a ciegas | 1.4.3 (prevención) | La pestaña *Colores* muestra la relación de contraste de cada color con su fondo y si cumple el mínimo AA |
| A13 | Botón "siguiente" sin contexto | 2.4.6 / 4.1.2 | `aria-label` con el nombre del siguiente ponente; deshabilitado y descrito cuando no hay más turnos |
| A14 | Eliminar turno sin confirmación ni aviso | 3.3.4 Prevención de errores | Confirmación previa, anuncio y foco al siguiente control lógico |

---

## 3. Pruebas de seguridad

### 3.1 API (`tests/security.test.mjs`) — 44/44

| Categoría OWASP | Casos verificados |
|---|---|
| A01 Control de acceso | Guardar, subir, voz y cerrar sesión sin sesión → 401. `setup` no se puede repetir (409). Sin `setup_token` la configuración web queda deshabilitada (403). Recorrido de rutas en `asset&id=` (`../../config/config.php`, `auth.json`, `x.php`) → 404 |
| A01 / CSRF | Sin token o con token falso → 403. Desde otro origen (`Origin`, `Sec-Fetch-Site: cross-site`) → 403. `Content-Type: text/plain` → 415 (bloquea CSRF por formulario simple) |
| A02 Fallas criptográficas | La contraseña se guarda como hash `$2y$`/`$argon2` y nunca en claro. La API key no aparece en ninguna respuesta ni en `state.json` |
| A03 Inyección / XSS | Caracteres de control y de dirección Unicode (`U+202E`) eliminados. HTML guardado como texto y pintado con `textContent` (verificado en navegador: sin ejecución). Colores, enumeraciones, ID de voz y referencias de imagen validados con listas blancas. PHP o HTML disfrazados de imagen → 415. SVG con `script`, `onload`, `foreignObject`, `href` externo, `javascript:` o XXE → 415 |
| A04 Diseño inseguro | Límite de 256 KB por petición (413), 100 turnos, textos recortados, números acotados, `yellowAt > redAt` garantizado. Control de concurrencia con `rev` (409) |
| A05 Configuración | Cabeceras `nosniff`, `X-Frame-Options`, CSP `default-src 'none'`, `Cache-Control: no-store`, sin `X-Powered-By`. Visitantes anónimos no reciben cookie |
| A07 Autenticación | 5 contraseñas fallidas en 15 min → 429 con `Retry-After`, incluso con la contraseña correcta. Lo mismo para el token de setup. Fijación de sesión: la cookie impuesta por un atacante se reemplaza al iniciar sesión. La cookie anterior deja de servir al cerrar sesión. Cookie `HttpOnly` y `SameSite=Strict` |
| A08 Integridad | Subidas con nombre aleatorio (sin usar el nombre original); escritura atómica de JSON |
| A10 SSRF | El proxy de voz solo llama a `https://api.elevenlabs.io` (`CURLPROTO_HTTPS`), con el ID de voz validado (`[A-Za-z0-9_-]`) |

### 3.1.1 Asistente de instalación

| Riesgo | Control | Prueba |
|---|---|---|
| Secuestro de la instalación: el primero que abre el sitio crea la cuenta de administrador | La contraseña solo se crea con un **token de instalación** que únicamente puede leer quien administra el hosting: `setup_token` de `config.php` (16+ caracteres) o, si no existe, uno aleatorio de 160 bits en `storage/setup-token.php`. El archivo es un `.php` que responde 404 si se ejecuta por web y se borra al instalar | Token vacío, falso o el `setup_token` corto → 403; token del archivo → 200; archivo borrado después |
| Fuerza bruta del token | 5 intentos por IP cada 15 min (429) | Ver «límite de intentos» |
| Divulgación de la configuración del servidor | `install_check` solo responde antes de instalar o con sesión de administrador | Sin sesión tras instalar → 403 |
| `storage/` expuesta por un despliegue incorrecto | El asistente escribe `storage/install-probe.txt` con un valor aleatorio, intenta descargarlo desde el navegador y bloquea la instalación si lo consigue. El archivo se borra al instalar y al guardar | Archivo creado con el valor devuelto y borrado al instalar y guardar |
| Cookie de sesión con ruta incorrecta tras una reescritura de URL | La ruta de la cookie se toma de la URL pedida (`REQUEST_URI`), no de `SCRIPT_NAME` (corregido en 1.1.1, detectado en producción) | Cookie `Path=/app/tiempo/` y guardado 200 a través de un router que imita el `.htaccess` |
| Reinstalación | `setup` responde 409 una vez existe el administrador y ya no informa el origen del token | 409 |

### 3.2 Revisión estática (`tests/static.test.mjs`) — 8/8

- `app.js` y `wizard.js` sin `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function` ni temporizadores con cadenas.
- `app.js` sin llamadas directas a terceros ni cabecera `xi-api-key`.
- `index.html` sin scripts en línea, atributos `style`, bloques `<style>` ni manejadores `on*`: compatible con CSP sin `unsafe-inline` (comprobado también en navegador: la CSP bloqueó la inyección de un script en línea durante las pruebas).
- Sin recursos de terceros (fuentes autoalojadas).
- `storage/`, `config/`, `src/`, `bin/` con bloqueo en Apache (`Require all denied`) e IIS (`allowUnlisted="false"`).
- `config/config.php` y `storage/*` excluidos de Git.
- `client_ip()` confía en `CF-Connecting-IP` solo si `REMOTE_ADDR` pertenece a Cloudflare (8 casos, IPv4 e IPv6, incluida una cabecera falsificada).
- Backend con `password_hash`/`password_verify`, `hash_equals` y sin funciones peligrosas (`md5`, `unserialize`, `extract`, `eval`, `system`, `shell_exec`).

### 3.3 Semgrep

```
Ran 127 rules on 33 files: 3 findings.
php.lang.security.injection.tainted-filename  public/api.php  (action_asset, 3 líneas)
```

**Falso positivo.** El parámetro `id` se valida antes de usarse con la expresión regular `^[a-f0-9]{32}\.(png|jpg|webp|gif|svg)$`, que no admite `/`, `\`, `.` adicionales ni rutas. El caso "el ID de imagen no permite recorrer rutas" lo confirma con cinco intentos de recorrido.

### 3.4 Riesgos residuales y recomendaciones

| Riesgo | Nivel | Recomendación |
|---|---|---|
| El estado (`api.php?action=state`) es público: nombres y profesiones de los ponentes | Bajo (se proyectan públicamente) | Si un evento es reservado, proteger el sitio con **Protección con contraseña** de Plesk |
| El límite de intentos usa la IP del cliente | Bajo | Desde la versión 1.0.1 se usa `CF-Connecting-IP` solo cuando la conexión viene de un rango publicado por Cloudflare (el sitio de producción está detrás de Cloudflare); en otro caso, `REMOTE_ADDR`. Si se agrega otro proxy o CDN, ampliar `client_ip()` en `src/bootstrap.php` |
| Las cabeceras dependen de `.htaccess` o `web.config` | Bajo | En hosting solo nginx, aplicar las directivas de `docs/DESPLIEGUE-PLESK.md` §7 y verificar con el script de §8 |
| Un único usuario administrador | Bajo | Suficiente para el uso previsto; cambiar la contraseña con `bin/set-password.php` al rotar personal |
| Validación SVG basada en patrones | Bajo | Mitigado por la CSP `sandbox` y `default-src 'none'` al servir; si no se necesitan logos SVG, poner `allow_svg => false` |
| Pruebas ejecutadas con el servidor embebido de PHP | Informativo | Ejecutar el script de verificación de §8 de la guía de despliegue en el servidor Plesk real (comprueba que `.htaccess`/`web.config` bloquean `storage/`) |

---

## 4. Pruebas de accesibilidad

### 4.1 axe-core (`tests/a11y.test.mjs`)

| Vista | Violaciones | Revisión manual |
|---|---|---|
| Pantalla principal | 0 | — |
| Configuración · General | 0 | 4 nodos `color-contrast` |
| Configuración · Turnos | 0 | — |
| Configuración · Colores | 0 | 12 nodos `color-contrast` |
| Configuración · Sonido | 0 | — |
| Configuración · Acceso | 0 | — |
| Franja amarilla sobre el fondo | 0 | — |
| Móvil 320 px | 0 | — |
| Asistente · 1 Servidor | 0 | 9 nodos `color-contrast` |
| Asistente · 2 Administrador | 0 | — |
| Asistente · 3 Evento | 0 | — |
| Asistente · 4 Tiempos | 0 | — |
| Asistente · 5 Ponentes | 0 | 1 nodo `color-contrast` |
| Asistente · 6 Voz | 0 | — |
| Asistente · 7 Resumen | 0 | — |
| Asistente · móvil 320 px | 0 | 10 nodos `color-contrast` |

En el asistente, los nodos de revisión manual son los iconos ✓ ! ✕ de la verificación (decorativos, con `aria-hidden` y acompañados del texto «Correcto», «Advertencia» o «Error», en blanco sobre fondos de 5,5:1 a 7,5:1) y campos que quedan bajo el pie fijo al desplazarse. Cumplen.

Los nodos de "revisión manual" son etiquetas del panel que, al momento del análisis, quedaban **debajo del pie fijo** del panel (fuera de la zona visible del desplazamiento), por lo que axe no pudo calcular el fondo. Se revisaron manualmente: son textos `#4A4A4A` o `#000000` sobre `#FFFFFF` (8,9:1 y 21:1). Cumplen.

El detalle de la última ejecución queda en `tests/reports/axe-resultados.md`.

### 4.2 Pruebas funcionales

| Prueba | Criterios WCAG | Resultado |
|---|---|---|
| Abrir el menú con Enter, foco en la pestaña activa, `aria-expanded`, fondo `inert`; flechas, Inicio y Fin; Escape cierra y el foco vuelve al botón | 2.1.1, 2.4.3, 4.1.2 | Aprobada |
| 40 tabulaciones hacia adelante y 10 hacia atrás sin salir del diálogo | 2.1.2, 2.4.3 | Aprobada |
| Menú, Iniciar, Reiniciar y Siguiente alcanzables con Tab y con indicador de foco visible | 2.1.1, 2.4.7 | Aprobada |
| `role=timer` con texto natural; anuncios "Contador en curso…" y "Turno 2 de 2…"; botón Siguiente deshabilitado y descrito en el último turno | 4.1.3, 4.1.2, 1.3.1 | Aprobada |
| Ancho de 320 px (equivalente a 400 % de zoom) sin desplazamiento horizontal, con el panel abierto y cerrado | 1.4.10 | Aprobada |
| Con *movimiento reducido* no hay destello al cambiar de turno | 2.3.3 | Aprobada |
| Asistente: se abre al iniciar como diálogo modal (`aria-modal`, fondo `inert`), foco en el título de cada paso, `aria-current="step"`, se puede omitir y reabrir desde *Acceso* | 2.4.3, 4.1.2, 1.3.1 | Aprobada |
| Asistente: errores en `role=alert`, campo con `aria-invalid` y `aria-describedby`, el foco va al campo con error; Enter dentro de un campo avanza; «Atrás» conserva lo escrito | 3.3.1, 3.3.3, 2.1.1 | Aprobada |
| Asistente: recorrido completo con teclado hasta guardar; anuncio «Instalación completada» y foco en *Iniciar* | 2.1.1, 4.1.3 | Aprobada |
| Asistente a 320 px sin desplazamiento horizontal | 1.4.10 | Aprobada |
| Asistente publicado en `/app/tiempo/` con reescritura: instalación con token generado, sesión perdida antes de guardar → vuelve al inicio de sesión y luego al resumen | 3.3.4, 2.4.3 | Aprobada |
| Contraste de la paleta institucional por defecto (11 combinaciones) | 1.4.3, 1.4.11 | Aprobada |

### 4.3 Contraste de la paleta por defecto

| Combinación | Relación | Mínimo | Cumple |
|---|---|---|---|
| Título `#000000` / blanco | 21,0:1 | 3:1 (texto grande) | Sí |
| Subtítulo, profesión, texto inferior `#4A4A4A` / blanco | 8,9:1 | 4,5:1 | Sí |
| Etiqueta "Ponente en turno" `#0B7A2C` / blanco | 5,5:1 | 4,5:1 | Sí |
| Texto blanco / botón `#003366` | 12,6:1 | 4,5:1 | Sí |
| Números verdes `#10A13B` / blanco | 3,4:1 | 3:1 (texto grande) | Sí |
| Números rojos `#D62828` / blanco | 5,0:1 | 3:1 | Sí |
| Números amarillos `#FFD500` / blanco | 1,4:1 | 3:1 | **No**, compensado con contorno automático negro (21:1) |
| Texto negro / franja amarilla (modo fondo) | 14,8:1 | 4,5:1 | Sí |
| Texto blanco / franja roja (modo fondo) | 5,0:1 | 4,5:1 | Sí |
| Icono blanco / botón siguiente `#10A13B` | 3,4:1 | 3:1 (no textual) | Sí |

### 4.4 Pendiente de verificación manual

Las herramientas automáticas no reemplazan una prueba con personas usuarias. Antes de la puesta en producción se recomienda:

1. Recorrido completo con **NVDA + Firefox** y **VoiceOver + Safari**: configurar un evento, iniciar, pasar turnos y escuchar los anuncios.
2. Probar con **Modo de alto contraste** de Windows (hay estilos `forced-colors` de respaldo).
3. Verificar en el proyector real que los colores personalizados mantengan el contraste que indica la pestaña *Colores*.
4. Si se usa imagen de fondo, comprobar el contraste de los textos sobre la imagen (no se puede medir automáticamente).
