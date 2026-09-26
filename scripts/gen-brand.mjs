// Generates the brand assets in public/ from src/components/Logo.tsx:
//   favicon.svg, icon-192.png, icon-512.png, apple-touch-icon.png, og-image.png (1200×630)
// Run: node scripts/gen-brand.mjs   (needs Playwright + Chromium; outputs are committed)
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "node_modules/.cache/brand.cjs");
await build({ entryPoints: [join(root, "scripts/brand-entry.tsx")], bundle: true, platform: "node", format: "cjs", outfile: out, jsx: "automatic", logLevel: "warning" });
const require = createRequire(import.meta.url);
const { markSvg, logoHtml } = require(out);

writeFileSync(join(root, "public/favicon.svg"), markSvg(true));

const css = readFileSync(join(root, "src/styles/logo.css"), "utf8");
const font = (f) => `data:font/woff2;base64,${readFileSync(join(root, "src/assets/fonts", f)).toString("base64")}`;
const page = (body, w, h) => `<!doctype html><html><head><style>
@font-face { font-family: Figtree; src: url(${font("figtree-var.woff2")}) format("woff2-variations"); font-weight: 300 900; }
@font-face { font-family: Anton; src: url(${font("anton-400.woff2")}) format("woff2"); }
:root { --ink:#161512; --lime:#C6F432; --orange:#FF5A1F; --paper:#E8E7E2; --card:#FFFEFA; --body: Figtree, sans-serif; --display: Anton, sans-serif; }
* { margin:0; box-sizing:border-box; } body { width:${w}px; height:${h}px; overflow:hidden; font-family: var(--body); }
${css} .bs-mark *, .bs-word * { animation: none !important; }
</style></head><body>${body}</body></html>`;

const pw = require(execSync("npm root -g").toString().trim() + "/playwright");
const browser = await pw.chromium.launch();
const shot = async (html, w, h, file) => {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html);
  await p.waitForTimeout(150);
  await p.screenshot({ path: join(root, "public", file) });
  await p.close();
};
const icon = (size) => page(`<div style="width:${size}px;height:${size}px;background:#FFFEFA;display:grid;place-items:center">${markSvg(false).replace('width="120" height="120"', `width="${size * 0.9}" height="${size * 0.9}"`)}</div>`, size, size);
await shot(icon(180), 180, 180, "apple-touch-icon.png");
await shot(icon(192), 192, 192, "icon-192.png");
await shot(icon(512), 512, 512, "icon-512.png");
await shot(
  page(`<div style="width:1200px;height:630px;background:#C6F432;display:grid;grid-template-columns:1fr 1fr;align-items:center;padding:0 80px;position:relative;overflow:hidden">
    <div style="position:absolute;inset:0;opacity:.2;background-image:radial-gradient(rgba(0,0,0,.35) 1.4px,transparent 1.6px);background-size:18px 18px"></div>
    <div style="position:relative;display:grid;gap:22px">
      <div style="font:400 88px/0.9 Anton,sans-serif;text-transform:uppercase;color:#FF5A1F">Learning your team<br><span style="color:#161512">actually plays.</span></div>
      <div style="font:700 26px/1.35 Figtree,sans-serif;color:#161512;max-width:520px">Daily quiz sprints, live quiz games, polls and certification — under your own brand.</div>
    </div>
    <div style="position:relative;justify-self:center;background:#FFFEFA;border-radius:44px;padding:40px 48px;box-shadow:14px 14px 0 rgba(22,21,18,.2)">${logoHtml(250)}</div>
  </div>`, 1200, 630),
  1200, 630, "og-image.png",
);
await browser.close();
console.log("brand assets written to public/");
