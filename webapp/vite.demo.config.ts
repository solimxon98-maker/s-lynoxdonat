import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// DEMO build: Supabase va admin ma'lumot qatlami brauzer ichidagi mock bilan almashtiriladi.
// npm run build:demo  → dist-demo/demo.html (hech qanday server yoki kalit kerak emas)
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const SWAP: Record<string, string> = {
  "/src/lib/supabase.ts": r("./src/demo/supabaseMock.ts"),
  "/src/lib/adminData.ts": r("./src/demo/adminDataMock.ts"),
};

function demoSwap(): Plugin {
  return {
    name: "demo-swap",
    enforce: "pre",
    async resolveId(source, importer, options) {
      const res = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!res) return null;
      const id = res.id.replace(/\\/g, "/");
      for (const [suffix, target] of Object.entries(SWAP)) if (id.endsWith(suffix)) return target;
      return null;
    },
  };
}

export default defineConfig({
  plugins: [demoSwap(), react()],
  base: "./",
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://demo.local"),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify("demo"),
  },
  server: { fs: { allow: [".."] } },
  build: {
    outDir: "dist-demo",
    target: "es2020",
    emptyOutDir: true,
    rollupOptions: { input: r("./demo.html"), output: { inlineDynamicImports: true } },
  },
});
