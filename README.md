# [PICTOS.NET](https://pictos.net)

**Pictogramas generativos para la Comunicación Aumentativa y Alternativa (CAA)**

* [![Netlify Status](https://api.netlify.com/api/v1/badges/24f068d3-f368-4526-a503-2f09af1def0b/deploy-status)](https://app.netlify.com/projects/pictos/deploys)
* ![opensource](https://img.shields.io/badge/opensource--always-available-blue)


PICTOS.NET transforma intenciones comunicativas expresadas en lenguaje natural en pictogramas mediante un pipeline de razonamiento semántico. Es parte de la investigación doctoral de [Herbert Spencer](https://herbertspencer.net/cc) y de **[MediaFranca](https://github.com/mediafranca)** — una iniciativa de código abierto de bien público para la CAA.


La rama de desarrollo `lab` contiene la siguiente versión:

* ver: [PICTOS-NEXT](pictos-next.netlify.app)
* [![Netlify Status](https://api.netlify.com/api/v1/badges/c3a0cb25-110a-49a6-9d9b-05ccf7a72347/deploy-status)](https://app.netlify.com/projects/pictos-next/deploys)

---

## Cómo funciona

El sistema implementa un pipeline de tres fases, cada una visible y editable:

```
Utterance → NLU (NSM) → Composición visual → Bitmap (Gemini)
                                                     ↓
                                          Vectorización (vtracer)
                                                     ↓
                                       SVG semántico (mf-svg-schema)
```

**1. Comprender (NLU)** — Análisis lingüístico profundo basado en Natural Semantic Metalanguage (NSM), un conjunto de 65 primitivos semánticos universales presentes en todas las lenguas humanas. El resultado es un esquema estructurado que captura la intención comunicativa, los roles semánticos y las instrucciones visuales.

**2. Componer** — A partir del análisis NLU, el sistema genera una jerarquía de elementos visuales (`elements`) y una descripción de su articulación espacial (`prompt`). Estos dos artefactos son el blueprint del pictograma.

**3. Producir** — Gemini renderiza la imagen a partir del blueprint. El resultado es un bitmap PNG que puede vectorizarse para obtener un SVG semántico estructurado según [mf-svg-schema](https://github.com/mediafranca/mf-svg-schema), con metadatos de accesibilidad embebidos.

Cada fase se puede regenerar de forma independiente y editar manualmente antes de continuar al siguiente paso. Los pictogramas generados pueden evaluarse con el marco [ICAP](https://github.com/mediafranca/ICAP).

## Esquema detallado

```mermaid
%%{init: {
  'theme': 'base',
  'themeVariables': {
    'primaryColor': '#e8f0fe',
    'primaryTextColor': '#1a1a2e',
    'primaryBorderColor': '#4a6fa5',
    'secondaryColor': '#f0f0f0',
    'lineColor': '#888',
    'fontSize': '13px',
    'fontFamily': 'Lexend, system-ui, sans-serif',
    'edgeLabelBackground': '#ffffffcc'
  },
  'flowchart': {
    'padding': 20,
    'nodeSpacing': 35,
    'rankSpacing': 45,
    'curve': 'basis',
    'htmlLabels': true
  }
}}%%
flowchart TD
    UTT["<b>utterance</b><br><i>intencion comunicativa</i>"]

    subgraph CFG["<b>GlobalConfig</b> (Settings)"]
        direction TB
        cfg_lang["<b>lang</b><br>geoContext<br>annotatedContext"]
        cfg_visual["<b>visualStylePrompt</b><br>estilo grafico global"]
        cfg_css["<b>svgStyleDefs</b><br>svgKeyframes"]
        cfg_img["<b>imageModel</b> flash|pro<br><b>aspectRatio</b> 1:1, 3:4..."]
    end

    subgraph F1["<b>COMPRENDER</b> — Gemini 3 Pro"]
        direction TB
        f1_in["NSM Schema Engine<br>65 primos universales<br>nlu-schema v1.0"]
        f1_out["<b>NLUData</b><br>frames, nsm_explications<br>visual_guidelines, pragmatics"]
    end

    subgraph F2["<b>COMPONER</b> — Gemini 3 Pro"]
        direction TB
        f2a["Visual Topology Node<br>NLU &#8594; jerarquia visual"]
        f2b["Spatial Articulation Node<br><i>(refinamiento opcional)</i>"]
        f2_elem["<b>elements</b><br>VisualElement tree"]
        f2_prompt["<b>prompt</b><br>composicion espacial"]
    end

    subgraph F3["<b>PRODUCIR</b> — Gemini Image"]
        direction TB
        f3_merge["<b>fullPrompt</b> combina:<br>utterance + NLU context<br>+ elements + prompt<br>+ visualStylePrompt"]
        f3_gen["Gemini flash | pro<br>sin texto, flat design<br>fondo blanco"]
        f3_post["resize 800x800<br>JPEG q=0.70"]
        f3_out["<b>bitmap</b><br>base64 data URL"]
    end

    subgraph F4["<b>VECTORIZAR</b> — WASM local"]
        direction TB
        f4_proc["BinaryImageConverter<br>extrae colores unicos<br>mascara binaria por capa<br>spline | polygon | none"]
        f4_out["<b>rawSvg</b><br>multicolor, sin semantica"]
    end

    subgraph F5["<b>ESTRUCTURAR</b> — Gemini 3 Pro"]
        direction TB
        f5_multi["<b>MULTIMODAL</b><br>bitmap PNG + rawSvg<br>+ elements + CSS"]
        f5_proc["Distribuye paths en<br>grupos semanticos<br>Sanitiza inline styles<br>Fuerza clases CSS"]
        f5_out["<b>structuredSvg</b><br>mf-svg-schema"]
    end

    subgraph ROW["<b>RowData</b> — estado acumulativo por fila"]
        direction LR
        r1["NLU"]
        r2["elements<br>prompt"]
        r3["bitmap"]
        r4["rawSvg"]
        r5["structuredSvg"]
    end

    %% Flujo principal
    UTT --> F1
    cfg_lang --> F1
    f1_in --> f1_out

    f1_out --> F2
    cfg_css -.->|availableClasses| F2
    f2a --> f2b
    f2a --> f2_elem
    f2b --> f2_prompt

    f2_elem --> F3
    f2_prompt --> F3
    cfg_visual --> f3_merge
    cfg_img --> f3_gen
    f1_out -.->|intent, focus, action| f3_merge
    UTT -.->|contexto original| f3_merge
    f3_merge --> f3_gen --> f3_post --> f3_out

    f3_out --> F4
    f4_proc --> f4_out

    f4_out --> F5
    f3_out -.->|referencia visual| f5_multi
    f2_elem -.->|estructura DOM| f5_multi
    f1_out -.->|contexto semantico| f5_multi
    cfg_css -->|generateCssString| f5_multi
    f5_multi --> f5_proc --> f5_out

    %% Acumulacion en RowData
    f1_out --> r1
    f2_elem --> r2
    f2_prompt --> r2
    f3_out --> r3
    f4_out --> r4
    f5_out --> r5

    %% Colores por fase
    style UTT fill:#fff3cd,stroke:#e6a800,stroke-width:2px,color:#664d00
    style CFG fill:#f5f5f5,stroke:#aaa,stroke-width:1px,color:#555

    style cfg_lang fill:#e9e9e9,stroke:#bbb,color:#444
    style cfg_visual fill:#e9e9e9,stroke:#bbb,color:#444
    style cfg_css fill:#e9e9e9,stroke:#bbb,color:#444
    style cfg_img fill:#e9e9e9,stroke:#bbb,color:#444

    style F1 fill:#dbeafe,stroke:#3b82f6,stroke-width:2px
    style f1_in fill:#eff6ff,stroke:#93c5fd,color:#1e40af
    style f1_out fill:#bfdbfe,stroke:#3b82f6,stroke-width:2px,color:#1e3a5f

    style F2 fill:#d1fae5,stroke:#10b981,stroke-width:2px
    style f2a fill:#ecfdf5,stroke:#6ee7b7,color:#065f46
    style f2b fill:#ecfdf5,stroke:#6ee7b7,color:#065f46
    style f2_elem fill:#a7f3d0,stroke:#10b981,stroke-width:2px,color:#064e3b
    style f2_prompt fill:#a7f3d0,stroke:#10b981,stroke-width:2px,color:#064e3b

    style F3 fill:#ffedd5,stroke:#f97316,stroke-width:2px
    style f3_merge fill:#fff7ed,stroke:#fdba74,color:#7c2d12
    style f3_gen fill:#fff7ed,stroke:#fdba74,color:#7c2d12
    style f3_post fill:#fff7ed,stroke:#fdba74,color:#7c2d12
    style f3_out fill:#fed7aa,stroke:#f97316,stroke-width:2px,color:#7c2d12

    style F4 fill:#ede9fe,stroke:#8b5cf6,stroke-width:2px
    style f4_proc fill:#f5f3ff,stroke:#c4b5fd,color:#4c1d95
    style f4_out fill:#ddd6fe,stroke:#8b5cf6,stroke-width:2px,color:#4c1d95

    style F5 fill:#fce7f3,stroke:#ec4899,stroke-width:2px
    style f5_multi fill:#fdf2f8,stroke:#f9a8d4,color:#831843
    style f5_proc fill:#fdf2f8,stroke:#f9a8d4,color:#831843
    style f5_out fill:#fbcfe8,stroke:#ec4899,stroke-width:2px,color:#831843

    style ROW fill:#fafafa,stroke:#333,stroke-width:3px
    style r1 fill:#bfdbfe,stroke:#3b82f6,color:#1e3a5f
    style r2 fill:#a7f3d0,stroke:#10b981,color:#064e3b
    style r3 fill:#fed7aa,stroke:#f97316,color:#7c2d12
    style r4 fill:#ddd6fe,stroke:#8b5cf6,color:#4c1d95
    style r5 fill:#fbcfe8,stroke:#ec4899,color:#831843
```


---

## Filosofía

Los pictogramas son más que ilustraciones: son actos comunicativos. PICTOS propone que para generar un buen pictograma hay que primero *comprender profundamente* qué se quiere comunicar, antes de decidir cómo visualizarlo.

El proyecto nace de una convicción: **la comunicación visual debe ser explicable y accesible, basada en el contexto**. 

Los pictogramas generados buscan reducir barreras cognitivas, facilitar la expresión de necesidades básicas y contribuir a la autonomía de personas con diversidad funcional.

---

## Ecosistema MediaFranca

PICTOS.NET es parte de [MediaFranca](https://github.com/mediafranca), un conjunto de esquemas abiertos para la comunicación aumentativa y alternativa:

| Repositorio | Descripción |
|---|---|
| [nlu-schema](https://github.com/mediafranca/nlu-schema) | Esquema de análisis lingüístico profundo basado en NSM |
| [mf-svg-schema](https://github.com/mediafranca/mf-svg-schema) | Estándar para pictogramas SVG semánticos y autocontenidos |
| [ICAP](https://github.com/mediafranca/ICAP) | Marco de evaluación de pictogramas (6 dimensiones cognitivas) |
| [pictos.cl](https://pictos.cl) | Plataforma de apoyos visuales para servicios públicos (Núcleo Accesibilidad PUCV) |

`nlu-schema` y `mf-svg-schema` se incluyen como git submodules en este repositorio, lo que permite versionado explícito y reproducibilidad científica.

---

## Uso

**Aplicación web**: [pictos.net](https://pictos.net)

Los pictogramas y datos se almacenan **localmente en el navegador** (IndexedDB + localStorage). Para respaldar tu trabajo usa **Exportar Librería** — genera un JSON con todas las imágenes y metadatos del pipeline.

Puedes compartir tu grafo exportado con comentarios a [hspencer@ead.cl](mailto:hspencer@ead.cl). Esto ayuda a mejorar el sistema y construir corpus de investigación.

---

## Desarrollo local

```bash
git clone --recurse-submodules https://github.com/hspencer/pictos-net.git
cd pictos-net
cp .env.example .env        # agrega tu GEMINI_API_KEY
npm install
npm run dev                 # → http://localhost:3000
```

Obtén tu API key en [Google AI Studio](https://aistudio.google.com/app/apikey).

Ver [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md) para instrucciones completas, incluyendo deployment en GitHub Pages.

---

## Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Zustand
- Google Gemini API
- vtracer WASM
- IndexedDB

---

## Documentación

### Arquitectura y desarrollo

| Documento | Descripción |
|---|---|
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Arquitectura técnica, modelos de datos, servicios |
| [docs/PIPELINE.md](./docs/PIPELINE.md) | Pipeline de generación paso a paso |
| [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md) | Guía de desarrollo, submodules, i18n, deployment |
| [docs/SECURITY.md](./docs/SECURITY.md) | Gestión de API keys, consideraciones de seguridad |
| [docs/PROMPT_MAESTRO.md](./docs/PROMPT_MAESTRO.md) | Prompt principal de Gemini documentado |

### Interfaz de usuario

| Documento | Descripción |
|---|---|
| [docs/UI_MAP.md](./docs/UI_MAP.md) | Mapa estructural de la UI: todos los IDs semánticos |
| [docs/UI_CONVENTIONS.md](./docs/UI_CONVENTIONS.md) | Convenciones de diseño: colores, tipografía, z-index |
| [docs/TUTORIAL.md](./docs/TUTORIAL.md) | Tutorial de uso paso a paso |

---

## Comunidad

PICTOS invita a **lingüistas** a refinar el análisis NLU y NSM, **diseñadores** a mejorar la composición visual, a **educadores y sicólogos** a imaginar nuevos escenarios de uso, **investigadores** a validar métricas de calidad, y **desarrolladores** a extender las funcionalidades.

Las contribuciones son bienvenidas. Reporta bugs, propone features o abre un Pull Request en GitHub.

---

## Citar

```
Spencer, H. (2026). PICTOS.NET: Pictogramas generativos para la accesibilidad cognitiva.
MediaFranca. https://pictos.net
```

---

*Licencia: Apache 2.0 (código) · CC-BY-4.0 (pictogramas generados, según elección del usuario)*

---

## Convención de interfaz

La UI sigue una convención estricta de IDs semánticos documentada en
[docs/UI_MAP.md](./docs/UI_MAP.md). Todo componente de región o sección principal
debe tener un `id` semántico. Antes de modificar cualquier componente de interfaz,
leer [docs/UI_CONVENTIONS.md](./docs/UI_CONVENTIONS.md).
