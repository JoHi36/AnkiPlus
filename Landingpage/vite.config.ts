import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'fs';

// Custom plugin to fix module resolution for shared components
function fixSharedComponentResolution() {
  const landingpageNodeModules = path.resolve(__dirname, 'node_modules');
  
  return {
    name: 'fix-shared-component-resolution',
    enforce: 'pre',
    resolveId(source: string, importer?: string) {
      // Only handle bare module imports (not relative paths)
      if (source.startsWith('.') || source.startsWith('/')) {
        return null;
      }
      
      // Check if this is one of the problematic packages
      const problematicPackages = ['react-markdown', 'remark-math', 'rehype-katex', 'framer-motion'];
      if (problematicPackages.includes(source) || 
          source.startsWith('react-markdown/') || 
          source.startsWith('remark-math/') || 
          source.startsWith('rehype-katex/') ||
          source.startsWith('framer-motion/')) {
        
        // If importer is from shared directory, resolve from Landingpage node_modules
        if (importer && importer.includes('/shared/')) {
          const resolvedPath = path.resolve(landingpageNodeModules, source);
          
          if (existsSync(resolvedPath)) {
            return resolvedPath;
          }
          
          // Try with package.json resolution
          try {
            const packagePath = path.resolve(landingpageNodeModules, source, 'package.json');
            if (existsSync(packagePath)) {
              const packageJsonContent = readFileSync(packagePath, 'utf-8');
              const packageJson = JSON.parse(packageJsonContent);
              const mainPath = path.resolve(landingpageNodeModules, source, packageJson.main || 'index.js');
              
              if (existsSync(mainPath)) {
                return mainPath;
              }
            }
          } catch (e) {
            // Ignore errors
          }
        }
      }
      
      return null; // Let Vite handle other resolutions
    },
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), fixSharedComponentResolution()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          '@shared': path.resolve(__dirname, '../shared'),
          // Explicitly resolve problematic packages from Landingpage node_modules
          'react-markdown': path.resolve(__dirname, 'node_modules/react-markdown'),
          'remark-math': path.resolve(__dirname, 'node_modules/remark-math'),
          'rehype-katex': path.resolve(__dirname, 'node_modules/rehype-katex'),
          'framer-motion': path.resolve(__dirname, 'node_modules/framer-motion'),
          'framer-motion': path.resolve(__dirname, 'node_modules/framer-motion'),
        },
        // Ensure node_modules are resolved from Landingpage directory, not from shared components
        modules: [path.resolve(__dirname, 'node_modules'), 'node_modules'],
        dedupe: ['react', 'react-dom'],
      },
      build: {
        outDir: 'dist',
        sourcemap: false,
        commonjsOptions: {
          include: [/node_modules/],
        },
        rollupOptions: {
          // Ensure external dependencies are bundled correctly
          output: {
            manualChunks: undefined,
          },
        },
      },
      optimizeDeps: {
        include: ['react-markdown', 'remark-math', 'rehype-katex', 'react', 'react-dom', 'framer-motion'],
      },
    };
});
