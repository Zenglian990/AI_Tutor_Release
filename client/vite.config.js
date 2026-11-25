import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      workbox: {
        // 清理历史旧版本 132 chunk 缓存，并确保新 SW 立即接管而不强制刷新当前考场页面
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // 仅预缓存极小图标资源，HTML 走 NetworkFirst 杜绝旧版锁死前端
        globPatterns: ['**/*.{ico,png,svg}'],
        navigateFallback: null,
        maximumFileSizeToCacheInBytes: 3145728,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'ai-tutor-pages',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 10, maxAgeSeconds: 7 * 24 * 60 * 60 }
            }
          },
          {
            urlPattern: ({ request }) => request.destination === 'script' || request.destination === 'style',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'ai-tutor-static-assets',
              expiration: { maxEntries: 60, maxAgeSeconds: 14 * 24 * 60 * 60 }
            }
          },
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'ai-tutor-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 24 * 60 * 60 }
            }
          }
        ]
      },
      manifest: {
        name: 'AI 智慧私教 (1-12年级)',
        short_name: 'AI私教',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 120000,
        proxyTimeout: 120000
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts'
  }
})
