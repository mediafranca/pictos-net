# [PICTOS.NET](https://pictos.net)

**Pictogramas generativos para la Comunicación Aumentativa y Alternativa (CAA)**

[![Netlify Status](https://api.netlify.com/api/v1/badges/24f068d3-f368-4526-a503-2f09af1def0b/deploy-status)](https://app.netlify.com/projects/pictos/deploys)
![opensource](https://img.shields.io/badge/opensource--always-available-blue)

PICTOS.NET transforma intenciones comunicativas expresadas en lenguaje natural en pictogramas mediante un pipeline de razonamiento semántico. Es parte de la investigación doctoral de [Herbert Spencer](https://herbertspencer.net/cc) y de **[MediaFranca](https://github.com/mediafranca)** — una iniciativa de código abierto de bien público para la CAA.

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

---

## Filosofía

Los pictogramas son más que ilustraciones: son actos comunicativos. PICTOS propone que para generar un buen pictograma hay que primero *comprender profundamente* qué se quiere comunicar, antes de decidir cómo visualizarlo.

El proyecto nace de una convicción: **la comunicación visual debe ser universal y accesible**. Los pictogramas generados buscan reducir barreras cognitivas, facilitar la expresión de necesidades básicas y contribuir a la autonomía de personas con diversidad funcional.

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

Los pictogramas y datos se almacenan **localmente en el navegador** (IndexedDB + localStorage). Para respaldar tu trabajo usa **Exportar Grafo** — genera un JSON con todas las imágenes y metadatos del pipeline.

Puedes compartir tu grafo exportado con comentarios a [hspencer@ead.cl](mailto:hspencer@ead.cl). Esto ayuda a mejorar el sistema y construir corpus de investigación.

---

## Desarrollo local

```bash
git clone --recurse-submodules https://github.com/hspencer/pictos-net.git
cd pictos-net
cp .env.example .env        # agrega tu GEMINI_API_KEY
npm install
npm run dev                 # → http://localhost:5173
```

Obtén tu API key en [Google AI Studio](https://aistudio.google.com/app/apikey).

Ver [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md) para instrucciones completas, incluyendo deployment en GitHub Pages.

---

## Stack

React 19 · TypeScript · Vite · Tailwind CSS · Zustand · Google Gemini API · vtracer WASM · IndexedDB

---

## Documentación

| Documento | Descripción |
|---|---|
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Arquitectura técnica detallada, modelos de datos, servicios |
| [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md) | Guía de desarrollo, submodules, i18n, deployment |
| [docs/SECURITY.md](./docs/SECURITY.md) | Gestión de API keys, consideraciones de seguridad |

---

## Comunidad

PICTOS invita a **lingüistas** a refinar el análisis NLU y NSM, **diseñadores** a mejorar la composición visual, **investigadores** a validar métricas de calidad, y **desarrolladores** a extender las funcionalidades.

Las contribuciones son bienvenidas. Reporta bugs, propone features o abre un Pull Request en GitHub.

---

## Citar

```
Spencer, H. (2026). PICTOS.NET: Pictogramas generativos para la accesibilidad cognitiva.
MediaFranca. https://pictos.net
```

---

*Licencia: MIT (código) · CC-BY-4.0 (pictogramas generados)*
