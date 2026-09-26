/* Build-time render of the landing page (scripts/prerender.mjs) so search engines and
   first paint get real HTML; the browser then hydrates it (src/main.tsx). */
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import App from "./App";
export { FAQ } from "./pages/faq";

export function render(): string {
  return renderToString(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
