<?php
// Router para `php -S` que imita el despliegue real en Plesk: el repositorio completo en /app/tiempo/ y el
// .htaccess de la raíz reescribiendo internamente /app/tiempo/X → /app/tiempo/public/X. Igual que Apache,
// SCRIPT_NAME queda con la ruta reescrita (/app/tiempo/public/api.php) aunque el navegador pidió /app/tiempo/api.php.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$public = dirname(__DIR__, 2) . '/public';
if (strpos($path, '/app/tiempo/') !== 0) {
    http_response_code(404);
    return true;
}
$rel = substr($path, strlen('/app/tiempo/'));
if ($rel === '' ) {
    $rel = 'index.html';
}
$file = realpath($public . '/' . $rel);
if ($file === false || strpos($file, $public) !== 0 || !is_file($file)) {
    http_response_code(404);
    return true;
}
if (substr($file, -4) === '.php') {
    $_SERVER['SCRIPT_NAME'] = '/app/tiempo/public/' . $rel;
    $_SERVER['SCRIPT_FILENAME'] = $file;
    $_SERVER['PHP_SELF'] = $_SERVER['SCRIPT_NAME'];
    require $file;
    return true;
}
$types = ['html' => 'text/html; charset=utf-8', 'js' => 'application/javascript', 'css' => 'text/css', 'svg' => 'image/svg+xml', 'woff2' => 'font/woff2'];
$ext = pathinfo($file, PATHINFO_EXTENSION);
header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
readfile($file);
return true;
