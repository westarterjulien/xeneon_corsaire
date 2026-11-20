import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Port fixe attendu par Tauri (voir src-tauri/tauri.conf.json → build.devUrl).
export default defineConfig({
  plugins: [react()],
  base: "./",
  clearScreen: false,
  // allowedHosts : accès via l'aperçu distant (Companion Preview).
  // watch.ignored / optimizeDeps.entries : ne pas surveiller ni analyser les dépendances Rust
  // (.toolchain, target), qui contiennent des milliers de fichiers HTML.
  server: { port: 1420, strictPort: true, host: true, allowedHosts: true, watch: { ignored: ["**/.toolchain/**", "**/src-tauri/target/**"] } },
  optimizeDeps: { entries: ["index.html", "studio.html", "maquette.html"] },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  // maquette.html : page de présentation (appareil + interface réduite), publiée comme maquette.
  build: { target: "es2021", sourcemap: false, rollupOptions: { input: { main: "index.html", maquette: "maquette.html", studio: "studio.html" } } },
});
