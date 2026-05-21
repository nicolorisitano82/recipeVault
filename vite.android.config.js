import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  base: "./",
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    outDir: "android-studio/app/src/main/assets/web",
    emptyOutDir: true,
    target: ["es2021", "chrome100"],
    minify: "esbuild",
  },
});
