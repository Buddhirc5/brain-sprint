/* Build-time render of the landing page (scripts/prerender.mjs) so search engines and
   first paint get real HTML; the browser then hydrates it (src/main.tsx). */
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import App from "./App";
import { setSsrPath } from "./app/router";
export { FAQ } from "./pages/faq";
export { HOME_META, PUBLIC_PAGES, SECTION_META } from "./pages/seo";

/** HTML for one public page: "/" (landing) or a section page like "/features". */
export function render(path = "/"): string {
  setSsrPath(path);
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
