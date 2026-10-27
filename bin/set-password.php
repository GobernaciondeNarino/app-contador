<?php
/**
 * Crea o cambia la contraseña de administrador desde la consola (SSH o tarea programada de Plesk).
 *
 *   php bin/set-password.php
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require dirname(__DIR__) . '/src/bootstrap.php';

ensure_storage();

fwrite(STDOUT, 'Nueva contraseña de administrador (mínimo 12 caracteres): ');
$hide = DIRECTORY_SEPARATOR === '/' && function_exists('shell_exec');
if ($hide) {
    shell_exec('stty -echo');
}
$password = rtrim((string) fgets(STDIN), "\r\n");
if ($hide) {
    shell_exec('stty echo');
}
fwrite(STDOUT, PHP_EOL);

if (mb_strlen($password, 'UTF-8') < 12) {
    fwrite(STDERR, "La contraseña debe tener al menos 12 caracteres.\n");
    exit(1);
}

with_lock(static function () use ($password) {
    write_json('auth.json', ['hash' => password_hash($password, PASSWORD_DEFAULT), 'updatedAt' => gmdate('c')]);
});
fwrite(STDOUT, "Contraseña guardada en " . storage_path('auth.json') . PHP_EOL);
