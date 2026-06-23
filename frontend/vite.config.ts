import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// GitHub Pages: npm run build:gh-pages
// 本地 / 自有域名: npm run build
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || "/",
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
