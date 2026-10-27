# Contador de exposiciones — Gobernación de Nariño

- Frontend estático sin dependencias en `public/` (index.html, assets/js/app.js, assets/css/app.css). Todo texto de usuario se pinta con `textContent`; nunca `innerHTML`. La CSP no permite scripts ni estilos en línea: no agregar atributos `style=` ni `<script>` en línea (usar `el.style.x` desde JS).
- Backend PHP 7.4+ en `public/api.php` + `src/`; datos en JSON dentro de `storage/` (fuera de la raíz web). Toda escritura pasa por `with_lock()` + `write_json()` y todo dato guardado por `normalize_state()` en `src/validate.php`.
- Si se agrega un color o campo de configuración, actualizar a la vez `DEFAULT_COLORS`/`defaultCfg()` en app.js y `COLOR_KEYS`/`DEFAULT_COLORS`/`normalize_state()` en validate.php.
- Identidad visual: Hind Madurai (títulos), Nunito Sans (texto), `#10A13B`, `#FFD500`, `#003366`, `#4A4A4A`. Mantener contraste WCAG 2.1 AA.
- Pruebas: `npm test` (sintaxis, seguridad de la API, revisión estática, axe-core + teclado). Documentación en español, en `.md`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
