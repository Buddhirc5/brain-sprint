import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

/*
  npm run dev              → local dev. Uses Supabase if .env.local has VITE_SUPABASE_URL, otherwise the in-browser demo.
  npm run build            → production build for Vercel (dist/). The demo backend ships as a lazy chunk so visitors can try a
                             localStorage-only sandbox (#/experience) without touching the database.
  npm run build:demo       → one self-contained HTML file with the demo (dist-demo/index.html) — open it from disk or email it to a prospect.
*/
export default defineConfig(() => {
  const demoFile = process.env.BUILD_TARGET === "demo";
  return {
    plugins: [react(), ...(demoFile ? [viteSingleFile()] : [])],
    define: {
      ...(demoFile ? { "import.meta.env.VITE_DEMO": JSON.stringify("1") } : {}),
    },
    base: demoFile ? "./" : "/",
    build: {
      target: "es2020",
      outDir: demoFile ? "dist-demo" : "dist",
      assetsInlineLimit: demoFile ? 100_000_000 : 4096,
      cssCodeSplit: !demoFile,
      sourcemap: false,
      chunkSizeWarningLimit: 600, // the lazy Knowledge World chunk (three.js) is ~520 kB; it only loads when someone opens the game
    },
    server: { port: 5173 },
  };
});
