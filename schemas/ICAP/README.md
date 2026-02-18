# ICAP: Índice de Calidad Pictográfica para CAA

El **Índice de Calidad Pictográfica (ICAP)** es un marco métrico diseñado para la evaluación, validación y auditoría de sistemas de comunicación visual en el ámbito de la Comunicación Aumentativa y Alternativa (CAA).

Este índice permite cuantificar la eficacia de los pictogramas mediante un análisis multidimensional, siendo especialmente útil para el entrenamiento y evaluación de modelos generativos (como **PictoNet**) y la arquitectura **MediaFranca**.

## Alcances del Índice

1. **Evaluación Individual (1 a 1):** Auditoría técnica y semántica de un pictograma frente a su concepto.
2. **Benchmark de Modelos (Set Fijo):** Evaluación de la calidad generativa de un modelo mediante un corpus de referencia (50-60 frases concretas) para medir consistencia y precisión.

---

## Dimensiones del ICAP (Definiciones Operacionales)

El índice se compone de seis dimensiones clave, evaluadas en una escala de 1 a 5.

### 1. Claridad (Clarity)

Mide el grado en que el pictograma es visualmente nítido, legible y libre de ambigüedad visual.

* **Fundamento:** Basado en los principios de **complejidad visual** de **Forsythe et al. (2003)**. Evalúa la calidad técnica y el contraste para asegurar que el signo escale correctamente en dispositivos de comunicación.

### 2. Reconocibilidad (Recognisability)

La facilidad con la que un observador identifica lo que representa el pictograma sin contexto adicional o explicación.

* **Fundamento:** Se alinea con la **Teoría de la Iconicidad** de **Lloyd y Fuller (1990)**. Un nivel 5 indica una interpretación única y clara basada en convenciones universales (estándares tipo ARASAAC/PCS).

### 3. Transparencia Semántica (Semantic Transparency)

El grado en que el pictograma transmite con precisión el significado específico de la frase objetivo y su estructura lingüística.

* **Fundamento:** Basado en el concepto de **translucidez** de **Schlosser (2003)**. Evalúa si los elementos semánticos clave están presentes sin pérdida ni distorsión del mensaje.

### 4. Adecuación Pragmática (Pragmatic Fit)

La utilidad y adecuación del pictograma en contextos reales de comunicación.

* **Fundamento:** Basado en la **Competencia Comunicativa** de **Light (1989)**. Evalúa si el símbolo facilita la autonomía y dignidad del usuario en entornos públicos, escolares o domésticos.

### 5. Adecuación Cultural (Cultural Adequacy)

Relevancia del pictograma para el contexto cultural y lingüístico del público objetivo (especialmente en entornos hispanohablantes).

* **Fundamento:** Responde a la necesidad de **sensibilidad cultural** en CAA señalada por **Huer (2000)**, evitando estereotipos y reflejando auténticamente la vida diaria.

### 6. Accesibilidad Cognitiva (Cognitive Accessibility)

La usabilidad del pictograma para usuarios con diferencias cognitivas o dificultades de aprendizaje.

* **Fundamento:** Alineado con los estándares **ISO/IEC 24751**. Evalúa la simplicidad del procesamiento y si el signo requiere una carga cognitiva mínima para su reconocimiento instantáneo.

---

## Escala de Evaluación

Cada dimensión se califica mediante una rúbrica de 5 niveles:

* **5 - Excelente:** Sin necesidad de mejoras. Listo para uso profesional.
* **4 - Bien:** Funciona bien; mejoras menores opcionales.
* **3 - Funciona:** Aceptable. Cumple el mínimo para comunicación funcional.
* **2 - Insuficiente:** Requiere mejoras significativas para ser apto.
* **1 - No funcional:** Requiere rediseño completo desde cero.

---

## Corpus de Evaluación

El corpus de referencia consta de **50 frases** organizadas por función comunicativa siguiendo la taxonomía de actos de habla de Austin/Searle:

**[frases.json](frases.json)**

### Categorías

* **Solicitar** (6 frases): SOL-01 a SOL-06
* **Rechazar** (5 frases): REC-01 a REC-05
* **Dirigir** (6 frases): DIR-01 a DIR-06
* **Aceptar** (6 frases): ACE-01 a ACE-06
* **Interacción Social** (6 frases): SOC-01 a SOC-06
* **Emoción** (5 frases): EMO-01 a EMO-05
* **Comentar** (6 frases): COM-01 a COM-06
* **Preguntar** (7 frases): PRE-01 a PRE-07

Cada frase incluye:

* **ID único** (ej: SOL-01)
* **Categoría comunicativa**
* **Frase en español**
* **Primitivos NSM** (Natural Semantic Metalanguage)
* **Roles semánticos** (FrameNet-style)
* **Dominio de uso** (Casa/Hogar, Escuela, Higiene/Salud, Ocio/Comunidad)

---

## Herramientas de Evaluación Interactivas

### Interfaz Hexagonal con Gradientes

**[examples/hexagonal-rating-gradient.html](examples/hexagonal-rating-gradient.html)**

* Visualización hexagonal con interpolación de colores por dimensión
* Renderizado Canvas 2D con gradientes suaves
* Descripciones de rúbrica en tiempo real
* Evaluación compilada (texto narrativo automático)
* Exportación JSON con metadatos completos
* Tipografía Lexend para accesibilidad

### Visualizador de Metadatos

**[examples/metadata-visualizer.html](examples/metadata-visualizer.html)**

* Extrae metadatos ICAP embebidos en SVGs
* Drag & drop de archivos
* Visualización hexagonal automática
* Muestra cadena de pensamiento completa

---

## Ejemplo Canónico

**[examples/toy-example/](examples/toy-example/)**

Ejemplo completo del flujo de trabajo: **"Voy a hacer mi cama"**

1. **Frase de entrada** con análisis semántico (Frame Semantics + NSM)
2. **Estructura visual** jerárquica definida
3. **Pictograma SVG** generado con metadatos ICAP embebidos
4. **Evaluación ICAP completa** con puntajes perfectos (5.0/5.0)

**Archivos incluidos:**

* [semantic-analysis.json](examples/toy-example/semantic-analysis.json) - Descomposición semántica (sigue [nlu-schema](https://github.com/mediafranca/nlu-schema))
* [visual-structure.json](examples/toy-example/visual-structure.json) - Jerarquía de elementos visuales y prompt de generación
* [output.svg](examples/toy-example/pictograms/req-001_v1.0.0_default-v1_01/output.svg) - Pictograma con metadatos (sigue [mf-svg-schema](https://github.com/mediafranca/mf-svg-schema))
* [Documentación completa](docs/canonical-example.md) - Explicación detallada del flujo

### Arquitectura Modular

ICAP es parte del ecosistema **MediaFranca** con separación de responsabilidades:

* **[nlu-schema](https://github.com/mediafranca/nlu-schema)** - Análisis semántico (Frame Semantics, NSM, roles semánticos)
* **[mf-svg-schema](https://github.com/mediafranca/mf-svg-schema)** - Especificación de SVGs pictográficos con metadatos embebidos
* **ICAP** (este repositorio) - Marco de evaluación de calidad pictográfica para CAA

---

## Rúbrica Centralizada

Todas las definiciones operacionales de la rúbrica ICAP están centralizadas en:

**[data/rubric-scale-descriptions.json](data/rubric-scale-descriptions.json)**

Este archivo JSON sirve como **fuente única de verdad (SSOT)** para:

* Descripciones de cada nivel (1-5) por dimensión
* Texto narrativo compilable para evaluaciones
* Consistencia entre interfaces de evaluación
* Acceso programático desde scripts

### Uso desde CLI

```bash
# Compilar evaluación a partir de puntajes
node scripts/compile-evaluation-text.js --scores 5,4,3,4,5,4

# Formato HTML
node scripts/compile-evaluation-text.js --scores 5,4,3,4,5,4 --format html

# Evaluar caso específico
node scripts/compile-evaluation-text.js --case req-001_v1.0.0_default-v1_01
```

---

## Estructura del Repositorio

```text
├── frases.json                  # Corpus de 50 frases de referencia
├── data/
│   └── rubric-scale-descriptions.json  # Rúbrica centralizada
├── examples/
│   ├── hexagonal-rating-gradient.html  # Interfaz hexagonal interactiva
│   ├── metadata-visualizer.html        # Visualizador de metadatos
│   └── toy-example/                    # Ejemplo canónico completo
├── schemas/
│   └── rubric-descriptions.schema.json  # Validación JSON Schema
├── scripts/
│   ├── compile-evaluation-text.js      # Compilar evaluaciones
│   └── generate-report.js              # Generar reportes
└── docs/
    ├── rubric.md                        # Rúbrica detallada
    └── canonical-example.md             # Documentación del ejemplo
```

---

## Flujo de Trabajo: Evaluación Individual

1. **Generar pictograma** usando PictoNet u otro modelo generativo
2. **Abrir interfaz hexagonal** ([hexagonal-rating-gradient.html](examples/hexagonal-rating-gradient.html))
3. **Evaluar cada dimensión** (1-5) usando la rúbrica como guía
4. **Revisar evaluación compilada** (texto narrativo automático)
5. **Exportar JSON** con metadatos completos
6. **Embeber metadatos en SVG** como SSOT para auditoría

---

## Flujo de Trabajo: Benchmark de Modelos

1. **Generar pictogramas** para todas las 50 frases del corpus
2. **Evaluar sistemáticamente** usando la interfaz hexagonal
3. **Compilar resultados** usando `generate-report.js`
4. **Calcular puntaje ICAP promedio** por modelo
5. **Comparar versiones** para medir mejoras iterativas

```bash
# Generar reporte agregado
node scripts/generate-report.js --corpus frases.json
```

---

## Documentación

* **[Rúbrica ICAP Detallada](docs/rubric.md)** - Descripciones extendidas de cada dimensión con ejemplos
* **[Ejemplo Canónico](docs/canonical-example.md)** - Flujo completo documentado: "Voy a hacer mi cama"

---

## Referencias Bibliográficas

* **Forsythe, C., et al. (2003).** *Visual complexity and information processing.*
* **Huer, M. B. (2000).** *Examine perceptions of graphic symbols across different cultural groups.*
* **Light, J. (1989).** *Toward a definition of communicative competence for individuals using augmentative and alternative communication systems.* Augmentative and Alternative Communication, 5(2), 137-144.
* **Lloyd, L. L., & Fuller, D. R. (1990).** *The role of iconicity and translucency in symbol learning.* In R. Schiefelbusch (Ed.), Augmentative and Alternative Communication (pp. 295-306).
* **Schlosser, R. W. (2003).** *The Efficacy of Augmentative and Alternative Communication: Toward Evidence-Based Practice.* Academic Press.

---

## Licencia

Este proyecto está diseñado para investigación académica y aplicaciones en el ámbito de la Comunicación Aumentativa y Alternativa (CAA). Para uso en producción o comercial, por favor contactar a los autores.

**Versión:** 0.2.0-icap
**Última actualización:** Enero 2026
