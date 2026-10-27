# Contador de exposiciones · Gobernación de Nariño

Contador de tiempo para ponencias y eventos, listo para producción en **Plesk**. Muestra el tiempo restante en grande con una franja amarilla y roja que avanza al acercarse el final, el nombre del ponente en turno y el siguiente, alertas sonoras y anuncios por voz (navegador o ElevenLabs).

- **Frontend** estático sin dependencias (HTML + CSS + JavaScript), con la identidad visual de la Gobernación de Nariño: Hind Madurai, Nunito Sans y los colores `#10A13B`, `#FFD500`, `#003366` y `#4A4A4A`.
- **Backend** PHP de un solo archivo (`public/api.php`) que guarda la configuración en **JSON** (sin base de datos).
- Accesibilidad **WCAG 2.1 / 2.2 AA** (Resolución 1519 de 2020 de MinTIC) y controles de seguridad OWASP verificados con pruebas automáticas.

## Estructura

```
public/              Raíz web (document root en Plesk)
  index.html         Pantalla del contador y panel de configuración
  api.php            API: estado, sesión, guardar, subir imágenes, voz
  assets/            CSS, JS, fuentes autoalojadas, favicon
  .htaccess          Cabeceras y reglas para Apache
  web.config         Cabeceras y reglas para IIS (Plesk Windows)
  .user.ini          Límites de subida PHP
src/                 Lógica PHP (configuración, JSON, sesión, validación)
config/              config.example.php → copiar como config.php (no se versiona)
storage/             Datos JSON, imágenes y sesiones (no se versiona, escribible)
bin/set-password.php Crear o restablecer la contraseña desde consola
tests/               Pruebas de seguridad, estáticas y de accesibilidad
docs/                Guía de despliegue e informe de pruebas
design/              Maqueta original exportada (solo referencia, no se publica)
```

## Puesta en marcha local

```bash
cp config/config.example.php config/config.php   # y defina setup_token
npm run serve                                    # http://127.0.0.1:8080
```

Abra el menú ☰ → **Acceso** para crear la contraseña con el `setup_token`, o ejecute `php bin/set-password.php`.

Sin PHP (abriendo `public/index.html` desde un servidor estático) el contador funciona en **modo local**: guarda en `localStorage` y usa la voz del navegador.

## Despliegue en Plesk

Ver **[docs/DESPLIEGUE-PLESK.md](docs/DESPLIEGUE-PLESK.md)**: requisitos, raíz del documento en `public/`, configuración, HTTPS, directivas nginx, verificación posterior y respaldo.

## Datos en JSON

| Archivo en `storage/` | Contenido | ¿Público? |
|---|---|---|
| `state.json` (+ `.bak`) | Textos, tiempos, colores, logo, fondo, turnos | Sí, vía `api.php?action=state` |
| `secrets.json` | API key de ElevenLabs | No, nunca sale del servidor |
| `auth.json` | Hash de la contraseña de administrador | No |
| `ratelimit.json` | Intentos recientes (anti fuerza bruta) | No |
| `uploads/` | Logos y fondos con nombre aleatorio | Sí, vía `api.php?action=asset` |

## Pruebas

```bash
npm install     # axe-core
npm test        # sintaxis + 61 pruebas (seguridad, estáticas, accesibilidad)
npm run test:security
npm run test:a11y
```

Requiere PHP 7.4+, Node 20+ y Playwright con Chromium (`npx playwright install chromium` si no está instalado). Resultados y hallazgos: **[docs/INFORME-SEGURIDAD-ACCESIBILIDAD.md](docs/INFORME-SEGURIDAD-ACCESIBILIDAD.md)**.

## Grafo de conocimiento (graphify)

El repositorio está preparado para [graphify](https://github.com/Graphify-Labs/graphify), que genera un grafo del código en `graphify-out/` para que los asistentes de IA consulten la arquitectura sin leer archivo por archivo.

```bash
uv tool install graphifyy     # o: pipx install graphifyy
graphify install              # registra la habilidad /graphify en Claude Code
graphify update .             # reconstruye el grafo del código (local, sin LLM)
graphify query "¿cómo se guarda la configuración?"
```

`CLAUDE.md` y `.claude/settings.json` contienen las reglas y los hooks que instala `graphify claude install`.
