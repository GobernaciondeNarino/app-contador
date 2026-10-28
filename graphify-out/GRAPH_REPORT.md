# Graph Report - app-contador  (2026-10-28)

## Corpus Check
- 21 files · ~26,447 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 25 file(s) not represented in the graph (top: (none) 9, .woff2 8, .config 6)

## Summary
- 233 nodes · 503 edges · 16 communities (12 shown, 4 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 80 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2dc18419`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- bootstrap.php
- a11y.test.mjs
- Despliegue en Plesk
- bind
- package.json
- app.js
- Contador de exposiciones · Gobernación de Nariño
- normalize_state
- renderTurnRows
- loadInitial
- Contador de exposiciones — design reference
- tick
- storage/README.md
- axe-resultados.md

## God Nodes (most connected - your core abstractions)
1. `bind()` - 25 edges
2. `fail()` - 17 edges
3. `renderTurnRows()` - 14 edges
4. `action_setup()` - 13 edges
5. `action_login()` - 13 edges
6. `renderPanel()` - 12 edges
7. `Despliegue en Plesk` - 12 edges
8. `storage_path()` - 11 edges
9. `read_json()` - 11 edges
10. `action_save()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Contador de exposiciones — Gobernación de Nariño` --references--> `defaultCfg()`  [INFERRED]
  CLAUDE.md → public/assets/js/app.js
- `Contador de exposiciones — Gobernación de Nariño` --references--> `write_json()`  [INFERRED]
  CLAUDE.md → src/bootstrap.php
- `Contador de exposiciones — Gobernación de Nariño` --references--> `with_lock()`  [INFERRED]
  CLAUDE.md → src/bootstrap.php
- `3.2 Revisión estática (`tests/static.test.mjs`) — 8/8` --references--> `client_ip()`  [INFERRED]
  docs/INFORME-SEGURIDAD-ACCESIBILIDAD.md → src/bootstrap.php
- `3.4 Riesgos residuales y recomendaciones` --references--> `client_ip()`  [INFERRED]
  docs/INFORME-SEGURIDAD-ACCESIBILIDAD.md → src/bootstrap.php

## Import Cycles
- None detected.

## Communities (16 total, 4 thin omitted)

### Community 0 - "bootstrap.php"
Cohesion: 0.13
Nodes (41): {closure#1}(), action_asset(), action_login(), action_logout(), action_save(), action_session(), action_setup(), action_state() (+33 more)

### Community 1 - "a11y.test.mjs"
Cohesion: 0.08
Nodes (19): AXE, { chromium }, REPORTS, require, results, TAGS, ADMIN_PASSWORD, Client (+11 more)

### Community 2 - "Despliegue en Plesk"
Cohesion: 0.15
Nodes (13): 10. Uso en el evento, 11. Solución de problemas, 1. Requisitos, 2. Estructura en el servidor, 3. Opción A: despliegue con Git (recomendada), 4. Opción B: subida manual (Administrador de archivos o FTP), 5. Configuración, 6. Crear la contraseña de administrador (+5 more)

### Community 3 - "bind"
Cohesion: 0.19
Nodes (19): api(), bind(), chimeEnd(), chimeMinute(), closeMenu(), ensureAudio(), flashStatus(), openMenu() (+11 more)

### Community 4 - "package.json"
Cohesion: 0.12
Nodes (16): description, devDependencies, axe-core@4.10.2, engines, node, license, name, private (+8 more)

### Community 5 - "app.js"
Cohesion: 0.24
Nodes (14): applyBgFx(), applyRemoteState(), buildMask(), contrast(), defaultCfg(), digitColors(), fmt(), frame() (+6 more)

### Community 6 - "Contador de exposiciones · Gobernación de Nariño"
Cohesion: 0.08
Nodes (24): 1. Resumen, 2. Hallazgos en el diseño original y corrección aplicada, 3.1 API (`tests/security.test.mjs`) — 41/41, 3.2 Revisión estática (`tests/static.test.mjs`) — 8/8, 3.3 Semgrep, 3.4 Riesgos residuales y recomendaciones, 3. Pruebas de seguridad, 4.1 axe-core (`tests/a11y.test.mjs`) (+16 more)

### Community 7 - "normalize_state"
Cohesion: 0.26
Nodes (11): Contador de exposiciones — Gobernación de Nariño, graphify, clean_asset_ref(), clean_bool(), clean_enum(), clean_int(), clean_pattern(), clean_text() (+3 more)

### Community 8 - "renderTurnRows"
Cohesion: 0.32
Nodes (12): announce(), button(), clamp(), iconButton(), loadTurn(), markDirty(), moveTurn(), removeTurn() (+4 more)

### Community 9 - "loadInitial"
Cohesion: 0.25
Nodes (9): applyMeta(), applySession(), fitCanvas(), initCanvas(), loadInitial(), renderAll(), renderLook(), safeImageSrc() (+1 more)

### Community 10 - "Contador de exposiciones — design reference"
Cohesion: 0.40
Nodes (4): Contador de exposiciones — design reference, Contents, Uploaded files, Viewing

### Community 11 - "tick"
Cohesion: 0.70
Nodes (5): phase(), renderTime(), renderTimer(), spokenTime(), tick()

## Knowledge Gaps
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Contador de exposiciones — Gobernación de Nariño` connect `normalize_state` to `bootstrap.php`, `app.js`?**
  _High betweenness centrality (0.243) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `bind()` (e.g. with `closeMenu()` and `openMenu()`) actually correct?**
  _`bind()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `bootstrap.php` be split into smaller, more focused modules?**
  _Cohesion score 0.12943262411347517 - nodes in this community are weakly interconnected._
- **Why does `defaultCfg()` connect `app.js` to `normalize_state`?**
  _High betweenness centrality (0.231) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `fail()` (e.g. with `action_asset()` and `action_login()`) actually correct?**
  _`fail()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Should `a11y.test.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.08292682926829269 - nodes in this community are weakly interconnected._
- **Why does `client_ip()` connect `Contador de exposiciones · Gobernación de Nariño` to `bootstrap.php`?**
  _High betweenness centrality (0.177) - this node is a cross-community bridge._