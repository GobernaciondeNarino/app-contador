# Despliegue en Plesk

Guía para publicar el **Contador de exposiciones** en un servidor administrado con Plesk (Linux con Apache/nginx o Windows con IIS). La aplicación no usa base de datos: guarda todo en archivos JSON dentro de `storage/`.

## 1. Requisitos

| Componente | Versión / ajuste |
|---|---|
| PHP | 7.4 o superior (recomendado 8.2+), con PHP-FPM o FastCGI |
| Extensiones PHP | `json`, `session`, `mbstring`, `fileinfo` (obligatorias); `curl` (solo para la voz de ElevenLabs) |
| Certificado | SSL/TLS activo (Let's Encrypt desde Plesk) |
| Permisos | El usuario de sistema de la suscripción debe poder escribir en `storage/` |

Para comprobar las extensiones: **Plesk → Sitios web y dominios → Configuración de PHP**, o en **Herramientas y configuración → Configuración de PHP**.

## 2. Estructura en el servidor

La carpeta `public/` es la única que debe quedar expuesta a internet. El resto (`src/`, `config/`, `storage/`, `bin/`) queda fuera de la raíz web.

```
/var/www/vhosts/ejemplo.gov.co/
├── httpdocs/                  ← repositorio clonado o archivos subidos
│   ├── public/                ← RAÍZ DEL DOCUMENTO (document root)
│   │   ├── index.html
│   │   ├── api.php
│   │   ├── .htaccess / web.config / .user.ini
│   │   └── assets/ (css, js, fuentes, imágenes)
│   ├── src/                   ← lógica PHP (no pública)
│   ├── config/config.php      ← configuración con secretos (no pública)
│   ├── storage/               ← datos JSON, imágenes y sesiones (no pública, escribible)
│   └── bin/set-password.php   ← herramienta de consola
```

## 3. Opción A: despliegue con Git (recomendada)

1. En Plesk abra **Sitios web y dominios → ejemplo.gov.co → Git**.
2. Agregue el repositorio `https://github.com/gobernaciondenarino/app-contador.git` (rama `main` o la que se apruebe).
3. Ruta de despliegue: `httpdocs`.
4. Vaya a **Configuración de hosting** y cambie la **Raíz del documento** a `httpdocs/public`.
5. Continúe en el paso 5.

## 4. Opción B: subida manual (Administrador de archivos o FTP)

1. Comprima el proyecto (sin `node_modules/`, `tests/`, `.git/`).
2. Súbalo a `httpdocs/` y extráigalo con el **Administrador de archivos** de Plesk.
3. Cambie la **Raíz del documento** a `httpdocs/public` en **Configuración de hosting**.

> Si no puede cambiar la raíz del documento: suba el **contenido** de `public/` a `httpdocs/` y las carpetas `src/`, `config/`, `storage/` y `bin/` al nivel superior (`/var/www/vhosts/ejemplo.gov.co/`), al lado de `httpdocs`. Las rutas relativas (`../src`, `../storage`) siguen funcionando y los datos quedan fuera de la web.
>
> Como respaldo, el `.htaccess` de la raíz del repositorio y los `.htaccess`/`web.config` de cada carpeta privada bloquean el acceso aunque todo quede dentro de `httpdocs`.

## 5. Configuración (opcional)

`config/config.php` es **opcional**: sin él, la aplicación usa valores por defecto y el asistente genera su propio token de instalación (paso 6). Créelo solo si necesita cambiar algún valor, por ejemplo fijar la API key de ElevenLabs en el servidor:

1. Copie `config/config.example.php` como `config/config.php` (Administrador de archivos → Copiar).
2. Edite `config/config.php`:

```php
return [
    'storage_dir' => __DIR__ . '/../storage',
    'setup_token' => 'pegue-aqui-un-valor-aleatorio-de-32-o-mas-caracteres',
    'elevenlabs_api_key' => '',      // opcional
    'session_idle_minutes' => 240,
    'max_upload_mb' => 4,
    'allow_svg' => true,
];
```

`setup_token` también es opcional. Si lo define, **debe tener al menos 16 caracteres** (se recomiendan 32); si queda vacío o es más corto, se ignora y el asistente usa el token generado en `storage/setup-token.php`.

3. Permisos: `storage/` y sus subcarpetas con **750** y propietario el usuario de la suscripción. En Plesk Linux esto es lo predeterminado al subir archivos con ese usuario. Los archivos que crea la aplicación quedan con permisos **640**.

## 6. Asistente de instalación

Al abrir el sitio por primera vez (`https://ejemplo.gov.co/`) aparece el **asistente de instalación**. Se muestra automáticamente mientras no exista administrador o configuración guardada, y tiene 7 pasos:

| Paso | Qué hace |
|---|---|
| 1. Servidor | Verifica PHP 7.4+, extensiones (`json`, `session`, `mbstring`, `fileinfo`, `curl`), permisos de escritura en `storage/`, `config.php`, HTTPS, límite de subida y que `storage/` **no** se pueda descargar desde internet. No deja continuar si hay errores |
| 2. Administrador | Crea la contraseña (12+ caracteres) con el **token de instalación** |
| 3. Evento | Nombre del evento, lugar y fecha, texto inferior, logo y color de fondo |
| 4. Tiempos | Minutos por turno, inicio de la franja amarilla y roja, efecto de la franja |
| 5. Ponentes | Lista de ponentes en orden, con profesión y minutos de cada uno |
| 6. Voz | Alertas sonoras, anuncios por voz, API key e ID de voz de ElevenLabs (opcional) |
| 7. Resumen | Revisión y **Guardar y abrir el contador** |

### Dónde está el token de instalación

El token evita que un desconocido que llegue primero al sitio se quede con la cuenta de administrador. Solo lo puede leer quien administra el hosting:

- **Si `config/config.php` tiene un `setup_token` de 16+ caracteres:** use ese valor.
- **Si no:** el servidor genera uno al abrir el asistente. En Plesk vaya a **Archivos → `storage/setup-token.php`**, ábralo con *Editar en editor de texto* y copie el código que aparece después de `TOKEN:`. Ese archivo responde 404 si alguien lo pide por web y **se borra solo** al crear la contraseña.

Después de instalar:

- El asistente no vuelve a aparecer. Se puede abrir otra vez desde ☰ → **Acceso** → *Abrir asistente de configuración* (con sesión iniciada) para cambiar evento, tiempos y ponentes.
- Si pulsa **Omitir por ahora**, el asistente no se vuelve a mostrar en esa ventana del navegador; se puede abrir desde ☰ → **Acceso** → *Abrir asistente de instalación*.

### Alternativa por consola (SSH o Tareas programadas de Plesk)

```bash
cd /var/www/vhosts/ejemplo.gov.co/httpdocs
php bin/set-password.php
```

Crea la contraseña sin token (el asistente pasa directo al inicio de sesión) y sirve también para **restablecer** una contraseña olvidada.

## 7. HTTPS y cabeceras

- Active **SSL/TLS → Redirección permanente 301 de HTTP a HTTPS** y, si es posible, **HSTS** en la sección de certificados de Plesk.
- `public/.htaccess` (Apache) y `public/web.config` (IIS) envían: `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` y HSTS.
- **Si el sitio usa solo nginx** (sin Apache), los `.htaccess` no se aplican. Agregue en **Configuración de Apache y nginx → Directivas adicionales de nginx**:

```nginx
location ~ ^/(storage|config|src|bin|tests|docs|design)/ { deny all; return 404; }
location ~ /\.(?!well-known) { deny all; return 404; }
location ~* \.(bak|tmp|json|md|log|ini)$ { deny all; return 404; }

add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "same-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;

location ~* \.woff2$ { add_header Cache-Control "public, max-age=31536000, immutable"; }
```

- Desactive la exposición de versión de PHP (`expose_php = Off`) en **Configuración de PHP**.

### Sitio detrás de Cloudflare

- El límite de intentos usa la IP real del visitante: la aplicación toma `CF-Connecting-IP` solo si la conexión llega desde los rangos oficiales de Cloudflare, así que no hay que configurar nada.
- Si Plesk ya envía `Strict-Transport-Security`, quite la línea `Header always set Strict-Transport-Security` de `public/.htaccess` para no enviar la cabecera dos veces (el navegador solo tiene en cuenta la primera).
- Plesk agrega `X-Powered-By: PleskLin`. Se puede quitar en **Configuración de Apache y nginx → Directivas adicionales de nginx** con `proxy_hide_header X-Powered-By;`.

## 8. Verificación después de publicar

Ejecute desde cualquier equipo (reemplace el dominio):

```bash
D=https://ejemplo.gov.co
curl -sI $D/ | grep -iE "content-security|x-frame|x-content-type|strict-transport"
curl -s  $D/api.php?action=state | head -c 200; echo
# Todas estas deben responder 403 o 404:
for p in storage/state.json storage/auth.json storage/secrets.json config/config.php src/bootstrap.php .user.ini .htaccess ../storage/auth.json; do
  printf '%-28s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' $D/$p)"
done
```

| Prueba | Resultado esperado |
|---|---|
| Página principal | 200 con cabeceras CSP, X-Frame-Options, nosniff y HSTS |
| `api.php?action=state` | JSON con `"ok":true` y sin la API key |
| Archivos de `storage/`, `config/`, `src/`, ocultos | 403 o 404 |
| Guardar sin sesión | 401 |

## 9. Respaldo y actualización

- **Respaldo**: incluya `storage/` (JSON + `uploads/`) y `config/config.php` en las copias de seguridad de Plesk (**Copias de seguridad → Configuración → incluir archivos del sitio**). Cada guardado deja una copia previa en `storage/state.json.bak`.
- **Actualizar**: con Git, pulse **Extraer ahora / Desplegar** en Plesk; `config/config.php` y `storage/` no están versionados y no se sobrescriben. Si cambian CSS/JS, actualice el parámetro `?v=` en `index.html` para invalidar la caché.

## 10. Uso en el evento

1. Abra el sitio en el equipo conectado al proyector, en pantalla completa (F11).
2. Menú ☰ → **Acceso** → inicie sesión (necesario para guardar y para la voz de ElevenLabs).
3. Para un evento nuevo use **Abrir asistente de configuración**; para ajustes puntuales (colores, imagen de fondo, orden) use las pestañas del menú → **Guardar cambios**.
4. Controles: **Iniciar/Pausar**, **Reiniciar** y el botón verde **→** para pasar al siguiente ponente (anuncia el nombre por voz).

Sin sesión iniciada la pantalla funciona igual (muestra la última configuración guardada) y los cambios hechos en el menú solo afectan esa pantalla.

## 11. Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| Al guardar responde 401 y el asistente dice que la sesión no está activa, aunque se acaba de crear la contraseña | Versiones 1.0.0 a 1.1.0 publicadas con el `.htaccess` de la raíz (repositorio completo en un subdirectorio): la cookie de sesión quedaba con la ruta `…/public/` y el navegador no la enviaba | Actualice a 1.1.1 o superior (`src/bootstrap.php`, `public/assets/js/wizard.js`). La contraseña creada sigue siendo válida: recargue, inicie sesión en el paso 2 y guarde |
| La consola muestra «Loading the script 'https://static.cloudflareinsights.com/…' violates the following Content Security Policy» | Cloudflare inyecta su script de analítica y la CSP lo bloquea | No afecta al contador. Desactive *Web Analytics → Automatic setup* en Cloudflare para ese dominio (recomendado por privacidad), o permita `https://static.cloudflareinsights.com` en `script-src` y `https://cloudflareinsights.com` en `connect-src` |
| El asistente dice que el token no coincide | Se copió un token distinto | Si `config.php` tiene un `setup_token` de 16+ caracteres, se usa ese; si no, el de `storage/setup-token.php`. `api.php?action=session` indica cuál en `tokenSource` (`config` o `file`) |
| No aparece `storage/setup-token.php` | `storage/` sin permisos de escritura (el paso 1 lo marca en rojo) | Dé permisos 750 a `storage/` o use `php bin/set-password.php` |
| El paso 1 marca "Datos protegidos de internet" en rojo | `storage/` se puede descargar por web | Apunte la raíz del documento a `public/` (§3) o revise que los `.htaccess`/`web.config` estén subidos; en nginx puro aplique las directivas de §7 |
| "No se detectó el servidor (api.php)" | PHP desactivado o raíz del documento incorrecta | Active PHP en la suscripción y verifique que la raíz apunte a `public/` |
| Error 500 "La carpeta de datos…" | `storage/` sin permisos de escritura o fuera de `open_basedir` | Ajuste permisos (750) o `storage_dir`; el `open_basedir` predeterminado de Plesk ya incluye la carpeta de la suscripción |
| "Token de seguridad inválido" | Sesión expirada | Recargue la página e inicie sesión de nuevo |
| 429 "Demasiados intentos" | 5 contraseñas fallidas en 15 min | Espere 15 minutos o borre `storage/ratelimit.json` |
| La imagen no sube | Supera `max_upload_mb` o `upload_max_filesize` | Ajuste ambos valores (`.user.ini` y `config.php`) |
| No suena la voz de ElevenLabs | Clave/ID de voz no guardados o falta cURL | Revise la pestaña Sonido; se usa la voz del navegador como respaldo |
