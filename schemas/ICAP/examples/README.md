# Ejemplos ICAP

Este directorio contiene herramientas interactivas y ejemplos de referencia para el Índice de Calidad Pictográfica.

## Herramientas Interactivas

### Interfaz Hexagonal con Gradientes

**[hexagonal-rating-gradient.html](hexagonal-rating-gradient.html)**

Herramienta principal para evaluar pictogramas usando las 6 dimensiones ICAP.

**Características:**

* Visualización hexagonal con colores únicos por dimensión
* Gradientes suaves con Canvas 2D
* Descripciones de rúbrica en tiempo real
* Evaluación compilada (texto narrativo automático)
* Exportación JSON con metadatos completos
* Tipografía Lexend para accesibilidad
* Tema oscuro optimizado

**Uso:**

1. Abrir el archivo HTML en un navegador
2. Ajustar los 6 sliders (1-5) para cada dimensión
3. Revisar la evaluación compilada en tiempo real
4. Exportar JSON con evaluación completa

### Visualizador de Metadatos

**[metadata-visualizer.html](metadata-visualizer.html)**

Herramienta para extraer y visualizar metadatos ICAP embebidos en archivos SVG.

**Características:**

* Drag & drop de archivos SVG
* Extracción automática de metadatos
* Visualización hexagonal de puntajes
* Muestra cadena de pensamiento completa
* Información de certificación y proveniencia

**Uso:**

1. Abrir el archivo HTML en un navegador
2. Arrastrar un SVG con metadatos ICAP
3. Ver visualización automática de la evaluación

## Ejemplo Canónico

**[toy-example/](toy-example/)**

Ejemplo completo del flujo de trabajo ICAP para la frase **"Voy a hacer mi cama"**.

Incluye:

* Análisis semántico completo (Frame Semantics + NSM)
* Estructura visual jerárquica
* Pictograma SVG con metadatos ICAP embebidos
* Evaluación completa con puntajes perfectos (5.0/5.0)

Ver [docs/canonical-example.md](../docs/canonical-example.md) para documentación detallada.

---

**Para más información, ver el [README principal](../README.md)**
