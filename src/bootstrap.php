<?php
/**
 * Utilidades del backend: configuración, almacenamiento JSON, sesión, seguridad y respuestas.
 */
declare(strict_types=1);

const APP_VERSION = '1.2.0';
const SETUP_TOKEN_MIN = 16;
const ASSET_ID_PATTERN = '/^[a-f0-9]{32}\.(png|jpg|webp|gif|svg)$/';
const ASSET_REF_PATTERN = '/^api\.php\?action=asset&id=([a-f0-9]{32}\.(?:png|jpg|webp|gif|svg))$/';

/* ---------- configuración ---------- */

function app_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }
    $defaults = [
        'storage_dir' => dirname(__DIR__) . '/storage',
        'setup_token' => '',
        'elevenlabs_api_key' => '',
        'session_idle_minutes' => 240,
        'max_upload_mb' => 4,
        'allow_svg' => true,
    ];
    $file = getenv('CONTADOR_CONFIG') ?: dirname(__DIR__) . '/config/config.php';
    $loaded = is_file($file) ? require $file : [];
    $config = array_merge($defaults, is_array($loaded) ? $loaded : []);
    return $config;
}

function storage_path(string $name = ''): string
{
    $dir = rtrim((string) app_config()['storage_dir'], '/\\');
    return $name === '' ? $dir : $dir . DIRECTORY_SEPARATOR . $name;
}

function ensure_storage(): void
{
    foreach (['', 'uploads', 'sessions'] as $sub) {
        $dir = storage_path($sub);
        if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) {
            fail(500, 'storage_unavailable', 'No se pudo crear la carpeta de datos en el servidor.');
        }
    }
    if (!is_writable(storage_path())) {
        fail(500, 'storage_unavailable', 'La carpeta de datos no tiene permisos de escritura.');
    }
}

/* ---------- JSON en disco ---------- */

function read_json(string $name, $default = null)
{
    $file = storage_path($name);
    if (!is_file($file)) {
        return $default;
    }
    $raw = file_get_contents($file);
    if ($raw === false || $raw === '') {
        return $default;
    }
    try {
        return json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        error_log('contador: JSON dañado en ' . $name);
        return $default;
    }
}

/** Escritura atómica: archivo temporal + rename, con copia de respaldo opcional. */
function write_json(string $name, $data, bool $backup = false): void
{
    $file = storage_path($name);
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    $tmp = $file . '.' . bin2hex(random_bytes(6)) . '.tmp';
    if (file_put_contents($tmp, $json . "\n", LOCK_EX) === false) {
        fail(500, 'write_failed', 'No se pudo guardar la información.');
    }
    @chmod($tmp, 0640);
    if ($backup && is_file($file)) {
        @copy($file, $file . '.bak');
    }
    if (!@rename($tmp, $file)) {
        @unlink($tmp);
        fail(500, 'write_failed', 'No se pudo guardar la información.');
    }
}

/** Ejecuta $fn con un bloqueo exclusivo sobre los datos para evitar escrituras concurrentes. */
function with_lock(callable $fn)
{
    $fh = fopen(storage_path('.lock'), 'c');
    if ($fh === false || !flock($fh, LOCK_EX)) {
        fail(500, 'lock_failed', 'El servidor está ocupado, intente de nuevo.');
    }
    try {
        return $fn();
    } finally {
        flock($fh, LOCK_UN);
        fclose($fh);
    }
}

/* ---------- respuestas ---------- */

function send_security_headers(): void
{
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: same-origin');
    header('Cross-Origin-Resource-Policy: same-origin');
    header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
    header_remove('X-Powered-By');
}

function json_response(array $data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** @return never */
function fail(int $status, string $code, string $message, array $extra = []): void
{
    json_response(['ok' => false, 'error' => $code, 'message' => $message] + $extra, $status);
}

function request_json(int $maxBytes = 262144): array
{
    $type = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
    if (strpos($type, 'application/json') !== 0) {
        fail(415, 'unsupported_media_type', 'Se esperaba JSON.');
    }
    $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > $maxBytes) {
        fail(413, 'payload_too_large', 'La solicitud es demasiado grande.');
    }
    $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if ($raw === false || strlen($raw) > $maxBytes) {
        fail(413, 'payload_too_large', 'La solicitud es demasiado grande.');
    }
    try {
        $data = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException $e) {
        fail(400, 'invalid_json', 'El JSON enviado no es válido.');
    }
    if (!is_array($data)) {
        fail(400, 'invalid_json', 'El JSON enviado no es válido.');
    }
    return $data;
}

/* ---------- sesión y autenticación ---------- */

function is_https(): bool
{
    if (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') {
        return true;
    }
    return strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

/**
 * Ruta de la cookie de sesión: el directorio de la URL que pidió el navegador (REQUEST_URI), no el del
 * script. Si el sitio se publica con el .htaccess de la raíz (repositorio en /app/tiempo/ reescrito a
 * public/), SCRIPT_NAME vale /app/tiempo/public/api.php pero el navegador llama a /app/tiempo/api.php:
 * con la ruta del script la cookie nunca se enviaba y toda escritura respondía 401.
 */
function cookie_path(): string
{
    $path = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
    if (!is_string($path) || $path === '' || $path[0] !== '/') {
        return '/';
    }
    $dir = substr($path, 0, (int) strrpos($path, '/') + 1);
    return preg_match('#^/[A-Za-z0-9._~%/-]*$#', $dir) ? $dir : '/';
}

/** Abre la sesión solo si ya existe la cookie o si $create es true (evita sesiones para cada visitante). */
function open_session(bool $create = false): bool
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return true;
    }
    $name = 'CONTADORSID';
    if (!$create && empty($_COOKIE[$name])) {
        return false;
    }
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.use_trans_sid', '0');
    ini_set('session.gc_maxlifetime', (string) (60 * (int) app_config()['session_idle_minutes']));
    $sessions = storage_path('sessions');
    if (is_dir($sessions) && is_writable($sessions)) {
        session_save_path($sessions);
    }
    session_name($name);
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => cookie_path(),
        'secure' => is_https(),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();

    $idle = 60 * (int) app_config()['session_idle_minutes'];
    $now = time();
    if (isset($_SESSION['last_seen']) && $now - (int) $_SESSION['last_seen'] > $idle) {
        $_SESSION = [];
        session_regenerate_id(true);
    }
    $_SESSION['last_seen'] = $now;
    return true;
}

function is_authenticated(): bool
{
    return open_session() && !empty($_SESSION['admin']);
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

/** Rechaza peticiones de otro origen (defensa adicional al token CSRF y a SameSite=Strict). */
function require_same_origin(): void
{
    $site = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? '';
    if ($site !== '' && !in_array($site, ['same-origin', 'none'], true)) {
        fail(403, 'cross_origin', 'Origen no permitido.');
    }
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '') {
        // Se compara host y puerto (no el esquema) porque detrás del proxy nginx de Plesk
        // PHP no siempre sabe si la petición original llegó por HTTPS.
        $parts = parse_url($origin);
        $originHost = strtolower(($parts['host'] ?? '') . (isset($parts['port']) ? ':' . $parts['port'] : ''));
        $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
        $defaultPorts = [':80', ':443'];
        foreach ($defaultPorts as $p) {
            if (substr($host, -strlen($p)) === $p) {
                $host = substr($host, 0, -strlen($p));
            }
        }
        if ($originHost === '' || !hash_equals($host, $originHost)) {
            fail(403, 'cross_origin', 'Origen no permitido.');
        }
    }
}

function require_admin(): void
{
    require_same_origin();
    if (!is_authenticated()) {
        fail(401, 'unauthorized', 'Inicie sesión como administrador.');
    }
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($sent) || $sent === '' || !hash_equals(csrf_token(), $sent)) {
        fail(403, 'csrf', 'Token de seguridad inválido. Recargue la página.');
    }
}

/* ---------- límite de intentos ---------- */

/** Rangos de https://www.cloudflare.com/ips-v4 e ips-v6 (consultados el 28/10/2026). */
const CLOUDFLARE_RANGES = [
    '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18',
    '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17',
    '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
    '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32',
    '2a06:98c0::/29', '2c0f:f248::/32',
];

/**
 * IP real del cliente. Si la petición llega desde un nodo de Cloudflare (REMOTE_ADDR dentro de sus
 * rangos publicados), se usa CF-Connecting-IP; de lo contrario esa cabecera se ignora porque
 * cualquiera podría falsificarla. Sin esto, todos los visitantes compartirían el límite de intentos.
 */
function client_ip(): string
{
    $remote = (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    $cf = (string) ($_SERVER['HTTP_CF_CONNECTING_IP'] ?? '');
    if ($cf !== '' && filter_var($cf, FILTER_VALIDATE_IP) && ip_in_ranges($remote, CLOUDFLARE_RANGES)) {
        return $cf;
    }
    return $remote;
}

function ip_in_ranges(string $ip, array $ranges): bool
{
    $bin = @inet_pton($ip);
    if ($bin === false) {
        return false;
    }
    foreach ($ranges as $cidr) {
        [$net, $bits] = explode('/', $cidr);
        $netBin = inet_pton($net);
        if ($netBin === false || strlen($netBin) !== strlen($bin)) {
            continue;
        }
        $bits = (int) $bits;
        $bytes = intdiv($bits, 8);
        if (substr($bin, 0, $bytes) !== substr($netBin, 0, $bytes)) {
            continue;
        }
        $rest = $bits % 8;
        if ($rest === 0) {
            return true;
        }
        $mask = (0xFF << (8 - $rest)) & 0xFF;
        if ((ord($bin[$bytes]) & $mask) === (ord($netBin[$bytes]) & $mask)) {
            return true;
        }
    }
    return false;
}

/** Devuelve los segundos de espera si se superó el límite, o 0 si se permite. */
function rate_limited(string $bucket, int $max, int $window): int
{
    $data = read_json('ratelimit.json', []);
    $now = time();
    $hits = array_values(array_filter($data[$bucket] ?? [], static fn($t) => $t > $now - $window));
    if (count($hits) >= $max) {
        return max(1, $hits[0] + $window - $now);
    }
    return 0;
}

function rate_hit(string $bucket, int $window): void
{
    with_lock(static function () use ($bucket, $window) {
        $data = read_json('ratelimit.json', []);
        $now = time();
        foreach ($data as $key => $hits) {
            $data[$key] = array_values(array_filter((array) $hits, static fn($t) => $t > $now - 86400));
            if (!$data[$key]) {
                unset($data[$key]);
            }
        }
        $data[$bucket] = array_values(array_filter($data[$bucket] ?? [], static fn($t) => $t > $now - $window));
        $data[$bucket][] = $now;
        write_json('ratelimit.json', $data);
    });
}

function rate_clear(string $bucket): void
{
    with_lock(static function () use ($bucket) {
        $data = read_json('ratelimit.json', []);
        unset($data[$bucket]);
        write_json('ratelimit.json', $data);
    });
}

function enforce_rate(string $bucket, int $max, int $window): void
{
    $wait = rate_limited($bucket, $max, $window);
    if ($wait > 0) {
        header('Retry-After: ' . $wait);
        fail(429, 'too_many_requests', 'Demasiados intentos. Espere ' . (int) ceil($wait / 60) . ' minuto(s).');
    }
}

/* ---------- instalación ---------- */

const SETUP_TOKEN_FILE = 'setup-token.php';
const INSTALL_PROBE_FILE = 'install-probe.txt';

/**
 * Token de instalación vigente y su origen. Si config.php define un setup_token válido (16+), se usa ese.
 * Si no, se genera uno aleatorio en storage/setup-token.php: el instalador lo lee desde el Administrador
 * de archivos de Plesk (como el "initialAdminPassword" de otros sistemas). Es un .php que responde 404 si
 * alguien lo pide por web, además de estar en una carpeta bloqueada.
 *
 * @return array{0: string, 1: string} [token, origen 'config'|'file'|'none']
 */
function setup_token_info(bool $create = true): array
{
    $configured = (string) app_config()['setup_token'];
    if (strlen($configured) >= SETUP_TOKEN_MIN) {
        return [$configured, 'config'];
    }
    $file = storage_path(SETUP_TOKEN_FILE);
    if (is_file($file) && preg_match('/TOKEN:\s*([a-f0-9]{32,})/', (string) file_get_contents($file), $m)) {
        return [$m[1], 'file'];
    }
    if (!$create || !is_writable(storage_path())) {
        return ['', 'none'];
    }
    $token = bin2hex(random_bytes(20));
    $body = "<?php http_response_code(404); exit; ?>\n"
        . "Token de instalación del Contador de exposiciones.\n"
        . "Cópielo en el asistente de instalación. Se borra solo al crear la contraseña.\n"
        . "TOKEN: " . $token . "\n";
    if (@file_put_contents($file, $body, LOCK_EX) === false) {
        return ['', 'none'];
    }
    @chmod($file, 0640);
    return [$token, 'file'];
}

/** Borra los archivos temporales de la instalación (token y prueba de exposición). */
function cleanup_install_files(): void
{
    foreach ([SETUP_TOKEN_FILE, INSTALL_PROBE_FILE] as $name) {
        $file = storage_path($name);
        if (is_file($file)) {
            @unlink($file);
        }
    }
}
