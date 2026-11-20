import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  // Versión (SemVer, de package.json) y fecha del build, visibles en el menú de cuenta.
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  plugins: [
    react(),
    VitePWA({
      // La app registra el service worker y decide cuándo actualizar (src/lib/pwaUpdate.ts).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['apple-touch-icon.png', 'logo.svg'],
      manifest: {
        name: 'Tareas IA',
        short_name: 'Tareas IA',
        description: 'Escribe lo que tienes pendiente y un asistente de IA lo convierte en tareas.',
        lang: 'es',
        start_url: '/',
        display: 'standalone',
        theme_color: '#2563eb',
        background_color: '#f9fafb',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Solo se precachea el shell de la app (HTML, JS, CSS, íconos). No hay runtimeCaching:
        // las respuestas de Supabase (autenticadas) nunca pasan por la caché del service worker.
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
});
