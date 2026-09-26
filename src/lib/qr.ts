import qrcode from "qrcode-generator";

/** QR code as an SVG data URL (works offline, no network). */
export function qrDataUrl(text: string, cell = 6, margin = 2): string {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  const svg = q.createSvgTag({ cellSize: cell, margin, scalable: true });
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
