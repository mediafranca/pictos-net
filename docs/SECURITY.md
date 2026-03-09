# Consideraciones de Seguridad

## Gestion de API Keys

### Arquitectura Actual (v1.2.6)

El proyecto implementa un modelo dual para las llamadas a la API de Google Gemini:

**Desarrollo local (`npm run dev`):**
- La key se lee desde `.env` y se inyecta via Vite (`process.env.API_KEY`)
- Las llamadas van directamente a la API de Gemini desde el navegador
- Flujo rapido sin autenticacion, ideal para iterar

**Produccion (Netlify):**
- La key `GEMINI_API_KEY` esta configurada como variable de entorno en Netlify (server-side)
- Las llamadas pasan por la Netlify Function `api-gemini.js` que actua como proxy
- El bundle JavaScript **no contiene** la API key
- El proxy valida JWT (Netlify Identity) antes de reenviar la solicitud a Gemini

### Protecciones del proxy (`netlify/functions/api-gemini.js`)

- **Autenticacion JWT**: Solo usuarios autenticados via Netlify Identity pueden usar el proxy
- **CORS whitelist**: Solo `pictos.net` y `pictos-next.netlify.app`
- **Model whitelist**: Solo 4 modelos Gemini permitidos (previene abuso)
- **Errores genericos**: No se exponen detalles internos al cliente

### Autenticacion (Netlify Identity + Google SSO)

- Login lazy: la app es completamente accesible sin autenticacion
- Se requiere login solo al generar pictogramas (llamadas a Gemini)
- Google SSO como metodo principal, email/password como alternativa
- JWT se obtiene del widget de Netlify Identity y se envia como `Authorization: Bearer`

## Configuracion

### Desarrollo Local

1. Copia `.env.example` a `.env`:

   ```bash
   cp .env.example .env
   ```

2. Obten tu API key en [Google AI Studio](https://aistudio.google.com/app/apikey)
3. Edita `.env` con tu key
4. Ejecuta `npm run dev`

### Netlify (Produccion)

1. Configura `GEMINI_API_KEY` en Settings > Environment variables
2. Habilita Identity con Google SSO
3. La Netlify Function `api-gemini.js` se despliega automaticamente

## Headers de Seguridad (netlify.toml)

- `Strict-Transport-Security`: HSTS con includeSubDomains
- `X-Frame-Options`: SAMEORIGIN
- `X-Content-Type-Options`: nosniff
- `Referrer-Policy`: strict-origin-when-cross-origin
- `Permissions-Policy`: camara, microfono y geolocalizacion deshabilitados

## Variables de Entorno

**Hacer:**
- Usar `.env` para desarrollo local
- Mantener `.env` en `.gitignore` (ya configurado)
- Proporcionar `.env.example` sin valores reales
- Configurar `GEMINI_API_KEY` como variable de entorno en Netlify

**No hacer:**
- Commitear archivos `.env` a Git
- Incluir keys directamente en el codigo fuente

## Monitoreo

- Monitorear uso en [Google AI Studio](https://aistudio.google.com/app/apikey)
- Revisar quotas y limites regularmente
- Rotar keys cada 3-6 meses

### Rotacion de Keys

1. Generar nueva key en [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Actualizar `.env` local y la variable `GEMINI_API_KEY` en Netlify
3. Verificar que la app funciona
4. Revocar la key antigua

## Recursos

- [CONTRIBUTING.md](./CONTRIBUTING.md) - Setup y desarrollo
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Arquitectura del sistema
- [SSO_IMPLEMENTATION_PLAN.md](./SSO_IMPLEMENTATION_PLAN.md) - Plan de implementacion SSO
- [Google Gemini API Docs](https://ai.google.dev/docs)
- [Netlify Identity Docs](https://docs.netlify.com/security/secure-access-to-sites/identity/)
- [OWASP Top Ten](https://owasp.org/www-project-top-ten/)
