import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const isLibBuild = mode === 'lib';

  // Library build configuration
  if (isLibBuild) {
    return {
      plugins: [react()],
      build: {
        lib: {
          entry: resolve(__dirname, 'lib/index.ts'),
          name: 'StyleEditor',
          fileName: (format) => `style-editor.${format}.js`,
          formats: ['es', 'umd']
        },
        rollupOptions: {
          external: ['react', 'react-dom', 'lucide-react'],
          output: {
            globals: {
              react: 'React',
              'react-dom': 'ReactDOM',
              'lucide-react': 'LucideReact'
            }
          }
        },
        sourcemap: true,
        emptyOutDir: true
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
  }

  // Development/demo build configuration
  return {
    root: 'src/demo',
    publicDir: '../../public',
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      outDir: '../../dist-demo',
      emptyOutDir: true
    }
  };
});
