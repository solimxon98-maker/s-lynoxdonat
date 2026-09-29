import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// VITE_BASE: GitHub Pages uchun loyiha yo'li, masalan "/s-lynoxdonat/". Lokal ishda "/".
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  let base = env.VITE_BASE || "/";
  if (!base.startsWith("/")) base = `/${base}`;
  if (!base.endsWith("/")) base = `${base}/`;
  return {
    plugins: [react()],
    base,
    server: { port: 5173, host: true },
    build: {
      target: "es2020",
      sourcemap: mode !== "production",
      chunkSizeWarningLimit: 900,
    },
  };
});
