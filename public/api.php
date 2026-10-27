<?php
/**
 * API del Contador de exposiciones (PHP 7.4+ / 8.x, sin base de datos: datos en JSON).
 *
 *   GET  api.php?action=state     estado público (configuración + turnos, sin secretos)
 *   GET  api.php?action=session   estado de la sesión y token CSRF
 *   GET  api.php?action=asset&id= imagen subida (logo o fondo)
 *   POST api.php?action=setup     crea la contraseña inicial (requiere setup_token)
 *   POST api.php?action=login     inicia sesión
 *   POST api.php?action=logout    cierra sesión                         [admin]
 *   POST api.php?action=save      guarda configuración y turnos         [admin]
 *   POST api.php?action=upload    sube una imagen (multipart)           [admin]
 *   POST api.php?action=tts       voz de ElevenLabs a través del servidor [admin]
 */
declare(strict_types=1);

require dirname(__DIR__) . '/src/bootstrap.php';
require dirname(__DIR__) . '/src/validate.php';

send_security_headers();
ensure_storage();

$action = isset($_GET['action']) && is_string($_GET['action']) ? $_GET['action'] : '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$routes = [
    'state' => ['GET', 'action_state'],
    'session' => ['GET', 'action_session'],
    'asset' => ['GET', 'action_asset'],
    'setup' => ['POST', 'action_setup'],
    'login' => ['POST', 'action_login'],
    'logout' => ['POST', 'action_logout'],
    'save' => ['POST', 'action_save'],
    'upload' => ['POST', 'action_upload'],
    'tts' => ['POST', 'action_tts'],
];

if (!isset($routes[$action])) {
    fail(404, 'not_found', 'Acción desconocida.');
}
[$allowed, $handler] = $routes[$action];
if ($method !== $allowed) {
    header('Allow: ' . $allowed);
    fail(405, 'method_not_allowed', 'Método no permitido.');
}
$handler();

/* ------------------------------------------------------------------ */

function elevenlabs_key(): string
{
    $fromConfig = (string) app_config()['elevenlabs_api_key'];
    if ($fromConfig !== '') {
        return $fromConfig;
    }
    $secrets = read_json('secrets.json', []);
    return is_string($secrets['elKey'] ?? null) ? $secrets['elKey'] : '';
}

function admin_exists(): bool
{
    $auth = read_json('auth.json');
    return is_array($auth) && !empty($auth['hash']);
}

function session_payload(): array
{
    $auth = is_authenticated();
    return [
        'authenticated' => $auth,
        'setupRequired' => !admin_exists(),
        'setupEnabled' => !admin_exists() && strlen((string) app_config()['setup_token']) >= 16,
        'csrf' => $auth ? csrf_token() : null,
    ];
}

function action_state(): void
{
    $stored = read_json('state.json');
    $key = elevenlabs_key();
    json_response([
        'ok' => true,
        'version' => APP_VERSION,
        'state' => is_array($stored) ? ['cfg' => $stored['cfg'], 'turns' => $stored['turns']] : null,
        'rev' => is_array($stored) ? (int) ($stored['rev'] ?? 0) : 0,
        'updatedAt' => is_array($stored) ? ($stored['updatedAt'] ?? null) : null,
        'tts' => [
            'keySet' => $key !== '',
            'keyLocked' => (string) app_config()['elevenlabs_api_key'] !== '',
        ],
        'limits' => [
            'uploadMb' => (int) app_config()['max_upload_mb'],
            'svg' => (bool) app_config()['allow_svg'],
        ],
    ]);
}

function action_session(): void
{
    json_response(['ok' => true] + session_payload());
}

function action_setup(): void
{
    require_same_origin();
    $bucket = 'setup:' . client_ip();
    enforce_rate($bucket, 5, 900);
    $body = request_json(4096);
    $token = (string) app_config()['setup_token'];
    $sent = is_string($body['token'] ?? null) ? $body['token'] : '';
    $password = is_string($body['password'] ?? null) ? $body['password'] : '';

    if (strlen($token) < 16) {
        fail(403, 'setup_disabled', 'Defina setup_token (16+ caracteres) en config/config.php para habilitar la configuración inicial.');
    }
    if (!hash_equals($token, $sent)) {
        rate_hit($bucket, 900);
        usleep(random_int(200000, 400000));
        fail(403, 'invalid_token', 'El token de configuración no es correcto.');
    }
    if (mb_strlen($password, 'UTF-8') < 12 || strlen($password) > 256) {
        fail(422, 'weak_password', 'La contraseña debe tener entre 12 y 256 caracteres.');
    }
    with_lock(static function () use ($password) {
        if (admin_exists()) {
            fail(409, 'already_configured', 'Ya existe una contraseña de administrador.');
        }
        write_json('auth.json', ['hash' => password_hash($password, PASSWORD_DEFAULT), 'updatedAt' => gmdate('c')]);
    });
    open_session(true);
    session_regenerate_id(true);
    $_SESSION['admin'] = true;
    json_response(['ok' => true] + session_payload());
}

function action_login(): void
{
    require_same_origin();
    $bucket = 'login:' . client_ip();
    enforce_rate($bucket, 5, 900);
    $body = request_json(4096);
    $password = is_string($body['password'] ?? null) ? $body['password'] : '';
    $auth = read_json('auth.json');

    if (!is_array($auth) || empty($auth['hash'])) {
        fail(409, 'setup_required', 'Aún no se ha creado la contraseña de administrador.');
    }
    if ($password === '' || strlen($password) > 256 || !password_verify($password, (string) $auth['hash'])) {
        rate_hit($bucket, 900);
        usleep(random_int(200000, 400000));
        fail(401, 'invalid_credentials', 'Contraseña incorrecta.');
    }
    if (password_needs_rehash((string) $auth['hash'], PASSWORD_DEFAULT)) {
        with_lock(static function () use ($password, $auth) {
            $auth['hash'] = password_hash($password, PASSWORD_DEFAULT);
            write_json('auth.json', $auth);
        });
    }
    rate_clear($bucket);
    open_session(true);
    session_regenerate_id(true);
    $_SESSION = ['admin' => true, 'last_seen' => time()];
    json_response(['ok' => true] + session_payload());
}

function action_logout(): void
{
    require_admin();
    $_SESSION = [];
    $params = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires' => time() - 3600,
        'path' => $params['path'],
        'secure' => $params['secure'],
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_destroy();
    json_response(['ok' => true, 'authenticated' => false]);
}

function action_save(): void
{
    require_admin();
    $body = request_json();
    try {
        $state = normalize_state($body);
    } catch (ValidationError $e) {
        fail(422, 'validation', $e->getMessage(), ['field' => $e->field]);
    }

    $secrets = $body['secrets'] ?? null;
    $elKey = null;
    if (is_array($secrets) && array_key_exists('elKey', $secrets)) {
        $elKey = clean_text($secrets['elKey'], 'elKey', 200);
        if ($elKey !== '' && !preg_match('/^[A-Za-z0-9_-]{10,200}$/', $elKey)) {
            fail(422, 'validation', 'La API key de ElevenLabs tiene un formato no válido.', ['field' => 'elKey']);
        }
    }
    $baseRev = isset($body['rev']) && is_int($body['rev']) ? $body['rev'] : null;

    $result = with_lock(static function () use ($state, $elKey, $baseRev) {
        $current = read_json('state.json');
        $rev = is_array($current) ? (int) ($current['rev'] ?? 0) : 0;
        if ($baseRev !== null && $baseRev !== $rev) {
            fail(409, 'conflict', 'Otra sesión guardó cambios. Recargue para ver la versión más reciente.', ['rev' => $rev]);
        }
        $record = $state + ['rev' => $rev + 1, 'updatedAt' => gmdate('c')];
        write_json('state.json', $record, true);
        if ($elKey !== null) {
            write_json('secrets.json', ['elKey' => $elKey]);
        }
        cleanup_uploads(referenced_assets($record));
        return $record;
    });

    json_response([
        'ok' => true,
        'state' => ['cfg' => $result['cfg'], 'turns' => $result['turns']],
        'rev' => $result['rev'],
        'updatedAt' => $result['updatedAt'],
        'tts' => ['keySet' => elevenlabs_key() !== '', 'keyLocked' => (string) app_config()['elevenlabs_api_key'] !== ''],
    ]);
}

/** Borra imágenes que no usa el estado guardado y tienen más de una hora (las recientes pueden estar sin guardar). */
function cleanup_uploads(array $keep): void
{
    $dir = storage_path('uploads');
    foreach (glob($dir . DIRECTORY_SEPARATOR . '*') ?: [] as $file) {
        $name = basename($file);
        if (preg_match(ASSET_ID_PATTERN, $name) && !in_array($name, $keep, true) && filemtime($file) < time() - 3600) {
            @unlink($file);
        }
    }
}

function action_upload(): void
{
    require_admin();
    $bucket = 'upload:' . session_id();
    enforce_rate($bucket, 30, 3600);
    $file = $_FILES['file'] ?? null;
    if (!is_array($file) || !isset($file['error']) || is_array($file['error'])) {
        fail(400, 'no_file', 'No se recibió ningún archivo.');
    }
    if ($file['error'] === UPLOAD_ERR_INI_SIZE || $file['error'] === UPLOAD_ERR_FORM_SIZE) {
        fail(413, 'file_too_large', 'La imagen supera el tamaño permitido por el servidor.');
    }
    if ($file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) {
        fail(400, 'upload_failed', 'No se pudo recibir el archivo.');
    }
    $maxBytes = (int) app_config()['max_upload_mb'] * 1024 * 1024;
    $size = filesize($file['tmp_name']);
    if ($size === false || $size <= 0 || $size > $maxBytes) {
        fail(413, 'file_too_large', 'La imagen supera ' . (int) app_config()['max_upload_mb'] . ' MB.');
    }

    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $types = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp', 'image/gif' => 'gif'];
    if (app_config()['allow_svg']) {
        $types['image/svg+xml'] = 'svg';
        $types['image/svg'] = 'svg';
    }
    if (!isset($types[$mime])) {
        fail(415, 'invalid_type', 'Formato no permitido. Use PNG, JPG, WEBP, GIF' . (app_config()['allow_svg'] ? ' o SVG.' : '.'));
    }
    $ext = $types[$mime];
    if ($ext === 'svg') {
        $svg = (string) file_get_contents($file['tmp_name']);
        if (!svg_is_safe($svg)) {
            fail(415, 'unsafe_svg', 'El SVG contiene scripts, eventos o referencias externas y fue rechazado.');
        }
    } else {
        $info = @getimagesize($file['tmp_name']);
        if ($info === false || $info[0] < 1 || $info[1] < 1 || $info[0] > 10000 || $info[1] > 10000) {
            fail(415, 'invalid_image', 'El archivo no es una imagen válida.');
        }
    }

    $id = bin2hex(random_bytes(16)) . '.' . $ext;
    $dest = storage_path('uploads' . DIRECTORY_SEPARATOR . $id);
    if (!move_uploaded_file($file['tmp_name'], $dest)) {
        fail(500, 'upload_failed', 'No se pudo guardar la imagen.');
    }
    @chmod($dest, 0640);
    rate_hit($bucket, 3600);
    json_response(['ok' => true, 'ref' => 'api.php?action=asset&id=' . $id]);
}

function svg_is_safe(string $svg): bool
{
    if ($svg === '' || stripos($svg, '<svg') === false) {
        return false;
    }
    $patterns = [
        '/<\s*script/i', '/<\s*foreignObject/i', '/<!ENTITY/i', '/<!DOCTYPE/i', '/<\s*iframe/i',
        '/<\s*embed/i', '/<\s*object/i', '/\son[a-z]+\s*=/i', '/javascript\s*:/i', '/data\s*:\s*text\/html/i',
        '/(?:xlink:)?href\s*=\s*["\']\s*(?!#|data:image\/)[^"\']*/i', '/@import/i', '/url\(\s*["\']?\s*(?!#|data:image\/)/i',
    ];
    foreach ($patterns as $p) {
        if (preg_match($p, $svg)) {
            return false;
        }
    }
    return true;
}

function action_asset(): void
{
    $id = isset($_GET['id']) && is_string($_GET['id']) ? $_GET['id'] : '';
    if (!preg_match(ASSET_ID_PATTERN, $id, $m)) {
        fail(404, 'not_found', 'Imagen no encontrada.');
    }
    $file = storage_path('uploads' . DIRECTORY_SEPARATOR . $id);
    if (!is_file($file)) {
        fail(404, 'not_found', 'Imagen no encontrada.');
    }
    $types = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'webp' => 'image/webp', 'gif' => 'image/gif', 'svg' => 'image/svg+xml'];
    header('Content-Type: ' . $types[$m[1]]);
    header('Content-Length: ' . filesize($file));
    header('Content-Disposition: inline; filename="' . $id . '"');
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
    header('Cache-Control: public, max-age=31536000, immutable');
    readfile($file);
    exit;
}

function action_tts(): void
{
    require_admin();
    $bucket = 'tts:' . session_id();
    enforce_rate($bucket, 40, 600);
    $body = request_json(4096);
    $text = clean_text($body['text'] ?? '', 'text', 300);
    if ($text === '') {
        fail(422, 'validation', 'No hay texto para leer.');
    }
    $key = elevenlabs_key();
    $state = read_json('state.json', []);
    $voice = (string) ($state['cfg']['elVoice'] ?? '');
    $model = (string) ($state['cfg']['elModel'] ?? '') ?: 'eleven_multilingual_v2';
    if ($key === '' || $voice === '') {
        fail(409, 'tts_not_configured', 'Configure y guarde la API key y el ID de voz de ElevenLabs.');
    }
    if (!function_exists('curl_init')) {
        fail(501, 'curl_missing', 'La extensión cURL de PHP no está disponible.');
    }
    rate_hit($bucket, 600);

    $ch = curl_init('https://api.elevenlabs.io/v1/text-to-speech/' . rawurlencode($voice));
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HTTPHEADER => ['xi-api-key: ' . $key, 'Content-Type: application/json', 'Accept: audio/mpeg'],
        CURLOPT_POSTFIELDS => json_encode(['text' => $text, 'model_id' => $model], JSON_UNESCAPED_UNICODE),
    ]);
    $audio = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($audio === false || $status !== 200 || strlen((string) $audio) > 5 * 1024 * 1024) {
        error_log('contador: ElevenLabs respondió ' . $status);
        fail(502, 'tts_failed', 'ElevenLabs no respondió correctamente (código ' . $status . ').');
    }
    header('Content-Type: audio/mpeg');
    header('Cache-Control: no-store');
    echo $audio;
    exit;
}
