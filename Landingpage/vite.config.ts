import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          '@shared': path.resolve(__dirname, '../shared'),
        },
        // Ensure node_modules are resolved correctly from Landingpage directory
        dedupe: ['react', 'react-dom'],
      },
      build: {
        outDir: 'dist',
        sourcemap: false,
        commonjsOptions: {
          include: [/node_modules/],
        },
      },
      optimizeDeps: {
        include: ['react-markdown', 'remark-math', 'rehype-katex'],
      },
    };
});
