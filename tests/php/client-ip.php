<?php
// Prueba unitaria de client_ip(): solo se confía en CF-Connecting-IP si la conexión viene de Cloudflare.
declare(strict_types=1);
require dirname(__DIR__, 2) . '/src/bootstrap.php';

$cases = [
    // [REMOTE_ADDR, CF-Connecting-IP, esperado]
    ['162.158.10.20', '190.25.1.7', '190.25.1.7'],          // nodo Cloudflare IPv4
    ['2606:4700:10::ac43:1', '2800:e2:1::5', '2800:e2:1::5'], // nodo Cloudflare IPv6
    ['104.23.255.1', '190.25.1.7', '190.25.1.7'],            // límite superior de 104.16.0.0/13
    ['104.24.0.1', '190.25.1.7', '190.25.1.7'],              // 104.24.0.0/14
    ['200.1.2.3', '190.25.1.7', '200.1.2.3'],                // cabecera falsificada por un cliente directo
    ['104.32.0.1', '190.25.1.7', '104.32.0.1'],              // fuera de 104.16.0.0/13
    ['162.158.10.20', 'no-es-ip', '162.158.10.20'],          // valor inválido
    ['127.0.0.1', '', '127.0.0.1'],
];
$fail = 0;
foreach ($cases as [$remote, $cf, $expected]) {
    $_SERVER['REMOTE_ADDR'] = $remote;
    $_SERVER['HTTP_CF_CONNECTING_IP'] = $cf;
    $got = client_ip();
    if ($got !== $expected) {
        $fail++;
        fwrite(STDERR, "FAIL $remote / $cf => $got (esperado $expected)\n");
    }
}
echo $fail === 0 ? "ok " . count($cases) . "\n" : "fallos $fail\n";
exit($fail ? 1 : 0);
