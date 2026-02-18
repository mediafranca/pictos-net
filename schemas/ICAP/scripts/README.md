# Scripts ICAP

Este directorio contiene scripts de automatización para el workflow de evaluación ICAP.

## Scripts Disponibles

### 1. compile-evaluation-text.js

Compila evaluaciones ICAP a partir de puntajes numéricos, generando texto narrativo automático usando la rúbrica centralizada.

**Uso:**

```bash
# Compilar evaluación desde puntajes
node scripts/compile-evaluation-text.js --scores 5,4,3,4,5,4

# Formato HTML
node scripts/compile-evaluation-text.js --scores 5,4,3,4,5,4 --format html

# Inglés
node scripts/compile-evaluation-text.js --scores 5,4,3,4,5,4 --lang en

# Evaluar caso específico
node scripts/compile-evaluation-text.js --case req-001_v1.0.0_default-v1_01
```

**Parámetros:**

* `--scores` - 6 puntajes separados por comas (1-5) para: Claridad, Reconocibilidad, Transparencia Semántica, Adecuación Pragmática, Adecuación Cultural, Accesibilidad Cognitiva
* `--format` - Formato de salida: `text` (default) o `html`
* `--lang` - Idioma: `es` (default) o `en`
* `--case` - ID de caso para cargar puntajes desde metadata

**Salida:**

* Puntaje ICAP compuesto (promedio)
* Evaluación general
* Párrafos narrativos para cada dimensión
* Texto compilado completo

### 2. generate-report.js

Genera reportes de evaluación en formato markdown o JSON, agregando resultados de múltiples evaluaciones.

**Uso:**

```bash
# Generar reporte desde corpus
node scripts/generate-report.js --corpus frases.json

# Especificar directorio de evaluaciones
node scripts/generate-report.js --input evaluations/ --output report.md

# Formato JSON
node scripts/generate-report.js --corpus frases.json --format json
```

**Parámetros:**

* `--corpus` - Archivo de corpus (frases.json)
* `--input` - Directorio con evaluaciones JSON
* `--output` - Archivo de salida (default: stdout)
* `--format` - Formato: `markdown` (default) o `json`

**Salida:**

* Puntajes ICAP agregados por modelo/versión
* Estadísticas por dimensión
* Identificación de fortalezas y debilidades
* Comparación entre modelos

## Requisitos

Los scripts requieren Node.js 16+ y las siguientes dependencias:

```bash
npm install ajv
```

## Integración con Rúbrica Centralizada

Ambos scripts consultan la rúbrica centralizada en:

* `data/rubric-scale-descriptions.json`

Esto asegura que las evaluaciones usen descripciones consistentes y actualizadas.

## Flujo de Trabajo Típico

1. **Evaluar pictogramas** usando la interfaz hexagonal
2. **Exportar JSON** con evaluaciones
3. **Compilar texto narrativo** con `compile-evaluation-text.js`
4. **Generar reporte agregado** con `generate-report.js` para benchmark de modelos

---

**Ver también:** [README principal](../README.md) para documentación completa del framework ICAP
