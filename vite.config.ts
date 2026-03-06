import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    // GitHub Pages with custom domain: use root path
    base: '/',
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [
      react(),
    ],
    // In development, the API key is injected for direct Gemini calls.
    // In production, calls go through Netlify Functions (key stays server-side).
    define: mode === 'development' ? {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    } : {},
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@style-editor': path.resolve(__dirname, './lib/style-editor'),
        '@schema': path.resolve(__dirname, './lib/mf-schema')
      }
    },
    build: {
      sourcemap: mode === 'development',
    },
    optimizeDeps: {
      exclude: []
    }
  };
});
