<?php
/**
 * Validación y normalización del estado que se guarda en storage/state.json.
 * Todo campo desconocido se descarta; los números se acotan; los textos se limpian y recortan.
 */
declare(strict_types=1);

const COLOR_KEYS = [
    'bg', 'title', 'subtitle', 'header', 'green', 'yellow', 'red',
    'speaker', 'profession', 'label', 'text', 'accent', 'onYellow', 'onRed',
];

const DEFAULT_COLORS = [
    'bg' => '#FFFFFF', 'title' => '#000000', 'subtitle' => '#4A4A4A', 'header' => '#003366',
    'green' => '#10A13B', 'yellow' => '#FFD500', 'red' => '#D62828',
    'speaker' => '#000000', 'profession' => '#4A4A4A', 'label' => '#0B7A2C', 'text' => '#4A4A4A', 'accent' => '#10A13B',
    'onYellow' => '#000000', 'onRed' => '#FFFFFF',
];

final class ValidationError extends RuntimeException
{
    public string $field;

    public function __construct(string $field, string $message)
    {
        parent::__construct($message);
        $this->field = $field;
    }
}

function clean_text($value, string $field, int $max): string
{
    if ($value === null) {
        return '';
    }
    if (!is_string($value) && !is_int($value) && !is_float($value)) {
        throw new ValidationError($field, 'Debe ser texto.');
    }
    $value = (string) $value;
    if (!mb_check_encoding($value, 'UTF-8')) {
        throw new ValidationError($field, 'Codificación de texto inválida.');
    }
    // Quita caracteres de control (incluye saltos de línea: todos los campos son de una línea).
    $value = preg_replace('/[\x00-\x1F\x7F\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}]/u', '', $value);
    $value = trim($value);
    return mb_substr($value, 0, $max, 'UTF-8');
}

function clean_int($value, string $field, int $min, int $max): int
{
    if (is_string($value) && is_numeric($value)) {
        $value = (float) $value;
    }
    if (!is_int($value) && !is_float($value)) {
        throw new ValidationError($field, 'Debe ser un número.');
    }
    if (!is_finite((float) $value)) {
        throw new ValidationError($field, 'Número inválido.');
    }
    return (int) max($min, min($max, round((float) $value)));
}

function clean_bool($value): bool
{
    return $value === true || $value === 1 || $value === '1' || $value === 'true';
}

function clean_enum($value, string $field, array $allowed): string
{
    if (!is_string($value) || !in_array($value, $allowed, true)) {
        throw new ValidationError($field, 'Valor no permitido.');
    }
    return $value;
}

function clean_pattern($value, string $field, string $pattern, int $max): string
{
    $value = clean_text($value, $field, $max);
    if ($value !== '' && !preg_match($pattern, $value)) {
        throw new ValidationError($field, 'Formato no permitido.');
    }
    return $value;
}

function clean_asset_ref($value, string $field): string
{
    if ($value === null || $value === '') {
        return '';
    }
    if (!is_string($value) || !preg_match(ASSET_REF_PATTERN, $value, $m)) {
        throw new ValidationError($field, 'Referencia de imagen no válida.');
    }
    if (!is_file(storage_path('uploads' . DIRECTORY_SEPARATOR . $m[1]))) {
        throw new ValidationError($field, 'La imagen ya no existe en el servidor.');
    }
    return $value;
}

function normalize_state(array $input): array
{
    $cfg = $input['cfg'] ?? null;
    $turns = $input['turns'] ?? null;
    if (!is_array($cfg)) {
        throw new ValidationError('cfg', 'Falta la configuración.');
    }
    if (!is_array($turns) || array_values($turns) !== $turns) {
        throw new ValidationError('turns', 'La lista de turnos no es válida.');
    }
    if (count($turns) > 100) {
        throw new ValidationError('turns', 'Máximo 100 turnos.');
    }

    $colorsIn = is_array($cfg['colors'] ?? null) ? $cfg['colors'] : [];
    $colors = [];
    foreach (COLOR_KEYS as $key) {
        $c = $colorsIn[$key] ?? DEFAULT_COLORS[$key];
        if (!is_string($c) || !preg_match('/^#[0-9a-fA-F]{6}$/', $c)) {
            throw new ValidationError('colors.' . $key, 'Color no válido (use #RRGGBB).');
        }
        $colors[$key] = strtoupper($c);
    }

    $red = clean_int($cfg['redAt'] ?? 60, 'redAt', 5, 10800);
    $out = [
        'title' => clean_text($cfg['title'] ?? '', 'title', 160),
        'subtitle' => clean_text($cfg['subtitle'] ?? '', 'subtitle', 160),
        'footer' => clean_text($cfg['footer'] ?? '', 'footer', 160),
        'logo' => clean_asset_ref($cfg['logo'] ?? '', 'logo'),
        'bgImage' => clean_asset_ref($cfg['bgImage'] ?? '', 'bgImage'),
        'bgFit' => clean_enum($cfg['bgFit'] ?? 'cover', 'bgFit', ['cover', 'contain']),
        'bgOpacity' => clean_int($cfg['bgOpacity'] ?? 100, 'bgOpacity', 5, 100),
        'fxTarget' => clean_enum($cfg['fxTarget'] ?? 'text', 'fxTarget', ['text', 'bg']),
        'minutes' => clean_int($cfg['minutes'] ?? 5, 'minutes', 1, 180),
        'yellowAt' => max($red + 1, clean_int($cfg['yellowAt'] ?? 120, 'yellowAt', 10, 10800)),
        'redAt' => $red,
        'sound' => clean_bool($cfg['sound'] ?? true),
        'voice' => clean_bool($cfg['voice'] ?? true),
        'outline' => clean_bool($cfg['outline'] ?? true),
        'elVoice' => clean_pattern($cfg['elVoice'] ?? '', 'elVoice', '/^[A-Za-z0-9_-]+$/', 64),
        'elModel' => clean_pattern($cfg['elModel'] ?? 'eleven_multilingual_v2', 'elModel', '/^[A-Za-z0-9_.-]+$/', 64),
        'endPhrase' => clean_text($cfg['endPhrase'] ?? '', 'endPhrase', 200),
        'startPhrase' => clean_text($cfg['startPhrase'] ?? '', 'startPhrase', 200),
        'colors' => $colors,
    ];

    $cleanTurns = [];
    foreach ($turns as $i => $t) {
        if (!is_array($t)) {
            throw new ValidationError("turns.$i", 'Turno no válido.');
        }
        $cleanTurns[] = [
            'name' => clean_text($t['name'] ?? '', "turns.$i.name", 120),
            'profession' => clean_text($t['profession'] ?? '', "turns.$i.profession", 120),
            'minutes' => clean_int($t['minutes'] ?? 5, "turns.$i.minutes", 1, 180),
        ];
    }

    return ['cfg' => $out, 'turns' => $cleanTurns];
}

/** Nombres de archivo de imágenes referenciadas por el estado. */
function referenced_assets(?array $state): array
{
    $ids = [];
    foreach (['logo', 'bgImage'] as $k) {
        $ref = $state['cfg'][$k] ?? '';
        if (is_string($ref) && preg_match(ASSET_REF_PATTERN, $ref, $m)) {
            $ids[] = $m[1];
        }
    }
    return $ids;
}
