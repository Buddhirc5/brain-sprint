import type { Api } from "../Api";
/** Extra helpers only the in-browser demo backend has. */
export interface DemoExtras {
  demoFreshTab(): Promise<void>; // new anonymous identity for this tab only (test several players in one browser)
  demoMfaCode(): Promise<string | null>; // current authenticator code, so testers don't need a phone
}
export const isDemo = (a: Api): a is Api & DemoExtras => a.mode === "demo";
