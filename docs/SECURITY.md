# Consideraciones de Seguridad

## Gestion de API Keys

### Estado Actual (v1.2.3)

Este proyecto expone la API key de Google Gemini en el cliente (navegador). Flujo de deployment:

1. **Desarrollo local:** la key se lee desde `.env`
2. **GitHub Actions:** se inyecta desde GitHub Secrets (`GEMINI_API_KEY`) durante el build
3. **Produccion:** el bundle JavaScript en [pictos.net](https://pictos.net) contiene la key embebida

**Implicaciones:**

- La API key **no está** en el repositorio Git
- Los contribuidores necesitan su propia key para desarrollo local
- La key es visible en el JavaScript compilado en produccion
- No hay rate limiting del lado del servidor
- La clave podria ser extraida y usada en otros proyectos

### Uso aceptable

Esta configuracion es apropiada para desarrollo local, prototipos de investigacion, proyectos academicos y herramientas de investigacion linguistica como PICTOS.NET.

**No recomendado** para aplicaciones comerciales o de alto trafico. En ese caso, implementar un backend proxy o usar variables de entorno protegidas del lado del servidor.

## Configuracion

### Desarrollo Local

1. Copia `.env.example` a `.env`:

   ```bash
   cp .env.example .env
   ```

2. Obten tu API key en [Google AI Studio](https://aistudio.google.com/app/apikey)
3. Edita `.env` con tu key
4. Ejecuta `npm run dev`

### GitHub Actions Deployment

1. Ve a Settings > Secrets and variables > Actions
2. Crea un secret `GEMINI_API_KEY`
3. El workflow `.github/workflows/deploy.yml` inyecta la key durante el build

**Importante:** esta key sera embebida en el JavaScript publico. Usa una key con quotas y restricciones apropiadas.

### Dominio Personalizado

Configurado mediante `/public/CNAME` (`pictos.net`), DNS apuntando a GitHub Pages, y base path `/` en `vite.config.ts`.

## Variables de Entorno

**Hacer:**
- Usar `.env` para desarrollo local
- Mantener `.env` en `.gitignore` (ya configurado)
- Proporcionar `.env.example` sin valores reales
- Configurar `GEMINI_API_KEY` como GitHub Secret

**No hacer:**
- Commitear archivos `.env` a Git
- Incluir keys directamente en el codigo fuente

## Monitoreo

- Monitorear uso en [Google AI Studio](https://aistudio.google.com/app/apikey)
- Revisar quotas y limites regularmente
- Rotar keys cada 3-6 meses

### Rotacion de Keys

1. Generar nueva key en [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Actualizar `.env` local y el secret `GEMINI_API_KEY` en GitHub
3. Ejecutar nuevo deployment
4. Verificar que la app funciona
5. Revocar la key antigua

## Recursos

- [README.md](./README.md) - Setup y desarrollo
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Arquitectura del sistema
- [Google Gemini API Docs](https://ai.google.dev/docs)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Best Practices para API Keys](https://cloud.google.com/docs/authentication/api-keys)
- [OWASP Top Ten](https://owasp.org/www-project-top-ten/)
