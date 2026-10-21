// Post-build step: renders the public pages to HTML and adds SEO extras.
//   node scripts/prerender.mjs [outDir]      (outDir defaults to dist)
// - renders the landing page into index.html and each section into its own page (features.html …,
//   served at /features by vercel.json "cleanUrls"), each with its own title, description and canonical
// - absolute canonical / og:url / og:image from the site address: VITE_APP_URL, else Vercel's production
//   domain, else the default below; JSON-LD structured data; font preloads; a preconnect to Supabase
// - writes robots.txt (app areas kept out of search) and sitemap.xml
import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadEnv } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, process.argv[2] || "dist");
const ssrDir = join(root, "dist-ssr");
const env = { ...loadEnv("production", root, ""), ...process.env };
const demoFile = outDir.endsWith("dist-demo");
const DEFAULT_SITE = "https://antarena.vercel.app";
const site = demoFile
  ? ""
  : (env.VITE_APP_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "") || DEFAULT_SITE).replace(/\/+$/, "");
const supabase = (() => {
  try {
    return env.VITE_SUPABASE_URL ? new URL(env.VITE_SUPABASE_URL).origin : "";
  } catch {
    return "";
  }
})();

const { render, FAQ, HOME_META, PUBLIC_PAGES } = await import(pathToFileURL(join(ssrDir, "entry-server.js")).href);

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const abs = (p) => (site ? site + p : p);
const img = demoFile ? "og-image.png" : abs("/og-image.png");
const json = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;

const org = { "@context": "https://schema.org", "@type": "Organization", name: "Ant Arena", ...(site ? { url: site + "/", logo: site + "/icon-512.png" } : {}), slogan: "Learning your team actually plays." };
const website = { "@context": "https://schema.org", "@type": "WebSite", name: "Ant Arena", ...(site ? { url: site + "/" } : {}) };
const app = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Ant Arena",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Employee training",
  operatingSystem: "Web browser (iOS, Android, Windows, macOS)",
  description: "White-label gamified microlearning platform: daily quiz sprints, live quiz games, live polls and certification exams with knowledge-gap analytics.",
  featureList: [
    "Two-minute daily quiz sprints with coins, streaks and levels",
    "Live quiz games on a big screen with a game PIN",
    "Live polls: word clouds, ratings, rankings and Q&A",
    "Certification exams with printable certificates",
    "Knowledge-gap analytics by team, office and department",
    "White-label branding, roles, MFA and audit logs",
  ],
  ...(site ? { url: site + "/", image: site + "/og-image.png" } : {}),
};
const faq = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
const crumbs = (m) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", ...(site ? { item: site + "/" } : {}) },
    { "@type": "ListItem", position: 2, name: m.tag, ...(site ? { item: site + m.path } : {}) },
  ],
});

let fonts = "";
const assets = join(outDir, "assets");
if (!demoFile && existsSync(assets))
  for (const f of readdirSync(assets))
    if (/^(anton|figtree).*\.woff2$/.test(f)) fonts += `<link rel="preload" href="/assets/${f}" as="font" type="font/woff2" crossorigin />\n    `;

const template = readFileSync(join(outDir, "index.html"), "utf8");
if (!template.includes('<div id="root"></div>')) throw new Error("prerender: #root placeholder not found");
// the inline script in index.html is allowed by its hash in vercel.json's Content-Security-Policy:
// stop the build if they drift apart (the site would otherwise run without that script)
if (!demoFile)
  for (const [, code] of template.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    const h = "sha256-" + createHash("sha256").update(code).digest("base64");
    if (!readFileSync(join(root, "vercel.json"), "utf8").includes(h)) throw new Error(`prerender: add '${h}' to script-src in vercel.json (index.html's inline script changed)`);
  }

/** One page's HTML: the template with this page's head and server-rendered body. */
function page(m) {
  const home = m.path === "/";
  const url = abs(m.path);
  const ld = home ? [org, website, app, faq] : [crumbs(m), ...(m.path === "/faq" ? [faq] : [])];
  const head = [
    site ? `<link rel="canonical" href="${esc(url)}" />` : "",
    site ? `<meta property="og:url" content="${esc(url)}" />` : "",
    `<meta property="og:image" content="${img}" />`,
    `<meta name="twitter:image" content="${img}" />`,
    supabase && !demoFile ? `<link rel="preconnect" href="${esc(supabase)}" crossorigin />` : "",
    fonts.trim(),
    ...ld.map(json),
  ]
    .filter(Boolean)
    .join("\n    ");
  const t = esc(m.title), d = esc(m.description);
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
    .replace(/(<meta name="description" content=")[^"]*"/, `$1${d}"`)
    .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${t}"`)
    .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${d}"`)
    .replace(/(<meta name="twitter:title" content=")[^"]*"/, `$1${t}"`)
    .replace(/(<meta name="twitter:description" content=")[^"]*"/, `$1${d}"`)
    .replace("<!--seo-->", head)
    .replace('<div id="root"></div>', `<div id="root">${render(m.path)}</div>`);
}

writeFileSync(join(outDir, "index.html"), page(HOME_META));
const written = ["index.html"];
if (!demoFile)
  for (const m of PUBLIC_PAGES.filter((p) => p.path !== "/")) {
    const f = m.path.slice(1) + ".html";
    writeFileSync(join(outDir, f), page(m));
    written.push(f);
  }

if (!demoFile) {
  // the public site is indexable; company portals, admin, sign-in and live games are not
  const keepOut = ["/t/", "/super", "/join", "/vote", "/signin", "/sign-in", "/login", "/admin"];
  writeFileSync(join(outDir, "robots.txt"), `User-agent: *\nAllow: /\n${keepOut.map((p) => `Disallow: ${p}`).join("\n")}\n${site ? `\nSitemap: ${site}/sitemap.xml\n` : ""}`);
  if (site) {
    const today = new Date().toISOString().slice(0, 10);
    const urls = PUBLIC_PAGES.map((m) => `  <url><loc>${esc(site + m.path)}</loc><lastmod>${today}</lastmod><changefreq>${m.path === "/" ? "weekly" : "monthly"}</changefreq><priority>${m.path === "/" ? "1.0" : "0.8"}</priority></url>`);
    writeFileSync(join(outDir, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
  }
}
rmSync(ssrDir, { recursive: true, force: true });
console.log(`prerender: ${written.join(", ")} written${site ? ` (site ${site})` : ""}`);
