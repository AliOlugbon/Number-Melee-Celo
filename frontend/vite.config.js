import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  // viem uses Node.js 'global' — shim it to browser's globalThis
  define: {
    global: "globalThis",
  },

  // Force Vite to pre-bundle viem so it resolves correctly in the browser
  optimizeDeps: {
    include: ["viem", "viem/chains"],
  },

  server: {
    port: 5173,
    proxy: {
      "/api":    "http://localhost:3001",
      "/admin":  "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
});
