/* Certificate signature & seal: limits and clean-up shared by the editor, the demo backend
   and (mirrored in SQL) supabase/migrations/0012_certificate_signature.sql. */
import type { CertSettings, SealColor } from "../types";
import { IMG_RE } from "./image";
import { cleanText } from "./security";

/** Largest signature / stamp image (length of the data: URL). Mirrored in SQL. */
export const MAX_MARK_CHARS = 120_000;
export const validMark = (s: unknown): s is string => typeof s === "string" && s.length <= MAX_MARK_CHARS && IMG_RE.test(s);

export const SEAL_COLORS: Record<SealColor, { label: string; bg: string; ring: string; text: string }> = {
  ink: { label: "Ink & lime", bg: "#1B1A17", ring: "#D4F24A", text: "#D4F24A" },
  navy: { label: "Navy & gold", bg: "#1E2F5C", ring: "#E7C35A", text: "#F4DC8E" },
  crimson: { label: "Crimson & gold", bg: "#8E1B22", ring: "#E7C35A", text: "#F4DC8E" },
  forest: { label: "Forest & cream", bg: "#1F4D33", ring: "#F2E6C4", text: "#F2E6C4" },
  gold: { label: "Gold foil", bg: "#B8862B", ring: "#6B4A12", text: "#FFF6DA" },
};

export const initialsOf = (s: string) =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase() || "✓";

/** Keep only the known fields, trimmed to their limits. */
export function cleanCert(c: CertSettings): CertSettings {
  const txt = (s: string | undefined, n: number) => cleanText(s || "", n).trim() || undefined;
  return {
    passPct: Math.max(1, Math.min(100, Math.round(c.passPct))),
    attempts: Math.max(1, Math.min(5, Math.round(c.attempts))),
    certTitle: cleanText(c.certTitle, 80).trim(),
    validMonths: Math.max(0, Math.min(120, Math.round(c.validMonths || 0))),
    showAnswers: !!c.showAnswers,
    signName: txt(c.signName, 60),
    signRole: txt(c.signRole, 60),
    signImg: validMark(c.signImg) ? c.signImg : undefined,
    sealText: txt(c.sealText, 4),
    sealLabel: txt(c.sealLabel, 18),
    sealColor: c.sealColor && c.sealColor in SEAL_COLORS ? c.sealColor : undefined,
    sealImg: validMark(c.sealImg) ? c.sealImg : undefined,
  };
}
