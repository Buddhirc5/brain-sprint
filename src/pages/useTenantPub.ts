import { useEffect, useState } from "react";
import { useApi, errMsg } from "../app/ApiCtx";
import { applyBranding, setTitle } from "../app/theme";
import type { TenantPublic } from "../types";

/** Loads a company's public profile by its web address and applies its brand. */
export function useTenantPub(slug: string, titleSuffix = "") {
  const { api } = useApi();
  const [pub, setPub] = useState<TenantPublic | null | undefined>(undefined);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setPub(undefined);
    api.tenantBySlug(slug).then(
      (p) => {
        if (!live) return;
        setPub(p);
        if (p) {
          applyBranding(p.branding);
          setTitle(p.branding.productName + (titleSuffix ? " · " + titleSuffix : ""));
        }
      },
      (e) => live && setError(errMsg(e)),
    );
    return () => {
      live = false;
    };
  }, [api, slug, titleSuffix]);
  return { pub, error };
}
