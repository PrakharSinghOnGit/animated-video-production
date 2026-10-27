import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// dev: `bun run dashboard:dev` (this server on :5173) proxies the API to the Bun server on :4600.
// changeOrigin makes the Host header match what server.ts' guard() expects.
const proxy = { target: "http://127.0.0.1:4600", changeOrigin: true };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  server: { port: 5173, proxy: { "/api": proxy, "/brand": proxy } },
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 900 },
});
