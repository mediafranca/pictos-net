# UI_MAP — PICTOS.NET
> Mapa estructural de la interfaz. Fuente de verdad para todos los IDs semánticos.
> Actualizar este archivo siempre que se cree, renombre o elimine una región de la UI.

> Última actualización: 2026-02-26
> Cobertura: ~88% (estimado post-tarea)

## Estado de los IDs
- ✅ Implementado
- 🔲 Pendiente (el elemento existe pero sin ID semántico)
- 🆕 Nuevo (propuesto, no existe aún)

---

## Árbol de la interfaz

```
APP-SHELL (#app-shell) ✅[via div.min-h-screen]
│
├── HEADER (#toolbar) ✅
│   ├── #brand-area ✅                [logo + título, clickeable → home]
│   │   ├── LogoIcon (svg)
│   │   ├── #app-title (h1)          [config.author]
│   │   └── #tagline (span) ✅
│   │
│   ├── #search-area ✅              [flex-1, max-w-xl]
│   │   └── SearchComponent
│   │       ├── input (search/create utterance)
│   │       └── #search-suggestions  [dropdown z-50]
│   │
│   └── #header-actions ✅           [flex, gap-2, items-center]
│       ├── #lang-switcher           [select]
│       ├── #library-btn-group ✅    [botón split: Library + ChevronDown]
│       │   └── #library-dropdown ✅ [portal → document.body, z-[56]]
│       │       ├── Import
│       │       ├── Export
│       │       ├── Export SVGs
│       │       └── Delete All
│       ├── #settings-btn ✅
│       └── #console-btn ✅
│
├── #settings-panel (#globalSettings) ✅  [fixed, top-20, z-40, condicional]
│   └── grid 2-col simétrico
│       ├── COL-IZQ
│       │   ├── #field-author ✅          [input: config.author]
│       │   ├── #field-credits ✅         [textarea: config.credits — NUEVO]
│       │   ├── #field-license ✅         [select: CC / copyright]
│       │   └── #field-geo ✅             [GeoAutocomplete + lang input]
│       └── COL-DER
│           ├── #field-visual-style ✅    [textarea: visualStylePrompt, h-32]
│           ├── #field-aspect-ratio ✅    [select]
│           ├── #field-image-model ✅     [select]
│           └── #field-style-editor ✅    [button → StyleEditor modal]
│   (eliminado: #field-annotated-context — @deprecated, fuera de UI)
│
├── #main-content (#mainContent) ✅
│   │
│   ├── #sort-controls ✅            [condicional: viewMode=list]
│   │
│   ├── #home-view ✅                [condicional: viewMode=home]
│   │   ├── #hero-area ✅
│   │   │   ├── #hero-badge          [ScreenShare pill]
│   │   │   ├── h2 (config.author)
│   │   │   └── p (descripción)
│   │   ├── #import-card ✅          [upload .txt]
│   │   └── #example-libraries ✅   [grid de LibraryCards]
│   │
│   └── #list-view ✅                [condicional: viewMode=list]
│       └── RowComponent [#picto-row-{id}] ✅
│           │
│           ├── #row-header-{id} ✅  [p-6, flex, items-center]
│           │   ├── utterance-input  [.utterance-title]
│           │   ├── #pipeline-badges-{id} ✅
│           │   │   ├── Badge (COMPRENDER / nluStatus)
│           │   │   ├── Badge (COMPONER / visualStatus)
│           │   │   └── Badge (PRODUCIR / bitmapStatus)
│           │   ├── #picto-thumbnail-{id} ✅   [w-14, h-14]
│           │   └── #cascade-ctrl-{id} ✅      [Play | Stop]
│           │
│           └── #row-detail-{id} ✅  [p-8, border-t, grid-cols-3, condicional]
│               │
│               ├── StepBox [#block-nlu] ✅
│               │   └── SmartNLUEditor
│               │       ├── #nlu-context ✅          [lang dropdown, domain dropdown, geoContext]
│               │       ├── details (metadata/speech_act/intent)
│               │       ├── details (frames) — shows frame_label + frame_name
│               │       └── details (nsm/logical_form/pragmatics) — expanded by default
│               │
│               ├── StepBox [#block-compose] ✅
│               │   ├── #hierarchical-elements ✅  → ElementsEditor
│               │   └── #spatial-prompt ✅          → PromptRenderer / textarea
│               │
│               └── StepBox [#block-produce] ✅
│                   ├── #bitmap-preview ✅         [bg-neutral-200, flex, min-h-250]
│                   └── SVGGenerator
│                       └── #svg-output 🆕
│
├── #console-panel (#console) ✅      [fixed bottom-0, h-64, condicional]
│
└── MODALES (portales React, z-[60+])
    ├── FocusViewModal [.focus-modal-backdrop / .focus-modal-content] ✅
    │   ├── modo: nlu → SmartNLUEditor
    │   ├── modo: visual → ElementsEditor + PromptRenderer
    │   ├── modo: bitmap → imagen full
    │   └── modo: eval → layout 2-col (imagen + SVGGenerator)
    ├── StyleEditor
    │   ├── #style-editor-backdrop ✅        [fixed inset-0 z-[60], overlay blur]
    │   ├── #style-editor-modal ✅           [fixed inset-0 z-[61], centrado]
    │   │   └── #style-editor-panel ✅       [bg-white rounded-xl, flex-col]
    │   │       ├── #style-editor-modal-header ✅  [h-14, título + shape selector + export + close]
    │   │       └── #style-editor-root ✅          [lib interna, flex-col h-full]
    │   │           ├── #style-editor-content ✅   [área principal overflow-y-auto]
    │   │           ├── #style-editor-gallery ✅   [grid auto-fill 7.5em, StylePreviewCard × N]
    │   │           ├── #style-editor-code-view ✅ [vista CSS raw, condicional]
    │   │           └── #style-editor-animations-view ✅ [vista animaciones, condicional]
    │   └── EditModal [#style-edit-modal] ✅
    │       ├── #style-edit-modal-backdrop ✅
    │       ├── #style-edit-modal-header ✅
    │       ├── #style-edit-modal-selectors ✅
    │       ├── #style-edit-modal-properties ✅
    │       ├── #style-edit-modal-preview ✅
    │       └── #style-edit-modal-footer ✅
    │
    ├── SVGEditorModal [#svg-editor-modal] ✅ [fullscreen modal editor SVG]
    │   ├── #svg-editor-container ✅          [bg-slate-900, w-full h-full]
    │   ├── #svg-editor-header ✅             [h-16, bg-slate-800]
    │   │   └── #svg-editor-history-controls ✅ [undo/redo]
    │   ├── #svg-editor-tree-panel ✅         [aside w-80, izquierda]
    │   │   ├── #svg-editor-tree-header ✅    [label "Capas y estructura"]
    │   │   └── #svg-editor-tree-content ✅   [overflow-y-auto]
    │   │       └── SemanticTree [#svg-editor-tree] ✅
    │   │           └── TreeNode [#tree-node-{id}] ✅  [por cada elemento]
    │   ├── #svg-editor-canvas ✅             [main, flex-1]
    │   │   └── SVGCanvas                    [zoom controls, bounding box]
    │   └── #svg-editor-properties-panel ✅  [aside w-80, derecha]
    │       ├── #svg-editor-props-empty ✅    [cuando no hay selección]
    │       ├── #svg-editor-props-content ✅  [cuando hay elemento seleccionado]
    │       │   ├── #svg-editor-props-header ✅
    │       │   ├── #svg-editor-props-styles ✅   [Section A: galería citar/descitar clases]
    │       │   ├── #svg-editor-props-overrides ✅ [Section B: overrides locales por clase]
    │       │   │   └── CitedClassEditor × N      [por cada clase citada]
    │       │   ├── #svg-editor-props-identity ✅ [RenameField]
    │       │   └── #svg-editor-props-danger ✅   [DeleteButton]
    │       NOTE: #svg-editor-props-inline eliminado (modelo cero-inline)
    │
    ├── VectorizerModal ✅            [modal vectorizador bitmap→SVG]
    │   ├── #vectorizer-modal         [fixed inset-0 z-[50], dark backdrop]
    │   ├── #vectorizer-controls      [w-72, panel izq: segmented controls + actions]
    │   ├── #vectorizer-original      [flex-1, imagen bitmap original]
    │   └── #vectorizer-result        [flex-1, SVG result dangerouslySetInnerHTML]
    └── ConfirmDialog 🔲              [modal genérico confirmación]
```

---

## IDs prioritarios para implementar

Los siguientes IDs son los más importantes para poder dar instrucciones precisas a Claude Code:

| Prioridad | ID a implementar       | Ubicación en App.tsx              |
|-----------|------------------------|-----------------------------------|
| Alta      | `#brand-area`          | header, div con onClick home      |
| Alta      | `#search-area`         | header, div flex-1 max-w-xl       |
| Alta      | `#header-actions`      | header, div flex gap-2            |
| Alta      | `#home-view`           | main, div viewMode=home           |
| Alta      | `#list-view`           | main, div viewMode=list           |
| Media     | `#sort-controls`       | encima del list-view              |
| Media     | `#bitmap-preview`      | dentro de block-produce           |
| Media     | `#library-dropdown`    | dropdown del header               |
| Baja      | `#picto-row-{id}`      | renombrar pictogramRow-{id}       |
| Baja      | `#pipeline-badges-{id}`| div de badges en row header       |

---

## Notas de diseño

- **Grid principal**: El layout raíz es `flex-col`. El contenido principal usa `max-w-7xl mx-auto`.
- **Header**: `h-20` (80px), sticky top-0. Es la única referencia fija del layout.
- **#settings-panel**: `top-20` coincide con altura del header. Si el header cambia, ajustar.
- **#row-detail**: grid de 3 columnas (`lg:grid-cols-3`). Colapsa a 1 col en mobile.
- **Modales**: todos usan `fixed inset-0` con z-index desde `--z-modal-backdrop` (40) o superior.
- **#console-panel**: `fixed bottom-0`, altura fija `h-64`. No interfiere con el layout principal (el list-view tiene `pb-64`).
