<?php
/**
 * Configuración del Contador de exposiciones.
 *
 * Copie este archivo como config/config.php (no se versiona) y ajuste los valores.
 * Este directorio debe quedar FUERA de la raíz web (httpdocs/public).
 */
return [
    // Carpeta donde se guardan los datos JSON, las imágenes subidas y las sesiones.
    // Debe estar fuera de la raíz web y ser escribible por el usuario PHP de la suscripción.
    'storage_dir' => __DIR__ . '/../storage',

    // Token para crear la contraseña de administrador desde el navegador (primer uso).
    // Use un valor aleatorio de 32 caracteres o más. Solo funciona mientras no exista
    // una contraseña; después puede dejarlo vacío. Vacío = configuración web desactivada.
    'setup_token' => '',

    // Clave de ElevenLabs (opcional). Si se define aquí tiene prioridad sobre la que se
    // guarde desde la interfaz y no podrá cambiarse desde el navegador.
    'elevenlabs_api_key' => '',

    // Minutos de inactividad antes de cerrar la sesión del administrador.
    'session_idle_minutes' => 240,

    // Tamaño máximo de cada imagen subida (logo o fondo), en megabytes.
    'max_upload_mb' => 4,

    // Permitir logos en SVG. Se rechazan los SVG con scripts o referencias externas y se
    // sirven con una política CSP restrictiva (sandbox).
    'allow_svg' => true,
];
