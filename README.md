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

El sistema implementa un pipeline de tres fases automáticas más dos de post-procesamiento opcional. Cada fase es visible, editable y regenerable de forma independiente:

**① Comprender** (Gemini 2.5 Flash) — Análisis lingüístico profundo basado en Natural Semantic Metalanguage (NSM): 65 primitivos semánticos universales. Produce un esquema estructurado con intención comunicativa, dominio, roles semánticos (FrameNet) e instrucciones visuales.

**② Componer** (Gemini 2.5 Flash) — Traduce el análisis NLU a una jerarquía de elementos visuales (`elements`) y una descripción de articulación espacial (`prompt`). Si el usuario edita los elementos, puede regenerar solo el prompt sin repetir toda la composición.

**③ Producir** (Gemini Image) — Renderiza el pictograma combinando el contexto semántico, los elementos, el prompt espacial y el estilo visual global. Resultado: bitmap JPEG 800×800.

**④ Vectorizar** (vtracer WASM, local) — Convierte el bitmap a SVG mediante clustering jerarquico de color (ColorImageConverter nativo de visioncortex). Proceso local, sin API. Resultado: SVG crudo sin semantica.

**⑤ Estructurar** (Gemini 3 Pro, multimodal) — Reorganiza los paths del SVG crudo en grupos semánticos según la jerarquía de elementos, embebiendo metadatos de accesibilidad según [mf-svg-schema](https://github.com/mediafranca/mf-svg-schema).

Las fases ④ y ⑤ son opcionales y las inicia el usuario manualmente. La cascada automática (①→②→③) se ejecuta al crear una nueva frase o presionar Play en una fila. Los pictogramas generados pueden evaluarse con el marco [ICAP](https://github.com/mediafranca/ICAP).

## Esquema detallado

```mermaid
%%{init: {
  'theme': 'base',
  'themeVariables': {
    'primaryColor': '#e8f0fe',
    'primaryTextColor': '#1a1a2e',
    'primaryBorderColor': '#4a6fa5',
    'lineColor': '#888',
    'fontSize': '13px',
    'fontFamily': 'Lexend, system-ui, sans-serif'
  },
  'flowchart': {
    'padding': 20,
    'nodeSpacing': 35,
    'rankSpacing': 45,
    'curve': 'basis'
  }
}}%%
flowchart TD
    UTT["<b>utterance</b><br><i>intención comunicativa</i>"]

    subgraph CFG["<b>GlobalConfig</b>"]
        direction TB
        cfg_lang["lang · geoContext<br>annotatedContext"]
        cfg_visual["visualStylePrompt"]
        cfg_css["svgStyleDefs · svgKeyframes"]
        cfg_img["imageModel flash|pro<br>aspectRatio"]
    end

    subgraph F1["<b>① COMPRENDER</b> — Gemini 2.5 Flash"]
        direction TB
        f1_proc["NSM Schema Engine<br>65 primos universales<br>nlu-schema v1.0"]
        f1_out["<b>NLUData</b><br>domain · frames · frame_label<br>nsm_explications<br>visual_guidelines · pragmatics"]
    end

    subgraph F2["<b>② COMPONER</b> — Gemini 2.5 Flash"]
        direction TB
        f2a["Visual Topology Node<br><i>genera elements + prompt<br>en una sola llamada</i>"]
        f2b["Spatial Articulation Node<br><i>solo en regeneración manual<br>cuando usuario edita elements</i>"]
        f2_elem["<b>elements</b><br>VisualElement tree"]
        f2_prompt["<b>prompt</b><br>composición espacial"]
    end

    subgraph F3["<b>③ PRODUCIR</b> — Gemini Image"]
        direction TB
        f3_merge["<b>fullPrompt</b> combina:<br>utterance + NLU context<br>+ domain + elements + prompt<br>+ visualStylePrompt"]
        f3_gen["flash-image | pro-image<br>sin texto · flat design<br>fondo blanco"]
        f3_post["resize 800×800 · JPEG q=0.70"]
        f3_out["<b>bitmap</b><br>base64 data URL"]
    end

    subgraph POST["Post-procesamiento — manual, opcional"]
        direction TB
        subgraph F4["<b>④ VECTORIZAR</b> — WASM local"]
            direction TB
            f4_proc["vtracer · BinaryImageConverter<br>extrae colores · máscara binaria<br>spline | polygon | none"]
            f4_out["<b>rawSvg</b><br>multicolor · sin semántica"]
        end

        subgraph F5["<b>⑤ ESTRUCTURAR</b> — Gemini 3 Pro ⚡stream"]
            direction TB
            f5_multi["<b>MULTIMODAL</b><br>bitmap PNG + rawSvg<br>+ elements + CSS"]
            f5_proc["Agrupa paths en g semánticos<br>Sanitiza inline styles<br>Aplica clases CSS"]
            f5_out["<b>structuredSvg</b><br>mf-svg-schema"]
        end
    end

    subgraph ROW["<b>RowData</b> — estado acumulativo por fila"]
        direction LR
        r1["NLU"]
        r2["elements<br>prompt"]
        r3["bitmap"]
        r4["rawSvg"]
        r5["structuredSvg"]
    end

    %% Flujo principal (cascada automática)
    UTT ==> F1
    cfg_lang --> F1
    f1_proc --> f1_out

    f1_out ==> F2
    cfg_css -.->|availableClasses| F2
    f2a --> f2_elem
    f2a --> f2_prompt
    f2b -.->|"regenera solo prompt"| f2_prompt

    f2_elem ==> F3
    f2_prompt ==> F3
    cfg_visual --> f3_merge
    cfg_img --> f3_gen
    f1_out -.->|"intent · domain · focus"| f3_merge
    UTT -.->|contexto original| f3_merge
    f3_merge --> f3_gen --> f3_post --> f3_out

    %% Post-procesamiento (usuario lo inicia manualmente)
    f3_out -.->|"usuario inicia"| F4
    f4_proc --> f4_out

    f4_out -.-> F5
    f3_out -.->|referencia visual| f5_multi
    f2_elem -.->|estructura DOM| f5_multi
    f1_out -.->|contexto semántico| f5_multi
    cfg_css -->|generateCssString| f5_multi
    f5_multi --> f5_proc --> f5_out

    %% Acumulación en RowData
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
    style f1_proc fill:#eff6ff,stroke:#93c5fd,color:#1e40af
    style f1_out fill:#bfdbfe,stroke:#3b82f6,stroke-width:2px,color:#1e3a5f

    style F2 fill:#d1fae5,stroke:#10b981,stroke-width:2px
    style f2a fill:#ecfdf5,stroke:#6ee7b7,color:#065f46
    style f2b fill:#ecfdf5,stroke:#6ee7b7,color:#065f46,stroke-dasharray: 5 5
    style f2_elem fill:#a7f3d0,stroke:#10b981,stroke-width:2px,color:#064e3b
    style f2_prompt fill:#a7f3d0,stroke:#10b981,stroke-width:2px,color:#064e3b

    style F3 fill:#ffedd5,stroke:#f97316,stroke-width:2px
    style f3_merge fill:#fff7ed,stroke:#fdba74,color:#7c2d12
    style f3_gen fill:#fff7ed,stroke:#fdba74,color:#7c2d12
    style f3_post fill:#fff7ed,stroke:#fdba74,color:#7c2d12
    style f3_out fill:#fed7aa,stroke:#f97316,stroke-width:2px,color:#7c2d12

    style POST fill:#f8f8ff,stroke:#999,stroke-width:1px,stroke-dasharray: 8 4
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

### Modelo de retroalimentación

Cada campo es editable. Al modificar un dato, los pasos posteriores se marcan como `outdated` (desactualizado) y el usuario puede regenerarlos selectivamente:

```mermaid
%%{init: {
  'theme': 'base',
  'themeVariables': {
    'primaryColor': '#fafafa',
    'primaryTextColor': '#1a1a2e',
    'lineColor': '#888',
    'fontSize': '12px',
    'fontFamily': 'Lexend, system-ui, sans-serif'
  },
  'flowchart': { 'curve': 'basis' }
}}%%
flowchart LR
    subgraph EDIT["Edición del usuario"]
        e1["✏️ Edita <b>utterance</b>"]
        e2["✏️ Edita <b>NLU</b>"]
        e3["✏️ Edita <b>elements</b>"]
        e4["✏️ Edita <b>prompt</b>"]
    end

    subgraph INVALIDATION["Campos invalidados"]
        nlu_out["⚠️ NLU outdated"]
        vis_out["⚠️ visual outdated"]
        bmp_out["⚠️ bitmap outdated"]
    end

    subgraph REGEN["Regeneración disponible"]
        r1["▶ Regenerar NLU"]
        r2["▶ Regenerar composición"]
        r2b["▶ Regenerar solo prompt"]
        r3["▶ Regenerar imagen"]
        r_all["▶▶ Cascada completa"]
    end

    e1 --> nlu_out
    e1 --> vis_out
    e1 --> bmp_out

    e2 --> vis_out
    e2 --> bmp_out

    e3 --> bmp_out
    e3 -.->|"botón Regenerar Prompt"| r2b

    e4 --> bmp_out
    e4 -.->|"botón Producir"| r3

    nlu_out --> r1
    vis_out --> r2
    bmp_out --> r3

    nlu_out --> r_all

    style EDIT fill:#fff3cd,stroke:#e6a800
    style INVALIDATION fill:#fef3c7,stroke:#f59e0b
    style REGEN fill:#ecfdf5,stroke:#10b981

    style nlu_out fill:#fde68a,stroke:#f59e0b,color:#92400e
    style vis_out fill:#fde68a,stroke:#f59e0b,color:#92400e
    style bmp_out fill:#fde68a,stroke:#f59e0b,color:#92400e
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
