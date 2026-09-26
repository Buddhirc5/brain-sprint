/* Question images: resized and compressed in the browser, stored as a data: URL
   inside the question (no file storage needed). The server re-checks the format
   and size — see supabase/migrations/0004_question_images.sql. */

/** Largest image a question may carry (length of the data: URL). Mirrored in SQL. */
export const MAX_IMG_CHARS = 350_000;
export const IMG_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
export const validImg = (s: unknown): s is string => typeof s === "string" && s.length <= MAX_IMG_CHARS && IMG_RE.test(s);

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      res(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rej(new Error("Couldn't open that image. Try a PNG, JPEG or WebP."));
    };
    img.src = url;
  });
}

/** Fit inside `maxDim` and re-encode (WebP, or JPEG where WebP isn't supported) until it's small enough. */
export async function compressImage(file: File, maxDim = 1024): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif|avif|heic|heif)$/i.test(file.type) && file.type !== "") throw new Error("Use a PNG, JPEG, WebP or GIF image.");
  if (file.size > 15 * 1024 * 1024) throw new Error("That image is over 15 MB — pick a smaller one.");
  const img = await load(file);
  let dim = maxDim;
  for (let pass = 0; pass < 6; pass++) {
    const scale = Math.min(1, dim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("This browser can't process images.");
    ctx.fillStyle = "#fff"; // transparent PNGs → white (JPEG has no alpha)
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    for (const q of [0.82, 0.7, 0.58]) {
      let out = c.toDataURL("image/webp", q);
      if (!out.startsWith("data:image/webp")) out = c.toDataURL("image/jpeg", q);
      if (validImg(out)) return out;
    }
    dim = Math.round(dim * 0.75);
  }
  throw new Error("Couldn't make that image small enough. Try a simpler picture.");
}
