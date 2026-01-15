import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
    dedupe: ['react', 'react-dom', 'lucide-react', 'react-markdown', 'remark-math', 'rehype-katex'], // Dedupe common dependencies
    preserveSymlinks: false, // Ensure proper module resolution
  },
  define: {
    // Force React to use development build
    'process.env.NODE_ENV': JSON.stringify(mode === 'development' ? 'development' : 'production'),
  },
  build: {
    outDir: './dist',  // Baue in temporäres dist-Verzeichnis
    emptyOutDir: true, // Lösche dist-Ordner vor Build
    minify: false, // DEVELOPMENT BUILD - Keine Minification für bessere Fehler!
    sourcemap: true, // Enable source maps for better debugging
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
      },
      output: {
        // Verwendet relative Pfade für lokale Dateien
        assetFileNames: 'assets/[name].[ext]',
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
      },
      external: ['d3-sankey'], // Externalize d3-sankey to avoid build issues
    },
  },
  base: './', // Relative Pfade für lokale Dateien
  server: {
    port: 3000,
    strictPort: true, // Verhindert automatische Port-Wechsel
    open: false,
  },
}));

