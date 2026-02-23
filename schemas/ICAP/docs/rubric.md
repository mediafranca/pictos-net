# VCSCI Evaluation Rubric

This rubric provides operational definitions and anchoring examples for each evaluation dimension.

## Purpose

The rubric ensures:
- Consistency across evaluators
- Reduced subjective variation
- Clear operational definitions
- Citable standards for research

## Rating Scale

All dimensions use a 5-point scale:

| Score | Label | General Description |
|-------|-------|---------------------|
| **5** | Excelente | No necesita mejoras. Listo para uso inmediato. |
| **4** | Bien | Funciona bien, pero se puede mejorar. Mejoras menores opcionales. |
| **3** | Funciona | Funciona pero requiere mejoras. Cumple mínimo para AAC. |
| **2** | Insuficiente | No apto para público general. Necesita mejoras significativas. |
| **1** | No funcional | No funciona. Necesita repensarse completamente desde cero. |

**Nota**: Cada dimensión tiene descripciones específicas para cada nivel. Las definiciones operacionales completas están disponibles en [data/rubric-scale-descriptions.json](../data/rubric-scale-descriptions.json), que puede ser consultado programáticamente por interfaces de evaluación y scripts de análisis.

---

## Dimension 1: Clarity

**Definition**: The degree to which the pictogram is visually clear, legible, and free from visual ambiguity.

### Operational Criteria

- Line quality (clean, not pixelated or blurry)
- Contrast (sufficient figure-ground separation)
- Visual clutter (absence of unnecessary elements)
- Scalability (readable at different sizes)
- Technical quality (proper SVG rendering)

### Scale Descriptions

**Complete operational definitions for each score level (1-5) are available in [data/rubric-scale-descriptions.json](../data/rubric-scale-descriptions.json).**

Quick reference:

- **5 (Excelente)**: Líneas nítidas, alto contraste, sin ruido visual, escala perfectamente
- **4 (Bien)**: Visualmente claro, detalles menores no afectan legibilidad
- **3 (Funciona)**: Generalmente claro, imperfecciones menores aceptables
- **2 (Insuficiente)**: Problemas de claridad evidentes, compromete usabilidad
- **1 (No funcional)**: Borroso, pixelado, ilegible, requiere rediseño completo

---

## Dimension 2: Recognizability

**Definition**: The ease with which a viewer can identify what the pictogram represents without additional context or explanation.

### Operational Criteria

- Immediate recognition (< 2 seconds)
- Matches mental model of concept
- Uses conventional visual representations
- Minimal ambiguity or alternative interpretations
- Works without text labels

### Scale Descriptions

**Complete operational definitions for each score level (1-5) are available in [data/rubric-scale-descriptions.json](../data/rubric-scale-descriptions.json).**

Quick reference:

- **5 (Excelente)**: Instantáneamente reconocible, inequívoco, usa convenciones universales
- **4 (Bien)**: Fácilmente reconocible, significado principal evidente
- **3 (Funciona)**: Reconocible en 2-3 segundos, interpretación clara
- **2 (Insuficiente)**: Difícil de reconocer, múltiples interpretaciones
- **1 (No funcional)**: Imposible de reconocer, simbolismo oscuro, requiere rediseño

---

## Dimension 3: Semantic Transparency

**Definition**: The degree to which the pictogram accurately conveys the specific meaning of the target phrase.

### Operational Criteria

- Matches phrase meaning (not just a related concept)
- Captures key semantic elements
- Appropriate level of specificity/generality
- Conveys action, object, emotion, or relationship as needed
- Aligns with linguistic structure

### Scale Descriptions

**Complete operational definitions for each score level (1-5) are available in [data/rubric-scale-descriptions.json](../data/rubric-scale-descriptions.json).**

Quick reference:

- **5 (Excelente)**: Captura perfectamente el significado, todos los elementos semánticos presentes
- **4 (Bien)**: Captura muy bien el significado principal, matices menores pueden perderse
- **3 (Funciona)**: Captura el significado central, componentes principales presentes
- **2 (Insuficiente)**: Captura parcialmente, faltan elementos importantes
- **1 (No funcional)**: No representa adecuadamente, distorsión semántica severa

---

## Dimension 4: Pragmatic Fit

**Definition**: The usefulness and appropriateness of the pictogram in real-world AAC communication contexts.

### Operational Criteria

- Practical for communication boards/devices
- Appropriate for target user age/ability
- Functional in typical use scenarios
- Socially appropriate
- Supports communicative goals

### Scale Descriptions

**Complete operational definitions for each score level (1-5) are available in [data/rubric-scale-descriptions.json](../data/rubric-scale-descriptions.json).**

Quick reference:

- **5 (Excelente)**: Altamente práctico, apropiado para edad/capacidad, facilita autonomía
- **4 (Bien)**: Muy práctico, apropiado para mayoría de usuarios y contextos
- **3 (Funciona)**: Generalmente práctico, funcionalmente adecuado para necesidades básicas
- **2 (Insuficiente)**: Limitaciones prácticas significativas, efectividad limitada
- **1 (No funcional)**: Impráctico, inapropiado, no facilita comunicación efectiva

---

## Dimension 5: Cultural Adequacy

**Definition**: The appropriateness and relevance of the pictogram for the cultural and linguistic context of the target audience.

### Operational Criteria

- Culturally neutral or culturally appropriate imagery
- No offensive or insensitive representations
- Reflects target culture's norms and values
- Linguistically aligned (Spanish/English context)
- Avoids stereotypes

### Scale Descriptions

**Complete operational definitions for each score level (1-5) are available in [data/rubric-scale-descriptions.json](../data/rubric-scale-descriptions.json).**

Quick reference:

- **5 (Excelente)**: Perfectamente adecuado culturalmente, refleja auténticamente cultura objetivo
- **4 (Bien)**: Culturalmente apropiado, alta adecuación, bien alineado
- **3 (Funciona)**: Generalmente adecuado, culturalmente neutral o aceptable
- **2 (Insuficiente)**: Problemas de adecuación cultural, alineamiento débil
- **1 (No funcional)**: Culturalmente inapropiado u ofensivo, requiere rediseño

**N/A Option**: Select N/A if the concept is universally applicable, cultural considerations are not relevant, or evaluator lacks cultural competence to judge.

---

## Dimension 6: Cognitive Accessibility

**Definition**: The accessibility and usability of the pictogram for users with cognitive differences, learning disabilities, or intellectual disabilities.

### Operational Criteria

- Visual simplicity (not overwhelming)
- Cognitive load (easy to process)
- Memory demands (recognizable without memorization)
- Attention requirements (captures and holds attention)
- ISO/IEC 24751 compliance

### Scale Descriptions

**Complete operational definitions for each score level (1-5) are available in [data/rubric-scale-descriptions.json](../data/rubric-scale-descriptions.json).**

Quick reference:

- **5 (Excelente)**: Extremadamente simple, carga cognitiva mínima, inmediatamente procesable
- **4 (Bien)**: Muy accesible, carga cognitiva baja, reconocimiento rápido
- **3 (Funciona)**: Adecuadamente accesible, carga cognitiva razonable
- **2 (Insuficiente)**: Desafíos significativos, carga cognitiva alta
- **1 (No funcional)**: Inaccesible, carga excesiva, requiere simplificación radical

**N/A Option**: Select N/A if evaluator lacks expertise in cognitive accessibility or specialized assessment tools are needed.

---

## Using This Rubric

### Before Rating

1. Read all dimension definitions
2. Review anchoring examples
3. Participate in calibration session if available
4. Clarify any questions with research team

### During Rating

1. View pictogram at standard size
2. Rate each dimension independently
3. Use anchors as reference points
4. Document reasoning in comments
5. Be consistent across all pictograms

### After Rating

1. Review for consistency
2. Check that comments support ratings
3. Identify patterns in your ratings
4. Discuss discrepancies with team (if applicable)

---

## References

- **ISO/IEC 24751**: Information technology — Individualized adaptability and accessibility in e-learning, education and training
- **WCAG 2.1**: Web Content Accessibility Guidelines
- **Light & McNaughton (2014)**: The Changing Face of Augmentative and Alternative Communication
- **Fuller & Lloyd (1991)**: Translucency: An Important Characteristic of Symbols (on semantic transparency)
