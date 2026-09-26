import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

/*
  npm run dev              → local dev. Uses Supabase if .env.local has VITE_SUPABASE_URL, otherwise the in-browser demo.
  npm run build            → production build for Vercel (dist/). The demo backend is left out when Supabase is configured.
  npm run build:demo       → one self-contained HTML file with the demo (dist-demo/index.html) — open it from disk or email it to a prospect.
*/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const demoFile = process.env.BUILD_TARGET === "demo";
  const hasSupabase = !!env.VITE_SUPABASE_URL && !!env.VITE_SUPABASE_ANON_KEY;
  const demo = demoFile || !hasSupabase || env.VITE_DEMO === "1";
  return {
    plugins: [react(), ...(demoFile ? [viteSingleFile()] : [])],
    define: {
      __DEMO__: JSON.stringify(demo),
      ...(demoFile ? { "import.meta.env.VITE_DEMO": JSON.stringify("1") } : {}),
    },
    base: demoFile ? "./" : "/",
    build: {
      target: "es2020",
      outDir: demoFile ? "dist-demo" : "dist",
      assetsInlineLimit: demoFile ? 100_000_000 : 4096,
      cssCodeSplit: !demoFile,
      sourcemap: false,
    },
    server: { port: 5173 },
  };
});
