import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

const uiOnly = process.env.FAMILY_VAULT_UI_ONLY === "1";

export default defineConfig({
  plugins: [react(), ...(uiOnly ? [] : [cloudflare()])],
  build: { sourcemap: true, ...(uiOnly ? { outDir: "dist/client" } : {}) },
  server: { host: "0.0.0.0", port: 5173 }
});
