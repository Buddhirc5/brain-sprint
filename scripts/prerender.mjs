// Post-build step: renders the landing page to HTML and adds SEO extras.
//   node scripts/prerender.mjs [outDir]      (outDir defaults to dist)
// - injects the server-rendered landing page into #root (fast first paint, crawlable content)
// - adds canonical/og:url/og:image (absolute when VITE_APP_URL is set), JSON-LD structured data
//   (Organization, WebSite, SoftwareApplication, FAQPage) and font preloads
// - writes robots.txt and, when VITE_APP_URL is set, sitemap.xml
import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadEnv } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, process.argv[2] || "dist");
const ssrDir = join(root, "dist-ssr");
const env = { ...loadEnv("production", root, ""), ...process.env };
const site = (env.VITE_APP_URL || "").replace(/\/+$/, "");
const demoFile = outDir.endsWith("dist-demo");

const { render, FAQ } = await import(pathToFileURL(join(ssrDir, "entry-server.js")).href);
const appHtml = render();

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const abs = (p) => (site ? site + p : p);
const img = demoFile ? "og-image.png" : abs("/og-image.png");

const ld = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Ant Arena",
    ...(site ? { url: site + "/", logo: site + "/icon-512.png" } : {}),
    slogan: "Learning your team actually plays.",
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Ant Arena",
    ...(site ? { url: site + "/" } : {}),
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Ant Arena",
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Employee training",
    operatingSystem: "Web browser (iOS, Android, Windows, macOS)",
    description:
      "White-label gamified microlearning platform: daily quiz sprints, live quiz games, live polls and certification exams with knowledge-gap analytics.",
    featureList: [
      "Two-minute daily quiz sprints with coins, streaks and levels",
      "Live quiz games on a big screen with a game PIN",
      "Live polls: word clouds, ratings, rankings and Q&A",
      "Certification exams with printable certificates",
      "Knowledge-gap analytics by branch and department",
      "White-label branding, roles, MFA and audit logs",
    ],
    ...(site ? { url: site + "/", image: site + "/og-image.png" } : {}),
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  },
];

let fonts = "";
const assets = join(outDir, "assets");
if (!demoFile && existsSync(assets))
  for (const f of readdirSync(assets))
    if (/^(anton|figtree).*\.woff2$/.test(f)) fonts += `<link rel="preload" href="/assets/${f}" as="font" type="font/woff2" crossorigin />\n    `;

const seo = [
  site ? `<link rel="canonical" href="${site}/" />` : "",
  site ? `<meta property="og:url" content="${site}/" />` : "",
  `<meta property="og:image" content="${img}" />`,
  `<meta name="twitter:image" content="${img}" />`,
  fonts.trim(),
  ...ld.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`),
]
  .filter(Boolean)
  .join("\n    ");

const file = join(outDir, "index.html");
let html = readFileSync(file, "utf8");
if (!html.includes('<div id="root"></div>')) throw new Error("prerender: #root placeholder not found");
html = html.replace("<!--seo-->", seo).replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);
writeFileSync(file, html);

if (!demoFile) {
  writeFileSync(join(outDir, "robots.txt"), `User-agent: *\nAllow: /\n${site ? `\nSitemap: ${site}/sitemap.xml\n` : ""}`);
  if (site)
    writeFileSync(
      join(outDir, "sitemap.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${esc(site)}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n`,
    );
}
rmSync(ssrDir, { recursive: true, force: true });
console.log(`prerender: landing page rendered into ${file}${site ? ` (site ${site})` : " (set VITE_APP_URL for canonical/sitemap)"}`);
