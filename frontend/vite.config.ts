/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

const backendUrl = process.env.VITE_BACKEND_URL || "http://localhost:8000";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        enabled: true,
        type: "module",
      },
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Greenhouse SaaS",
        short_name: "Greenhouse",
        description: "Smart greenhouse monitoring and control platform",
        theme_color: "#16a34a",
        background_color: "#f9fafb",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 300,
              },
            },
          },
        ],
        navigateFallback: "/index.html",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Heavy mapping library — loaded only on Sites/CRM pages
          leaflet: ["leaflet", "react-leaflet", "@react-leaflet/core"],
          // Chart library — loaded only on ZoneDetail/Analytics/History pages
          recharts: ["recharts"],
          // i18n — separate chunk cached independently
          i18n: ["i18next", "react-i18next", "i18next-browser-languagedetector"],
          // Animation library
          motion: ["framer-motion"],
          // React ecosystem
          react: ["react", "react-dom", "react-router-dom"],
          // State + validation
          state: ["zustand", "zod"],
        },
      },
    },
    // Warn on chunks > 500kB
    chunkSizeWarningLimit: 500,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: backendUrl,
        changeOrigin: true,
      },
      "/ws": {
        target: backendUrl.replace(/^http/, "ws"),
        ws: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    css: false,
  },
});
