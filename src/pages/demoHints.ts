/* Demo-only hints (the demo accounts exist only in the in-browser demo backend). */
export const DEMO_PASSWORD = "demo1234";
export const DEMO_ADMINS: Record<string, string> = { harbor: "admin@harbor.demo", northwind: "admin@northwind.demo" };
export const DEMO_SUPER = "super@demo.app";
export const DEMO_HINT = (slug: string) =>
  `Demo: sign in as ${DEMO_ADMINS[slug] || "the owner email your super admin used"} with password ${DEMO_PASSWORD}` +
  (slug === "harbor" ? " (or host@harbor.demo — a Host who can only run live games and polls)." : ".");
