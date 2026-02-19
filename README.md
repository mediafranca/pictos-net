# [PICTOS.NET](https://pictos.net)

**Pictogramas generativos para la Comunicación Aumentativa y Alternativa (CAA)**

[![Netlify Status](https://api.netlify.com/api/v1/badges/24f068d3-f368-4526-a503-2f09af1def0b/deploy-status)](https://app.netlify.com/projects/pictos/deploys)
![opensource](https://img.shields.io/badge/opensource--always-available-blue)

PICTOS.NET transforma intenciones comunicativas en lenguaje natural en pictogramas mediante un pipeline de razonamiento semántico. Es parte de la investigación doctoral de [Herbert Spencer](https://herbertspencer.net/cc) y de **MediaFranca**, una iniciativa de código abierto de bien público para la CAA.

---

## Pipeline

```
Utterance → NLU (NSM) → Elementos visuales → Bitmap (Gemini) → Evaluación ICAP
                                                                      ↓ [≥ 4.0]
                                                         Vectorización → SVG semántico
```

Cada fase es visible, editable y trazable. Los pictogramas se almacenan localmente (IndexedDB + localStorage). Para respaldar tu trabajo, usa **Exportar Grafo**.

---

## MediaFranca — Ecosistema de código abierto para CAA

PICTOS.NET es parte de [MediaFranca](https://github.com/mediafranca), un conjunto de esquemas y herramientas de código abierto para la comunicación aumentativa y alternativa:

| Repositorio | Descripción |
|---|---|
| [nlu-schema](https://github.com/mediafranca/nlu-schema) | Esquema de análisis lingüístico profundo basado en NSM (65 primitivos semánticos universales) |
| [mf-svg-schema](https://github.com/mediafranca/mf-svg-schema) | Estándar para pictogramas SVG semánticos y autocontenidos |
| [ICAP](https://github.com/mediafranca/ICAP) | Marco de evaluación multidimensional para pictogramas (6 métricas de calidad cognitiva) |
| [pictos.cl](https://pictos.cl) | Plataforma de apoyos visuales para accesibilidad en servicios públicos (PUCV) |

Los tres primeros se incluyen como git submodules en este repositorio, permitiendo versionado explícito y reproducibilidad científica.

---

## Uso

- **Aplicación web**: [pictos.net](https://pictos.net)
- **Contribuir**: [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md)
- **Arquitectura técnica**: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- **Seguridad (API key)**: [docs/SECURITY.md](./docs/SECURITY.md)

### Inicio rápido (desarrollo local)

```bash
git clone --recurse-submodules https://github.com/hspencer/pictos-net.git
cd pictos-net
cp .env.example .env   # agrega tu GEMINI_API_KEY
npm install
npm run dev
```

---

## Stack

React 19 · TypeScript · Vite · Tailwind CSS · Google Gemini API · vtracer WASM · IndexedDB

---

## Comunidad

PICTOS invita a lingüistas, diseñadores, investigadores en accesibilidad cognitiva y desarrolladores. Las contribuciones son bienvenidas — ver [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md).

Para enviar grafos exportados o colaborar directamente: [hspencer@ead.cl](mailto:hspencer@ead.cl)

---

## Citar

```
Spencer, H. (2025). PICTOS.NET: Pictogramas generativos para la accesibilidad cognitiva.
MediaFranca. https://pictos.net
```

---

*Licencia: MIT (código) · CC-BY-4.0 (pictogramas generados)*
