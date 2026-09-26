/* Company admin portal: sign-in (password / email link, per company setting),
   invite acceptance, optional authenticator-app check, then the portal. */
import { useCallback, useEffect, useState } from "react";
import { TenantProvider } from "../app/ctx";
import { useApi, errMsg } from "../app/ApiCtx";
import { AdminSignIn, MfaGate } from "../components/auth";
import { Admin } from "../admin/Admin";
import { Loading } from "../App";
import { Gone } from "./TenantApp";
import { useTenantPub } from "./useTenantPub";
import type { Role } from "../types";
import { absUrl } from "../app/router";
import { isDemo } from "../api/demo/guard";
import { DEMO_HINT } from "./demoHints";

type Gate = { s: "loading" } | { s: "signin" } | { s: "mfa"; enrolled: boolean } | { s: "denied"; email?: string } | { s: "ok"; role: Role };

export function AdminApp({ slug, tab }: { slug: string; tab?: string }) {
  const { api, user, toast } = useApi();
  const { pub, error } = useTenantPub(slug, "Admin");
  const [gate, setGate] = useState<Gate>({ s: "loading" });

  const check = useCallback(async () => {
    if (!pub) return;
    if (!user || user.anonymous) return setGate({ s: "signin" });
    try {
      await api.acceptInvites();
      let a = await api.access(pub.id);
      if (!a.role) {
        // maybe MFA is required before the role counts
        const m = await api.mfaState();
        if (pub.signIn.adminMfa && !m.verified) {
          const mine = await api.myTenants();
          if (mine.some((t) => t.tenantId === pub.id)) return setGate({ s: "mfa", enrolled: m.enrolled });
        }
        return setGate({ s: "denied", email: user.email });
      }
      // MFA also offered (not forced) to admins who enrolled
      const m = await api.mfaState();
      if (m.enrolled && !m.verified && !a.isSuper) return setGate({ s: "mfa", enrolled: true });
      a = await api.access(pub.id);
      setGate(a.role ? { s: "ok", role: a.role } : { s: "denied", email: user.email });
    } catch (e) {
      toast(errMsg(e));
      setGate({ s: "denied", email: user.email });
    }
  }, [api, pub, user, toast]);
  useEffect(() => {
    void check();
  }, [check]);

  if (error) return <Gone title="Can't load" text={error} />;
  if (pub === undefined || gate.s === "loading") return <Loading text="Checking access…" />;
  if (!pub) return <Gone title="Company not found" text="Check the admin link you were given." />;

  if (gate.s === "signin")
    return (
      <div className="phone" style={{ paddingTop: 24 }}>
        <Brand name={pub.branding.productName} company={pub.name} logo={pub.branding.logo} />
        <AdminSignIn method={pub.signIn.adminAuth} redirectTo={absUrl({ r: "admin", slug })} note="For admins invited by your company. Players don't need to sign in here." />
        {isDemo(api) && <p className="banner blue">{DEMO_HINT(slug)}</p>}
        <a className="link" style={{ justifySelf: "center" }} href={`#/t/${slug}`}>Back to the player app</a>
      </div>
    );
  if (gate.s === "mfa")
    return (
      <div className="phone" style={{ paddingTop: 24 }}>
        <Brand name={pub.branding.productName} company={pub.name} logo={pub.branding.logo} />
        <MfaGate enrolled={gate.enrolled} onDone={() => void check()} />
        <button className="link" style={{ justifySelf: "center" }} onClick={() => void api.signOut()}>Sign out</button>
      </div>
    );
  if (gate.s === "denied")
    return (
      <div className="phone" style={{ paddingTop: 24 }}>
        <div className="card stack">
          <h2>No admin access</h2>
          <p className="fine">
            {gate.email ? <b>{gate.email}</b> : "This account"} isn't an admin of {pub.name}
            {pub.status !== "active" ? " (or the company is paused)" : ""}. Ask your company's owner to invite this email, then sign in again.
          </p>
          <button className="btn primary" onClick={() => void api.signOut()}>Sign in with another email</button>
        </div>
      </div>
    );
  return (
    <TenantProvider pub={pub} area="admin" role={gate.role}>
      <Admin tab={tab} />
    </TenantProvider>
  );
}

function Brand({ name, company, logo }: { name: string; company: string; logo?: string }) {
  return (
    <div className="row" style={{ gap: 12 }}>
      {logo && <img src={logo} alt="" width={44} height={44} style={{ borderRadius: 12, objectFit: "contain", background: "#fff" }} />}
      <div>
        <b style={{ fontFamily: "var(--display)", fontSize: 28, textTransform: "uppercase", lineHeight: 1 }}>{name}</b>
        <div className="fine">{company} · Admin</div>
      </div>
    </div>
  );
}
