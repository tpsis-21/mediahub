import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        timeout: 15_000,
        proxyTimeout: 15_000,
        configure: (proxy) => {
          proxy.on('error', (error, req) => {
            const method = req?.method || 'GET';
            const url = req?.url || '';
            console.error('[vite-proxy]', method, url, String((error as Error)?.message || error));
          });

          proxy.on('proxyRes', (proxyRes, req) => {
            const statusCode = proxyRes?.statusCode ?? 0;
            if (statusCode >= 500) {
              const method = req?.method || 'GET';
              const url = req?.url || '';
              console.warn('[vite-proxy]', statusCode, method, url);
            }
          });
        },
      },
    },
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return;
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) return 'vendor-react';
          if (id.includes('@radix-ui') || id.includes('lucide-react')) return 'vendor-ui';
          if (id.includes('jszip') || id.includes('zod') || id.includes('date-fns')) return 'vendor-utils';
          return 'vendor';
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
