/* Bundled by scripts/gen-brand.mjs: renders the logo to static SVG/HTML for icons & the social image. */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LogoMark, Logo } from "../src/components/Logo";

export const markSvg = (bg: boolean) =>
  renderToStaticMarkup(h(LogoMark, { size: 120, bg, still: true })).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
export const logoHtml = (size: number) => renderToStaticMarkup(h(Logo, { variant: "stack", size }));
