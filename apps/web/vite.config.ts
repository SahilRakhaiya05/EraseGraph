import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const trueForgeProxy = {
  target: "http://127.0.0.1:8790",
  changeOrigin: false,
  rewrite: (path: string) => path.replace(/^\/trueforge/, ""),
};

const controlPlaneProxy = {
  target: "http://127.0.0.1:8787",
  changeOrigin: false,
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": controlPlaneProxy,
      "/health": controlPlaneProxy,
      "/mcp": controlPlaneProxy,
      "/trueforge": trueForgeProxy,
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    proxy: {
      "/api": controlPlaneProxy,
      "/health": controlPlaneProxy,
      "/mcp": controlPlaneProxy,
      "/trueforge": trueForgeProxy,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
  },
});
