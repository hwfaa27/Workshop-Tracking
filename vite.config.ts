import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {fileURLToPath} from 'url';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        manifestFilename: 'manifest.json',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: '/',
          name: 'WorkshopTrack — PT Tjokro Bersaudara',
          short_name: 'WorkshopTrk',
          description:
            'Sistem manajemen dan pelacakan komponen mesin serta peralatan industri berbasis QR Code untuk operasional workshop.',
          theme_color: '#142D4E',
          background_color: '#142D4E',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          lang: 'id',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          shortcuts: [
            {
              name: 'Scan QR Barang',
              short_name: 'Scan QR',
              description: 'Buka pemindai QR Code kamera smartphone secara langsung',
              url: '/?tab=scan',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,woff,woff2}'],
          navigateFallbackDenylist: [/^\/api\//, /^\/ws/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
          navigateFallback: 'index.html',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom/client',
        'lucide-react',
        'qrcode',
        'jsqr',
        'xlsx',
        'jspdf',
        'jspdf-autotable',
        'firebase/app',
        'firebase/auth',
      ],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
