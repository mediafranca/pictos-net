# WCAG Compliance Roadmap

## Estado Actual

PICTOS.NET es una herramienta para profesionales de accesibilidad cognitiva que crean pictogramas para jovenes autistas. Es contradictorio que la propia herramienta no cumpla con estandares de accesibilidad web. Este documento establece la hoja de ruta para alcanzar conformidad WCAG 2.1 nivel AA.

### Problemas identificados

- Contraste de texto insuficiente en labels y texto secundario
- Tamanos de fuente fijos sub-12px que no escalan con preferencias del usuario
- Animaciones sin respetar `prefers-reduced-motion`
- Botones de solo icono sin labels accesibles para screen readers
- Iconos decorativos que generan lectura duplicada en screen readers
- Falta de landmarks y estructura semantica en algunos paneles
- Sin soporte de navegacion por teclado en areas interactivas complejas

## Objetivo

Conformidad WCAG 2.1 nivel AA en todas las interfaces de usuario.

## Prioridad 1: Fundamentos (critico)

Fixes que afectan a todos los usuarios y son requisito minimo de accesibilidad.

### 1.1 `prefers-reduced-motion` (WCAG 2.3.3)

- Desactivar animaciones CSS cuando el usuario tiene activada la preferencia de movimiento reducido
- Minimizar duracion de transiciones a valores imperceptibles
- Afecta: `animate-spectral`, `animate-pulse`, `animate-spin`, todas las transiciones

### 1.2 Contraste minimo de texto (WCAG 1.4.3)

- Ratio minimo 4.5:1 para texto normal, 3:1 para texto grande (18px+ o 14px bold)
- Reemplazar `text-slate-300` y `text-slate-400` por `text-slate-500` (#64748b)
- `slate-500` sobre blanco = ~4.6:1 (cumple AA)
- `slate-500` sobre slate-50 = ~4.5:1 (cumple AA limite)

### 1.3 Tamanos de texto escalables (WCAG 1.4.4)

- Eliminar tamanos fijos en pixeles menores a 12px
- Usar unidades relativas (rem) para que el texto escale con las preferencias del navegador
- Tamano minimo efectivo: 12px (0.75rem / `text-xs` en Tailwind)

### 1.4 Labels accesibles en botones de icono (WCAG 1.1.1, 4.1.2)

- Todo boton interactivo debe tener un nombre accesible
- Agregar `aria-label` a botones que contienen solo iconos
- Mantener `title` para tooltip visual

### 1.5 Iconos decorativos ocultos (WCAG 1.1.1)

- Agregar `aria-hidden="true"` a iconos que acompanan texto
- Evita lectura duplicada en screen readers (ej: "download icon download")

### Checklist de verificacion

- [ ] `prefers-reduced-motion: reduce` desactiva todas las animaciones
- [ ] Transiciones reducidas a 0.01ms con motion reduce
- [ ] Ningun texto tiene contraste menor a 4.5:1 sobre su fondo
- [ ] No existen tamanos de fuente fijos menores a 12px
- [ ] Todos los tamanos de fuente usan unidades rem
- [ ] Todos los botones de solo icono tienen `aria-label`
- [ ] Todos los iconos decorativos tienen `aria-hidden="true"`
- [ ] `npm run build` compila sin errores

## Prioridad 2: Navegacion y estructura

Mejoras de navegacion por teclado y estructura semantica.

### 2.1 Navegacion por teclado (WCAG 2.1.1, 2.1.2)

- Asegurar que todos los controles interactivos son alcanzables via Tab
- Agregar `tabindex` donde sea necesario en controles custom
- Implementar trampas de foco (focus trap) en modales
- Soporte de Escape para cerrar modales y paneles

### 2.2 Indicadores de foco visibles (WCAG 2.4.7)

- Anillos de foco visibles en todos los elementos interactivos
- No eliminar outline sin reemplazo accesible
- Usar `focus-visible` para evitar anillos en clicks de mouse

### 2.3 Landmarks y roles ARIA (WCAG 1.3.1)

- Agregar `role="main"`, `role="navigation"`, `role="complementary"` segun corresponda
- Usar `<main>`, `<nav>`, `<aside>` donde sea posible en lugar de divs genericos
- Labels para regiones con `aria-labelledby` o `aria-label`

### 2.4 Jerarquia de headings (WCAG 1.3.1, 2.4.6)

- Asegurar orden logico de h1-h6 sin saltos
- Cada seccion principal debe tener un heading identificable

### Checklist de verificacion

- [ ] Todos los controles interactivos son alcanzables via teclado
- [ ] Modales implementan focus trap y se cierran con Escape
- [ ] Indicadores de foco visibles en todos los elementos interactivos
- [ ] Landmarks semanticos en la estructura principal
- [ ] Jerarquia de headings correcta y sin saltos

## Prioridad 3: Experiencia avanzada

Mejoras que optimizan la experiencia para usuarios de tecnologias asistivas.

### 3.1 Live regions para feedback dinamico (WCAG 4.1.3)

- `aria-live="polite"` para mensajes de estado (generacion completada, errores)
- `aria-live="assertive"` para errores criticos
- Anunciar cambios de estado en el pipeline de generacion

### 3.2 Descripciones contextuales (WCAG 1.1.1)

- `aria-describedby` para controles complejos que necesitan instrucciones adicionales
- Textos de ayuda asociados a inputs y selectores

### 3.3 Skip links (WCAG 2.4.1)

- Link "Saltar al contenido principal" al inicio de la pagina
- Links de salto para secciones dentro de modales complejos

### 3.4 Preferencias de color y alto contraste (WCAG 1.4.11)

- Soporte basico para `prefers-contrast: more`
- Verificar que la interfaz funciona en modo de alto contraste de Windows

### 3.5 Alternativas de texto para contenido generado (WCAG 1.1.1)

- Los pictogramas generados deben tener alt text descriptivo basado en la utterance original
- Los SVG en la biblioteca deben tener `<title>` y `<desc>` semanticos

### Checklist de verificacion

- [ ] Mensajes de estado se anuncian via aria-live
- [ ] Controles complejos tienen descripciones contextuales
- [ ] Skip link funcional al inicio de la pagina
- [ ] Interfaz usable en modo alto contraste
- [ ] Pictogramas generados tienen alt text descriptivo

## Referencias

- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [Tailwind CSS Accessibility](https://tailwindcss.com/docs/screen-readers)
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)

*Ultima actualizacion: 2026-03-04*
