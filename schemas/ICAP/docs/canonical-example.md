# Canonical Example: Complete Flow from Utterance to Evaluated Pictogram

This document illustrates the complete chain of thought from initial utterance to final evaluated pictogram with embedded metadata.

## Overview

**Utterance**: "Voy a hacer mi cama" (Spanish) / "I'm going to make my bed" (English)

**Complete flow**:
1. Utterance → Semantic Analysis
2. Semantic Analysis → Visual Structure
3. Visual Structure → SVG Pictogram
4. SVG Pictogram → ICAP Evaluation
5. Evaluation → Embedded Metadata (SSOT)

## Modular Architecture

Este ejemplo integra componentes de tres repositorios modulares del ecosistema **MediaFranca**:

* **[nlu-schema](https://github.com/mediafranca/nlu-schema)** - Define el análisis semántico (Step 1)
  * Frame Semantics (FrameNet-style)
  * Natural Semantic Metalanguage (NSM)
  * Logical Form y Pragmática
  * Visual Guidelines

* **[mf-svg-schema](https://github.com/mediafranca/mf-svg-schema)** - Define el formato SVG pictográfico (Step 3)
  * Estructura de elementos semánticos
  * Metadatos embebidos
  * Accesibilidad (ARIA, roles semánticos)
  * Chain of thought completo

* **ICAP** (este repositorio) - Define la evaluación de calidad (Step 4)
  * 6 dimensiones de evaluación
  * Rúbrica centralizada
  * Puntajes y decisiones
  * Texto narrativo compilado

Los archivos en `examples/toy-example/` son **ejemplos de referencia** que siguen los schemas de estos repositorios modulares.

---

## Step 1: Semantic Analysis

### Input Utterance

```json
{
  "utterance": "voy a hacer mi cama",
  "lang": "es",
  "metadata": {
    "speech_act": "commissive",
    "intent": "tidy_object"
  }
}
```

### Frame Semantic Analysis

Using FrameNet-style semantic frames:

```json
{
  "frames": [
    {
      "frame_name": "Arranging",
      "lexical_unit": "hacer (cama)",
      "roles": {
        "Agent": {
          "type": "person",
          "ref": "SPEAKER",
          "surface": "voy (implicit yo)"
        },
        "Theme": {
          "type": "artifact",
          "ref": "BED",
          "surface": "mi cama"
        }
      }
    }
  ]
}
```

### NSM Explication

Natural Semantic Metalanguage breakdown:

```json
{
  "nsm_explications": {
    "MAKE_BED": "I want to do something to this thing. I want to move parts of this thing. I want this thing to be good."
  }
}
```

### Logical Form

```json
{
  "logical_form": {
    "event": "ARRANGE(Speaker, Bed)",
    "modality": "INTENTION_IMMEDIATE"
  }
}
```

### Pragmatics

```json
{
  "pragmatics": {
    "politeness": "neutral",
    "formality": "informal",
    "expected_response": "acknowledgement_optional"
  }
}
```

### Visual Guidelines

High-level composition directives:

```json
{
  "visual_guidelines": {
    "focus_actor": "speaker",
    "action_core": "hands_smoothing_sheets",
    "object_core": "bed_with_pillows",
    "context": "bedroom_interior",
    "temporal": "immediate_future"
  }
}
```

---

## Step 2: Visual Structure

### Hierarchical Element Tree

```json
{
  "elements": [
    {
      "id": "composicion_dormitorio",
      "children": [
        {
          "id": "figura_protagonista",
          "children": [
            { "id": "torso_inclinado" },
            {
              "id": "brazos_extendidos",
              "children": [
                { "id": "manos_en_accion" }
              ]
            }
          ]
        },
        {
          "id": "cama_central",
          "children": [
            { "id": "sabanas_en_movimiento" },
            { "id": "almohadas_mullidas" },
            { "id": "cabecero_madera" }
          ]
        },
        {
          "id": "entorno_periferico",
          "children": [
            { "id": "mesita_noche" }
          ]
        }
      ]
    }
  ]
}
```

### Compositional Prompt

Detailed visual composition instructions:

```
La `composicion_dormitorio` se organiza mediante un plano medio o ligeramente picado.

La `cama_central` ocupa el primer plano inferior y medio, actuando como el ancla visual.

La `figura_protagonista` se sitúa detrás o al lado de la cama, con el `torso_inclinado` hacia el centro de la escena.

Los `brazos_extendidos` forman líneas diagonales que dirigen la mirada hacia las `sabanas_en_movimiento`.

Las `manos_en_accion` están en contacto directo con la tela, sugiriendo tensión y alisado; visualmente, las sábanas deben mostrar una transición de arrugas a una superficie plana bajo las manos.

Las `almohadas_mullidas` se sitúan en la parte superior del encuadre, equilibrando la composición vertical.

El `entorno_periferico` es secundario y desenfocado en los bordes.
```

---

## Step 3: SVG Pictogram Generation

### SVG Structure

The pictogram is generated as semantic SVG with:

1. **Accessibility metadata** embedded in `<metadata>` tag
2. **Semantic grouping** using `<g>` with roles
3. **High contrast support** via CSS classes
4. **Keyboard navigation** with tabindex
5. **ARIA labels** for screen readers

### Key Features

#### Metadata Section

```xml
<metadata id="mf-accessibility">
  {
    "schema": "https://pictos.net/schemas/pictogram-accessibility/v1",
    "utterance": {
      "text": "Make the bed",
      "speechAct": "directive",
      "language": "en-NZ",
      "domain": "Activities of Daily Living"
    },
    "nsm": {
      "primes": ["DO","SOMEONE","SOMETHING","PLACE","NOW"],
      "gloss": "SOMEONE DO something to bed NOW so bed is good to sleep"
    },
    "concepts": [
      {"id": "bed", "role": "patient", "kind": "OBJECT"},
      {"id": "person", "role": "agent", "kind": "HUMAN"},
      {"id": "make", "role": "action", "kind": "VERB"}
    ],
    "accessibility": {
      "readingOrder": ["title","desc","g-person","g-bed"],
      "keyboard": {"tabStops": ["g-person","g-bed"]},
      "contrast": {"preferred": "AA", "strokeMin": 2},
      "motion": {"noMotionDefault": true}
    },
    "provenance": {
      "author": "PictoNet",
      "license": "CC BY 4.0",
      "version": "1.0-gs"
    }
  }
</metadata>
```

#### Semantic Grouping

```xml
<!-- BED (Patient) -->
<g id="g-bed" role="group" class="hc f"
   tabindex="0"
   aria-label="Bed, the object of the action"
   data-role="patient"
   data-concept="bed">
  <!-- bed elements -->
</g>

<!-- PERSON (Agent) -->
<g id="g-person" role="group" class="hc k"
   tabindex="0"
   aria-label="Person, the agent who makes the bed"
   data-role="agent"
   data-concept="person">
  <!-- person elements -->
</g>
```

#### High Contrast CSS

```css
/* Base styles */
.f { fill: #fff; stroke: #000; }
.k { fill: #000; stroke: #fff; }

/* High contrast mode */
svg.hc .f {
  fill: #fff;
  stroke: #000;
  stroke-width: .4ex;
}

svg.hc .k {
  fill: #000;
  stroke: #fff;
  stroke-width: .3ex;
}
```

---

## Step 4: VCSCI Evaluation

### Evaluation Process

Using the hexagonal interface, evaluators rate 6 dimensions:

```json
{
  "scores": {
    "clarity": 5,
    "recognizability": 5,
    "semantic_transparency": 5,
    "pragmatic_fit": 5,
    "cultural_adequacy": 5,
    "cognitive_accessibility": 5
  }
}
```

### Compiled Evaluation (from Rubric)

**VCSCI Score: 5.00/5.0 (Excelente)**

*No necesita mejoras. Listo para uso inmediato.*

**Claridad**: El pictograma tiene líneas nítidas y limpias sin artefactos visuales. El contraste es alto y los elementos se distinguen inmediatamente. No hay ruido visual. Escala perfectamente a cualquier tamaño. La calidad técnica es profesional y lista para uso en producción.

**Reconocibilidad**: El pictograma es instantáneamente reconocible por cualquier persona sin necesidad de contexto adicional. Representa el concepto de forma inequívoca utilizando convenciones visuales universales. No requiere etiqueta de texto. Coincide perfectamente con estándares AAC existentes como ARASAAC o PCS. La interpretación es única y clara.

**Transparencia Semántica**: El pictograma captura perfectamente el significado de la frase. Todos los elementos semánticos clave están presentes. El nivel de especificidad es correcto. Es apropiado para la estructura lingüística (verbo vs. sustantivo, etc.). No hay pérdida ni distorsión semántica. Comunica exactamente lo que la frase expresa.

**Adecuación Pragmática**: El pictograma es altamente práctico para uso en AAC. Es apropiado para la edad y capacidades del usuario objetivo. Apoya la comunicación efectiva en múltiples contextos. Es socialmente apropiado en todas las situaciones. Facilita la autonomía y dignidad del usuario. Se puede usar con confianza en espacios públicos, escolares, domésticos, etc.

**Adecuación Cultural**: El pictograma es perfectamente adecuado culturalmente. Refleja auténticamente la cultura objetivo. No contiene estereotipos ni elementos insensibles. Está alineado lingüística y culturalmente con el contexto español/latinoamericano. Es ampliamente aceptable entre diferentes subgrupos culturales. Representa elementos cotidianos (comida, vestimenta, actividades) que coinciden con la vida diaria de la cultura objetivo.

**Accesibilidad Cognitiva**: El pictograma es extremadamente simple y claro para procesamiento cognitivo. Requiere carga cognitiva mínima. Es inmediatamente procesable sin esfuerzo. Capta la atención sin ser distractor. Cumple completamente con estándares de accesibilidad ISO/IEC 24751. Utiliza 2-3 formas simples y audaces con alto contraste. Permite reconocimiento instantáneo sin necesidad de memorización.

---

## Step 5: Complete Embedded Metadata (SSOT)

### Final SVG with VCSCI Evaluation

The evaluation is embedded back into the SVG as the single source of truth:

```xml
<svg id="pictogram" xmlns="http://www.w3.org/2000/svg"
     version="1.1" viewBox="0 0 100 100">

  <metadata id="vcsci-evaluation">
    {
      "vcsci": {
        "version": "1.0.0",
        "case_id": "req-001_v1.0.0_default-v1_01",
        "evaluation_date": "2026-01-26T15:30:00.000Z",
        "chain_of_thought": {
          "1_input": {
            "phrase_id": "req-001",
            "utterance": {
              "spanish": "Voy a hacer mi cama",
              "english": "I'm going to make my bed"
            },
            "semantic_analysis": {
              "speech_act": "commissive",
              "frame": "Arranging",
              "agent": "Speaker",
              "patient": "Bed"
            },
            "nsm_explication": "I want to do something to this thing...",
            "style_profile_id": "default-v1",
            "pipeline_version": "1.0.0"
          },
          "2_generation": {
            "model": "claude-opus-4-5-20251101",
            "timestamp": "2026-01-26T15:00:00.000Z",
            "parameters": {
              "temperature": 0.7,
              "visual_structure": { /* hierarchical tree */ }
            },
            "svg_output": "canonical.svg"
          },
          "3_evaluation": {
            "evaluations": [
              {
                "evaluator_id": "eval_001",
                "evaluator_role": "aac_expert",
                "timestamp": "2026-01-26T15:30:00.000Z",
                "ratings": {
                  "clarity": 5,
                  "recognizability": 5,
                  "semantic_transparency": 5,
                  "pragmatic_fit": 5,
                  "cultural_adequacy": 5,
                  "cognitive_accessibility": 5
                }
              }
            ],
            "vcsci_score": 5.00,
            "decision": "accept",
            "compiled_evaluation": {
              "summary": "No necesita mejoras. Listo para uso inmediato.",
              "paragraphs": [
                {
                  "dimension": "clarity",
                  "score": 5,
                  "text": "El pictograma tiene líneas nítidas y limpias..."
                }
                /* ... 5 more dimensions ... */
              ]
            }
          },
          "4_provenance": {
            "created_by": "PictoNet",
            "license": "CC BY 4.0",
            "iteration": 1,
            "parent_case_id": null,
            "certification": {
              "status": "production_ready",
              "certified_by": "VCSCI v1.0.0",
              "certified_date": "2026-01-26"
            }
          }
        }
      }
    }
  </metadata>

  <!-- SVG content follows -->

</svg>
```

---

## Key Principles Demonstrated

### 1. Complete Traceability

Every decision from utterance to final pictogram is documented:
* Linguistic analysis
* Visual composition
* Generation parameters
* Evaluation ratings
* Quality decision

### 2. Single Source of Truth

The SVG file contains everything:
* Visual representation
* Semantic metadata
* Accessibility information
* Evaluation results
* Provenance data

### 3. Accessibility First

* ARIA labels for screen readers
* Keyboard navigation
* High contrast support
* Semantic grouping
* Reading order specification

### 4. Research Reproducibility

Complete chain of thought enables:
* Citation of specific decisions
* Replication of methodology
* Validation of results
* Dataset publication

### 5. Production Ready

Embedded metadata supports:
* AAC system integration
* Quality assurance
* Version control
* License compliance

---

## File Locations

**Complete example available at:**

* SVG: [examples/toy-example/canonical.svg](../examples/toy-example/canonical.svg)
* Semantic analysis: [examples/toy-example/semantic-analysis.json](../examples/toy-example/semantic-analysis.json)
* Visual structure: [examples/toy-example/visual-structure.json](../examples/toy-example/visual-structure.json)
* Evaluation: [examples/toy-example/vcsci-evaluation.json](../examples/toy-example/vcsci-evaluation.json)

---

## References

* **Frame Semantics**: Fillmore, C. J. (1982). Frame semantics. In Linguistics in the Morning Calm.
* **NSM**: Wierzbicka, A. (1996). Semantics: Primes and Universals.
* **SVG Accessibility**: W3C SVG Accessibility API Mappings
* **AAC Standards**: ISO 24751 - Individualized adaptability and accessibility in e-learning

---

**This canonical example demonstrates the complete VCSCI methodology from linguistic input to production-ready, evaluated pictogram with full metadata transparency.**
