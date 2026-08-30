import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const backendPort = process.env.MNEMOS_PORT || "8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": `http://127.0.0.1:${backendPort}`,
      "/ws": { target: `ws://127.0.0.1:${backendPort}`, ws: true },
    },
  },
});
