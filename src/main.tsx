// Base styles first, so page styles (imported by the components below) can override them.
import "./styles/base.css";
import "./styles/chibi.css";
import "./styles/logo.css";
import "./styles/player.css";
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import App from "./App";
import { parse, pathToHash } from "./app/router";

// /signin, /t/acme … (no #) → #/signin, #/t/acme
pathToHash();

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <App />
  </StrictMode>
);
// The landing page is pre-rendered at build time (scripts/prerender.mjs): hydrate it instead of re-drawing.
if (root.firstElementChild && parse(location.hash).r === "home") hydrateRoot(root, app);
else {
  root.textContent = "";
  createRoot(root).render(app);
}
document.documentElement.classList.remove("deep");
