# Graph Report - app-contador  (2026-10-28)

## Corpus Check
- 22 files · ~32,219 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 25 file(s) not represented in the graph (top: (none) 9, .woff2 8, .config 6)

## Summary
- 275 nodes · 604 edges · 13 communities (9 shown, 4 thin omitted)
- Extraction: 81% EXTRACTED · 19% INFERRED · 0% AMBIGUOUS · INFERRED: 112 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `afcaf184`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- bootstrap.php
- a11y.test.mjs
- Despliegue en Plesk
- app.js
- package.json
- create
- Contador de exposiciones · Gobernación de Nariño
- normalize_state
- Contador de exposiciones — design reference
- storage/README.md
- axe-resultados.md

## God Nodes (most connected - your core abstractions)
1. `create()` - 31 edges
2. `bind()` - 26 edges
3. `fail()` - 18 edges
4. `start()` - 16 edges
5. `renderTurnRows()` - 14 edges
6. `storage_path()` - 14 edges
7. `action_setup()` - 13 edges
8. `action_login()` - 13 edges
9. `renderPanel()` - 12 edges
10. `Despliegue en Plesk` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Contador de exposiciones — Gobernación de Nariño` --references--> `write_json()`  [INFERRED]
  CLAUDE.md → src/bootstrap.php
- `Contador de exposiciones — Gobernación de Nariño` --references--> `with_lock()`  [INFERRED]
  CLAUDE.md → src/bootstrap.php
- `3.2 Revisión estática (`tests/static.test.mjs`) — 8/8` --references--> `client_ip()`  [INFERRED]
  docs/INFORME-SEGURIDAD-ACCESIBILIDAD.md → src/bootstrap.php
- `3.4 Riesgos residuales y recomendaciones` --references--> `client_ip()`  [INFERRED]
  docs/INFORME-SEGURIDAD-ACCESIBILIDAD.md → src/bootstrap.php
- `{closure#5}()` --calls--> `referenced_assets()`  [INFERRED]
  public/api.php → src/validate.php

## Import Cycles
- None detected.

## Communities (13 total, 4 thin omitted)

### Community 0 - "bootstrap.php"
Cohesion: 0.12
Nodes (43): {closure#1}(), action_asset(), action_install_check(), action_login(), action_logout(), action_save(), action_session(), action_setup() (+35 more)

### Community 1 - "a11y.test.mjs"
Cohesion: 0.09
Nodes (18): AXE, { chromium }, REPORTS, require, results, TAGS, ADMIN_PASSWORD, Client (+10 more)

### Community 2 - "Despliegue en Plesk"
Cohesion: 0.13
Nodes (15): 10. Uso en el evento, 11. Solución de problemas, 1. Requisitos, 2. Estructura en el servidor, 3. Opción A: despliegue con Git (recomendada), 4. Opción B: subida manual (Administrador de archivos o FTP), 5. Configuración (opcional), 6. Asistente de instalación (+7 more)

### Community 3 - "app.js"
Cohesion: 0.10
Nodes (61): announce(), api(), applyBgFx(), applyMeta(), applyRemoteState(), applySession(), bind(), buildMask() (+53 more)

### Community 4 - "package.json"
Cohesion: 0.12
Nodes (16): description, devDependencies, axe-core@4.10.2, engines, node, license, name, private (+8 more)

### Community 5 - "create"
Cohesion: 0.13
Nodes (30): create(), buildStepList(), checkItem(), clean(), clearErrors(), close(), el(), field() (+22 more)

### Community 6 - "Contador de exposiciones · Gobernación de Nariño"
Cohesion: 0.07
Nodes (25): 1. Resumen, 2. Hallazgos en el diseño original y corrección aplicada, 3.1.1 Asistente de instalación, 3.1 API (`tests/security.test.mjs`) — 43/43, 3.2 Revisión estática (`tests/static.test.mjs`) — 8/8, 3.3 Semgrep, 3.4 Riesgos residuales y recomendaciones, 3. Pruebas de seguridad (+17 more)

### Community 7 - "normalize_state"
Cohesion: 0.23
Nodes (12): Contador de exposiciones — Gobernación de Nariño, graphify, defaultCfg(), clean_asset_ref(), clean_bool(), clean_enum(), clean_int(), clean_pattern() (+4 more)

### Community 10 - "Contador de exposiciones — design reference"
Cohesion: 0.40
Nodes (4): Contador de exposiciones — design reference, Contents, Uploaded files, Viewing

## Knowledge Gaps
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Contador de exposiciones — Gobernación de Nariño` connect `normalize_state` to `bootstrap.php`?**
  _High betweenness centrality (0.195) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `create()` (e.g. with `wizard.js` and `open()`) actually correct?**
  _`create()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Should `bootstrap.php` be split into smaller, more focused modules?**
  _Cohesion score 0.12217194570135746 - nodes in this community are weakly interconnected._
- **Why does `defaultCfg()` connect `normalize_state` to `app.js`?**
  _High betweenness centrality (0.185) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `bind()` (e.g. with `closeMenu()` and `openMenu()`) actually correct?**
  _`bind()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Should `a11y.test.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.08536585365853659 - nodes in this community are weakly interconnected._
- **Why does `client_ip()` connect `Contador de exposiciones · Gobernación de Nariño` to `bootstrap.php`?**
  _High betweenness centrality (0.145) - this node is a cross-community bridge._