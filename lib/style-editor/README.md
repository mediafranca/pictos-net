# Style Editor

Componente de interfaz para la edición de estilos de pictogramas generados en [PICTOS.net](https://pictos.net).

## Descripción

Style Editor proporciona una colección de estilos CSS mínima y semántica diseñada para asegurar consistencia transversal en la biblioteca tipográfica generada dentro de cada localización de PICTOS.net.

### Estructura de Clases

La colección de estilos se organiza en dos categorías principales:

#### Clases Semánticas

Definen la estructura y organización visual de los pictogramas:

- **Jerarquía**: Niveles de importancia visual
- **Foco**: Estados de atención y énfasis
- **Roles**: Funciones y comportamientos de los elementos

#### Clases Utilitarias

Proporcionan ajustes específicos y mejoras de accesibilidad:

- **Codificaciones**: Sistemas de representación visual
- **Colores**: Paletas y variaciones cromáticas
- **Elementos distintivos**: Características identificativas
- **Animaciones**: Mejoras para accesibilidad cognitiva

## Instalación

### Desde GitHub

```bash
npm install github:mediafranca/style-editor
```

O usando yarn:

```bash
yarn add github:mediafranca/style-editor
```

### Como dependencia en package.json

```json
{
  "dependencies": {
    "@pictos/style-editor": "github:mediafranca/style-editor"
  }
}
```

## Requisitos

Este componente requiere:

- React 18+ o React 19+
- Tailwind CSS configurado en tu proyecto

### Configuración de Tailwind CSS

Si aún no tienes Tailwind CSS en tu proyecto:

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Configura tu `tailwind.config.js` para incluir los archivos del Style Editor:

```javascript
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./node_modules/@pictos/style-editor/dist/**/*.js"
  ],
  // ... resto de tu configuración
}
```

## Uso Básico

```tsx
import React from 'react';
import { StyleEditor } from '@pictos/style-editor';

function App() {
  return (
    <div className="h-screen">
      <StyleEditor />
    </div>
  );
}

export default App;
```

## API del Componente

### Props de StyleEditor

| Prop | Tipo | Default | Descripción |
| ---- | ---- | ------- | ----------- |
| `initialStyles` | `StyleDefinition[]` | `INITIAL_STYLES` | Estilos iniciales a cargar |
| `onStylesChange` | `(styles: StyleDefinition[]) => void` | - | Callback cuando los estilos cambian |
| `onSave` | `(style: StyleDefinition) => void` | - | Callback cuando se guarda un estilo |
| `onDelete` | `(id: string) => void` | - | Callback cuando se elimina un estilo |
| `onExport` | `(css: string) => void` | - | Callback cuando se exporta CSS |
| `hideHeader` | `boolean` | `false` | Ocultar el header/navbar |
| `hideExport` | `boolean` | `false` | Ocultar el botón de exportación |
| `hideNewButton` | `boolean` | `false` | Ocultar el botón "New Style" |
| `defaultView` | `ViewMode` | `ViewMode.GRID` | Vista por defecto (GRID o CODE) |
| `availableShapes` | `ShapeType[]` | `['square', 'circle', 'triangle', 'line', 'path']` | Formas disponibles para preview |
| `className` | `string` | `''` | Clase CSS personalizada para el contenedor |

## Ejemplos de Uso

### Uso con Callbacks

```tsx
import { StyleEditor, type StyleDefinition } from '@pictos/style-editor';

function App() {
  const handleStylesChange = (styles: StyleDefinition[]) => {
    console.log('Estilos actualizados:', styles);
    // Guardar en localStorage, base de datos, etc.
  };

  const handleSave = (style: StyleDefinition) => {
    console.log('Estilo guardado:', style);
    // Sincronizar con backend
  };

  const handleDelete = (id: string) => {
    console.log('Estilo eliminado:', id);
    // Eliminar del backend
  };

  const handleExport = (css: string) => {
    console.log('CSS exportado');
    // Hacer algo personalizado con el CSS
    // Por ejemplo, enviarlo a un backend
  };

  return (
    <StyleEditor
      onStylesChange={handleStylesChange}
      onSave={handleSave}
      onDelete={handleDelete}
      onExport={handleExport}
    />
  );
}
```

### Uso con Estilos Personalizados

```tsx
import { StyleEditor, INITIAL_STYLES } from '@pictos/style-editor';

const customStyles = [
  ...INITIAL_STYLES,
  {
    id: 'custom-1',
    selectors: ['.mi-estilo-personalizado'],
    rules: [
      { id: '1', property: 'fill', value: '#ff6b6b' },
      { id: '2', property: 'stroke', value: '#333' }
    ],
    description: 'Estilo personalizado para mi aplicación'
  }
];

function App() {
  return <StyleEditor initialStyles={customStyles} />;
}
```

### Modo Embebido (Sin Header)

```tsx
function EmbeddedEditor() {
  return (
    <div className="h-96">
      <StyleEditor
        hideHeader={true}
        hideExport={true}
        hideNewButton={false}
      />
    </div>
  );
}
```

### Solo Vista de Código

```tsx
import { StyleEditor, ViewMode } from '@pictos/style-editor';

function CodeOnlyView() {
  return (
    <StyleEditor
      defaultView={ViewMode.CODE}
      hideHeader={true}
    />
  );
}
```

## Tipos Exportados

```typescript
import type {
  StyleDefinition,
  CssRule,
  ShapeType,
  StyleEditorProps
} from '@pictos/style-editor';

// StyleDefinition
interface StyleDefinition {
  id: string;
  selectors: string[];
  rules: CssRule[];
  description?: string;
}

// CssRule
interface CssRule {
  id: string;
  property: string;
  value: string;
}

// ShapeType
type ShapeType = 'square' | 'circle' | 'triangle' | 'line' | 'path';

// ViewMode
enum ViewMode {
  GRID = 'GRID',
  CODE = 'CODE'
}
```

## Utilidades Exportadas

```typescript
import {
  generateCssString,
  updateDynamicStyles,
  SVG_CSS_PROPERTIES,
  INITIAL_STYLES
} from '@pictos/style-editor';

// Generar string CSS desde estilos
const cssString = generateCssString(styles);

// Actualizar estilos en el DOM
updateDynamicStyles(styles);

// Lista de propiedades CSS válidas para SVG
console.log(SVG_CSS_PROPERTIES);

// Estilos iniciales por defecto
console.log(INITIAL_STYLES);
```

## Desarrollo Local

### Prerequisitos

- Node.js 18+
- npm o yarn

### Comandos

```bash
# Instalar dependencias
npm install

# Ejecutar demo en modo desarrollo
npm run dev

# Construir librería
npm run build

# Construir solo tipos TypeScript
npm run build:types

# Construir demo
npm run build:demo
```

### Estructura del Proyecto

```text
style-editor/
├── lib/                    # Código fuente de la librería
│   ├── components/        # Componentes React
│   ├── utils/            # Utilidades
│   ├── services/         # Servicios (Gemini AI)
│   ├── StyleEditor.tsx   # Componente principal
│   ├── index.ts          # Punto de entrada
│   ├── types.ts          # Definiciones de tipos
│   ├── constants.ts      # Constantes
│   └── styles.css        # Estilos globales
├── src/
│   └── demo/             # Aplicación demo
├── dist/                  # Build de la librería
└── dist-demo/            # Build de la demo
```

## Integración con PICTOS.net

Para integrar este componente en PICTOS.net:

```tsx
import { StyleEditor } from '@pictos/style-editor';
import { useState, useEffect } from 'react';

function PictosStyleManager() {
  const [styles, setStyles] = useState([]);

  // Cargar estilos desde tu backend
  useEffect(() => {
    fetch('/api/pictos/styles')
      .then(res => res.json())
      .then(setStyles);
  }, []);

  // Guardar cambios en tu backend
  const handleStylesChange = async (updatedStyles) => {
    await fetch('/api/pictos/styles', {
      method: 'PUT',
      body: JSON.stringify(updatedStyles)
    });
    setStyles(updatedStyles);
  };

  return (
    <StyleEditor
      initialStyles={styles}
      onStylesChange={handleStylesChange}
    />
  );
}
```

## Contribuir

1. Fork el repositorio
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## Licencia

[MIT](LICENSE)

## Autor

mediafranca - [PICTOS.net](https://pictos.net)
