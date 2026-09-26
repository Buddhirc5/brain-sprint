import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import "./styles/base.css";
import "./styles/chibi.css";
import "./styles/logo.css";
import "./styles/player.css";

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);
// The landing page is pre-rendered at build time (scripts/prerender.mjs): hydrate it instead of re-drawing.
const home = !location.hash || location.hash === "#" || location.hash === "#/";
if (root.firstElementChild && home) hydrateRoot(root, app);
else {
  root.textContent = "";
  document.documentElement.classList.remove("deep");
  createRoot(root).render(app);
}
