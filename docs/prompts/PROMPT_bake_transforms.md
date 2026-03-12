# Prompt: Implementar "bake" destructivo de transforms en el SVGEditorModal

## Proyecto
`/Users/hspencer/Sites/pictos-net` — React + TypeScript + Vite

## Problema que resolver

Cuando el usuario edita un SVG crudo (proveniente de vtracer) en el `SVGEditorModal`,
puede seleccionar paths, agruparlos, y escalar o mover ese grupo. El editor SVG almacena
esa operación como un `transform="matrix(...)"` en el elemento `<g>`.

Los paths hijos siguen teniendo sus coordenadas originales (típicamente un
`transform="translate(tx, ty)"` con `d` relativo a `(0,0)`). La visibilidad es correcta
**mientras el grupo existe**, porque el browser compone las dos transformaciones.

**El problema**: cuando el SVG pasa por la fase ESTRUCTURAR (Gemini), los paths se
distribuyen en nuevos grupos semánticos **sin el `<g>` original**. Las coordenadas dentro
de `d=""` nunca fueron modificadas, así que todo vuelve a su posición original.

La solución es **bake destructivo**: antes de guardar el rawSVG editado, atravesar todos
los `<g>` con transform, componer esa matrix con la de cada path hijo, y escribir las
coordenadas resultantes directamente en el atributo `d=""` del path. Después de este
proceso, no queda ningún `transform=""` en el SVG — las posiciones finales están en los
nodos mismos.

---

## Estado actual del código

### Lo que ya existe (escrito por un agente anterior, puede estar incompleto o con bugs):

**`utils/svgNormalizer.ts`** — al final del archivo existen estas funciones:
- `parseTransformToMatrix(transform: string | null): DOMMatrix`
- `matrixToTransform(m: DOMMatrix): string`
- `bakeMatrixIntoPathD(d: string, m: DOMMatrix): string`
- `flattenGroupTransforms(svgString, groupIds?): string`
- `normalizeSVGTransforms(svgString): string`

**`components/SVGEditor/SVGEditorModal.tsx`** — tiene estos cambios:
- Import: `import { normalizeSVGTransforms } from '../../utils/svgNormalizer';`
- `handleSave()` modificado: si `svgSource === 'raw'`, aplica `normalizeSVGTransforms(currentSvg)` antes de `onSave()`

### Lo que hay que verificar / corregir:

#### 1. `bakeMatrixIntoPathD` — bugs conocidos

El path de vtracer del caso concreto es:
```
d="M0 0 C3.56656993 2.79595371 ... Z"
transform="translate(731,425)"
```
El grupo encima tiene `transform="matrix(1.4105,0,0,1.4429,-207.09,-236.54)"`.

**Bug A — `M` relativo inicial**:
En `case 'M': case 'm':`, las primeras dos ramas son idénticas. Además, cuando
`cmd === 'm'` e `i === 0` y `result.length === 0` (primer comando del path), SVG spec
dice que se comporta como `M` absoluto. Corregir para distinguir primer `m` vs `m`
dentro del path.

**Bug B — acumulador `cx,cy` en `C` relativo**:
En `case 'C': case 'c':`, el punto final `[ex, ey]` se calcula como
`[cx + args[i+4], cy + args[i+5]]` para el caso relativo, luego `cx = ex; cy = ey`.
El problema es que `ex, ey` aquí son las coordenadas absolutas correctas del punto
final (correcto para actualizar el acumulador), pero esto asume que la lógica anterior
mantuvo `cx, cy` correctamente. Verificar con paths que tengan múltiples subpaths
(varios `M...Z M...Z` en el mismo `d`).

**Bug C — comando `A` (arc) sin transform**:
La función actualmente hace `result.push(token)` para `A/a` sin aplicar la matrix.
vtracer puede generar arcs. Para el caso de arcs SVG:
`A rx ry x-rotation large-arc sweep x y`
Los radios `rx, ry` se escalan por `Math.sqrt(m.a*m.a + m.b*m.b)` (aproximado para
matrices con escala uniforme). El punto final `x, y` se transforma normalmente.
Implementar esto o al menos aplicar el transform a los puntos finales (los dos últimos args).

**Bug D — condición de rango en `C`**:
`for (let i = 0; i + 5 < args.length; i += 6)` debería ser `i + 5 <= args.length - 1`
que es equivalente a `i + 6 <= args.length`. Verificar que no se pierda la última curva.

#### 2. `flattenGroupTransforms` — sólo un nivel de profundidad

La función actual sólo procesa los hijos directos de cada `<g transform>`. Para `<g>`
anidados con sus propios transforms, solo compone la matrix en el `<g>` hijo pero no
recursivamente bake los paths del nieto.

**Solución recomendada**: procesar en múltiples pasadas hasta que no quede ningún
`<g[transform]>` en el documento. Máximo 5 pasadas. Ejemplo:

```typescript
export function flattenGroupTransforms(svgString: string, groupIds?: string[]): string {
    let current = svgString;
    for (let pass = 0; pass < 5; pass++) {
        const next = flattenOnePass(current, groupIds);
        if (next === current) break; // no more transforms to flatten
        current = next;
    }
    return current;
}
```

Donde `flattenOnePass` es la lógica actual (una pasada).

#### 3. `SVGEditorModal.tsx` — condición `svgSource === 'raw'` demasiado restrictiva

El bake actualmente solo ocurre para rawSVGs. Pero si alguien edita un SVG estructurado
y mueve grupos, el mismo problema ocurre. Cambiar a: aplicar bake **siempre**, con
una optimización para saltar si el SVG no contiene `transform=`:

```typescript
const handleSave = () => {
    if (!currentSvg) return;
    // Bake group transforms destructively into path coordinates.
    // This ensures edits survive when ESTRUCTURAR redistributes paths into new groups.
    // Skip cheaply if there are no transforms to process.
    const needsBake = currentSvg.includes('transform=');
    const svgToSave = needsBake ? normalizeSVGTransforms(currentSvg) : currentSvg;
    onSave(svgToSave);
};
```

---

## Tarea específica

1. **Leer el estado actual completo** de:
   - `utils/svgNormalizer.ts`
   - `components/SVGEditor/SVGEditorModal.tsx`

2. **Corregir `bakeMatrixIntoPathD`** (bugs A, B, C, D descritos arriba)

3. **Hacer `flattenGroupTransforms` multi-pasada** para profundidad arbitraria

4. **Corregir `handleSave` en `SVGEditorModal.tsx`** para aplicar bake siempre, no solo en raw

5. **Verificar con TypeScript**: `npx tsc --noEmit` desde la raíz sin errores

6. **No tocar** ningún otro archivo a menos que el type-checker lo exija

---

## Arquitectura del flujo

```
Usuario edita en SVGEditorModal
  → mueve/escala grupo → transform="matrix(...)" en <g>
  → click "Guardar"
  → handleSave()
      → normalizeSVGTransforms(currentSvg)
          → flattenGroupTransforms() [multi-pasada]
              → para cada <g transform>:
                  → componer groupMatrix × childMatrix
                  → bakeMatrixIntoPathD(d, composedMatrix)  ← coords en d modificadas
                  → eliminar transform del <g> y del <path>
      → onSave(svgAplanado)  ← sin ningún transform en grupos
→ row.rawSvg = svgAplanado
→ ESTRUCTURAR recibe paths con posiciones absolutas correctas en d=""
```

---

## Referencia: estructura de paths vtracer

```xml
<g id="grupo-ga5bf" transform="matrix(1.4105,0,0,1.4429,-207.09,-236.54)">
  <path d="M0 0 C3.57 2.80 ..." transform="translate(731,425)" fill="#010101"/>
  <path d="M0 0 C7.91 5.32 ..." transform="translate(704,461)" fill="#010101"/>
</g>
```

Composed matrix para primer path:
- groupMatrix = {a:1.4105, b:0, c:0, d:1.4429, e:-207.09, f:-236.54}
- childMatrix = translate(731,425) = {a:1, b:0, c:0, d:1, e:731, f:425}
- composed = groupMatrix × childMatrix:
  - e_final = 1.4105×731 + (-207.09) = 1031.08 - 207.09 = **823.99**
  - f_final = 1.4429×425 + (-236.54) = 613.23 - 236.54 = **376.69**
- `M0 0` en d="" → after bake: `M823.99,376.69`
- Resultado: sin transforms, el path se renderiza exactamente en la misma posición visual
