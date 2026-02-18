# Changelog

Todos los cambios notables de este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [1.0.0] - 2026-01-30

### Añadido

- Componente `StyleEditor` principal como librería reutilizable
- Props interface completa con callbacks para integración
- Soporte para estilos personalizados vía `initialStyles`
- Callbacks: `onStylesChange`, `onSave`, `onDelete`, `onExport`
- Opciones de personalización: `hideHeader`, `hideExport`, `hideNewButton`
- Exportación de tipos TypeScript
- Exportación de utilidades: `generateCssString`, `updateDynamicStyles`
- Animaciones CSS para accesibilidad cognitiva
- Documentación completa en README
- Build configurado para distribución (ES + UMD)
- Generación automática de tipos TypeScript

### Cambiado

- Reestructuración del proyecto:
  - `lib/` para código de la librería
  - `src/demo/` para aplicación de demostración
- Package.json configurado como librería instalable desde GitHub
- Configuración de Vite para doble build (librería + demo)

### Documentado

- Guía de instalación desde GitHub
- Ejemplos de uso básico y avanzado
- API completa de props
- Guía de integración con PICTOS.net
- Estructura del proyecto
