# storage/

Datos de ejecución del contador. **Debe quedar fuera de la raíz web** y ser escribible por PHP.

| Archivo | Contenido |
|---|---|
| `state.json` | Configuración pública y turnos (con `rev` y `updatedAt`). |
| `state.json.bak` | Copia de la versión anterior, creada en cada guardado. |
| `secrets.json` | API key de ElevenLabs. Nunca se envía al navegador. |
| `auth.json` | Hash (bcrypt/argon2) de la contraseña de administrador. |
| `ratelimit.json` | Registro temporal de intentos (login, subidas, voz). |
| `uploads/` | Logos e imágenes de fondo con nombre aleatorio. |
| `sessions/` | Sesiones PHP del administrador. |
| `setup-token.php` | Token de instalación temporal (solo antes de crear la contraseña; se borra solo). |
| `install-probe.txt` | Archivo temporal con el que el asistente comprueba que `storage/` no es pública. |

Respaldo: copie `state.json`, `auth.json`, `secrets.json` y `uploads/`.
