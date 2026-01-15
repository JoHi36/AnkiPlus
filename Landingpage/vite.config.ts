import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'fs';

// #region agent log
const LOG_ENDPOINT = 'http://127.0.0.1:7242/ingest/e7757e9a-5092-4e4c-9b61-29b99999cd32';
const log = (location: string, message: string, data: any) => {
  fetch(LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location,
      message,
      data,
      timestamp: Date.now(),
      sessionId: 'debug-session',
      runId: 'build-debug',
    })
  }).catch(() => {});
};
// #endregion

// Custom plugin to fix module resolution for shared components
function fixSharedComponentResolution(): Plugin {
  const landingpageNodeModules = path.resolve(__dirname, 'node_modules');
  
  return {
    name: 'fix-shared-component-resolution',
    enforce: 'pre',
    resolveId(source, importer) {
      // #region agent log
      log('vite.config.ts:resolveId', 'Module resolution attempt', {
        source,
        importer: importer || 'unknown',
        hypothesisId: 'A'
      });
      // #endregion
      
      // Only handle bare module imports (not relative paths)
      if (source.startsWith('.') || source.startsWith('/')) {
        return null;
      }
      
      // Check if this is one of the problematic packages
      const problematicPackages = ['react-markdown', 'remark-math', 'rehype-katex'];
      if (problematicPackages.includes(source) || source.startsWith('react-markdown/') || source.startsWith('remark-math/') || source.startsWith('rehype-katex/')) {
        // #region agent log
        log('vite.config.ts:resolveId', 'Detected problematic package', {
          source,
          importer: importer || 'unknown',
          landingpageNodeModules,
          hypothesisId: 'B'
        });
        // #endregion
        
        // If importer is from shared directory, resolve from Landingpage node_modules
        if (importer && importer.includes('/shared/')) {
          const resolvedPath = path.resolve(landingpageNodeModules, source);
          
          // #region agent log
          log('vite.config.ts:resolveId', 'Resolving from Landingpage node_modules', {
            source,
            resolvedPath,
            exists: existsSync(resolvedPath),
            hypothesisId: 'C'
          });
          // #endregion
          
          if (existsSync(resolvedPath)) {
            // #region agent log
            log('vite.config.ts:resolveId', 'Successfully resolved', {
              source,
              resolvedPath,
              hypothesisId: 'D'
            });
            // #endregion
            return resolvedPath;
          }
          
          // Try with package.json resolution
          try {
            const packagePath = path.resolve(landingpageNodeModules, source, 'package.json');
            if (existsSync(packagePath)) {
              const packageJsonContent = readFileSync(packagePath, 'utf-8');
              const packageJson = JSON.parse(packageJsonContent);
              const mainPath = path.resolve(landingpageNodeModules, source, packageJson.main || 'index.js');
              
              // #region agent log
              log('vite.config.ts:resolveId', 'Resolved via package.json', {
                source,
                mainPath,
                exists: existsSync(mainPath),
                hypothesisId: 'E'
              });
              // #endregion
              
              if (existsSync(mainPath)) {
                return mainPath;
              }
            }
          } catch (e) {
            // #region agent log
            log('vite.config.ts:resolveId', 'Package.json resolution failed', {
              source,
              error: String(e),
              hypothesisId: 'F'
            });
            // #endregion
          }
        }
      }
      
      return null; // Let Vite handle other resolutions
    },
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    
    // #region agent log
    log('vite.config.ts:defineConfig', 'Vite config loaded', {
      mode,
      __dirname,
      landingpageNodeModules: path.resolve(__dirname, 'node_modules'),
      hypothesisId: 'G'
    });
    // #endregion
    
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
        include: ['react-markdown', 'remark-math', 'rehype-katex', 'react', 'react-dom'],
      },
    };
});
