# CLAUDE.md — PICTOS.NET v2.0

## Quick Reference

Generative pictogram system for AAC (Augmentative and Alternative Communication).
React 19 + TypeScript 5.8 + Vite 6 + Tailwind 3.4 + Claude AI + Recraft V4.1 Vector.

## Commands

```bash
npm run dev          # copy-schemas + optimize-thumbs + netlify dev (port 9001, Vite internal: 3000)
npm run build        # copy-schemas + optimize-thumbs + vite build → dist/
npm run lint         # tsc --noEmit
```

Access the app at **http://localhost:9001** (not 3000 — functions only available through Netlify Dev).
Vite proxy on port 3000 forwards `/.netlify/*` to 9001, so both ports work in practice.

## Branches & Deployment

| Branch | Deploy | URL |
|--------|--------|-----|
| `main` | Netlify auto | pictos.net |
| `dev`  | Netlify auto | next.pictos.net |
| `recraft` | local only | — |

Flow: `recraft` → `dev` (preview) → `main` (production)

## Architecture

4-phase pipeline: 3 automatic (Comprender → Componer → Producir) + 1 optional (Estructurar).
Phase 4 (Vectorizar/VTracer) is present in the codebase but eliminated from the cascade —
Recraft V4.1 delivers native SVG so VTracer is no longer needed.

- **Services**: `services/claudeService.ts` (phases 1-2), `services/recraftService.ts` (phase 3), `services/svgStructureService.ts` (phase 4)
- **API**: `services/aiClient.ts` — always-proxy client. All calls go through Netlify Functions (`callClaude`, `callRecraft`). No API key ever reaches the browser.
- **Functions**: `netlify/functions/api-claude.js` (phases 1,2,4), `netlify/functions/api-recraft.js` (phase 3)
- **State**: Zustand for SVG editor, localStorage for metadata, IndexedDB for binary (SVGs)
- **Main orchestrator**: `App.tsx` — processCascade, processStep, row management

## Pipeline

### Phase 1: COMPRENDER (Claude Haiku)
- Input: utterance + GlobalConfig (lang, geoContext, annotatedContext)
- Method: forced tool use (`analyze_utterance`) — guaranteed JSON
- Output: `NLUData` (domain, frames, nsm_explications, visual_guidelines, pragmatics)

### Phase 2: COMPONER (Claude Haiku)
- Input: NLUData + GlobalConfig
- Method: forced tool use (`compose_pictogram`) — guaranteed JSON
- Output: `{ elements: VisualElement[], prompt: string }`
- `generateSpatialPrompt()` regenerates only the prompt when user edits elements

### Phase 3: PRODUCIR (Recraft V4.1 Vector)
- Input: elements + prompt + visualStylePrompt + NLU context + utterance
- Model: `recraftv4_1_vector` (via `api-recraft` Netlify Function)
- Output: raw SVG string (`rawSvg`) — no bitmap, no rasterization
- No style/substyle params — V4.1 does not support them

### Phase 4: ESTRUCTURAR (Claude Sonnet, optional, user-initiated)
- Input: rawSvg + elements + NLU + GlobalConfig
- Method: set-of-marks rasterization → Claude Sonnet vision → local path assembly
- Geometry never leaves the browser
- Output: mf-svg-schema compliant SVG with semantic groups and accessibility metadata

## GlobalConfig Parameters

| Parameter | Phases | Status | Notes |
|---|---|---|---|
| `lang` | 1, 2, 4 | Active | NLU language + element IDs |
| `uiLang` | — | Active | UI language (independent of NLU) |
| `geoContext` | 1, 4 | Active | Regional context + a11y metadata |
| `annotatedContext` | 1 | Active | Extra context injected into NLU prompt |
| `visualStylePrompt` | 3 | Active | Text added to Recraft prompt |
| `svgStyleDefs` | 2, 4 | Active | CSS definitions for SVG editor + structuring |
| `svgKeyframes` | 4 | Active | Animation keyframes for structured SVG |
| `aspectRatio` | — | Inactive | Was Gemini Image aspect ratio; Recraft uses fixed size |
| `imageModel` | — | Inactive | Was Gemini flash/pro selector; removed from pipeline |

## Conventions

- Code & commits in English
- User-facing text in Spanish (es-419), i18n via `locales/` + `useTranslation()`
- No emojis in Markdown or docs
- Conventional commits: `type(scope): message`
- SVG styles: zero inline attributes, two-level CSS model (see docs/CSS_STYLING_ARCHITECTURE.md)
- Scripts in `scripts/` must support Node 18 (Netlify runtime) — no `import.meta.dirname`

## Key Patterns

- Tool use in Claude: always `tool_choice: { type: 'tool', name: '...' }` — hard failure if model doesn't invoke
- Recraft API: `recraftv4_1_vector` model, prompt only (no style/substyle), returns URL → fetched to SVG string
- Phase 4 set-of-marks: paths get numeric IDs in a rasterized PNG → Claude assigns each ID to a semantic element
- Local SVG assembly: Claude returns only `{ path_id → element_id }` map; geometry manipulation is all local
- Quota: Recraft = 1 unit/call, Sonnet = 1 unit/call, Haiku = 0 units (free); default 100/user/day via Netlify Blobs

## Pre-existing TS Errors (not my concern)

- SemanticTree.tsx: `key` prop on TreeNodeProps
- SVGCanvas.tsx: `key` prop on BoundingBoxProps
- styleUtils.ts: `SVGStyleElement` vs `HTMLStyleElement` type mismatch
