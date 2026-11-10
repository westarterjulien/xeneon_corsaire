import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Port fixe attendu par Tauri (voir src-tauri/tauri.conf.json → build.devUrl).
export default defineConfig({
  plugins: [react()],
  base: "./",
  clearScreen: false,
  // allowedHosts : accès via l'aperçu distant (Companion Preview).
  server: { port: 1420, strictPort: true, host: true, allowedHosts: true },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  // maquette.html : page de présentation (appareil + interface réduite), publiée comme maquette.
  build: { target: "es2021", sourcemap: false, rollupOptions: { input: { main: "index.html", maquette: "maquette.html", studio: "studio.html" } } },
});
