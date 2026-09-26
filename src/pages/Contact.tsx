/* Contact sales (#/contact): the sales email with Copy and "open in" buttons.
   A plain mailto: link does nothing for people without a desktop mail app (most Gmail/Outlook web users). */
import { useState } from "react";
import { Mascot } from "../components/Chibi";
import { CONTACT_EMAIL, SiteFooter, SiteHeader } from "./site";

const SUBJECT = "Ant Arena — demo request";
const BODY = "Hi Ant Arena team,\n\nCompany:\nTeam size:\nWhat we'd like to train:\nBest time for a call:\n\nThanks!";

export function Contact() {
  const [copied, setCopied] = useState(false);
  const to = encodeURIComponent(CONTACT_EMAIL);
  const su = encodeURIComponent(SUBJECT);
  const body = encodeURIComponent(BODY);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* the address is selectable on screen */
    }
  };
  return (
    <div className="home">
      <SiteHeader />
      <section className="h-contact">
        <div className="h-contact-copy">
          <span className="h-tag">Contact sales</span>
          <h1 className="h-page-title">
            Let's talk<span className="ink">training.</span>
          </h1>
          <p className="h-sub">Tell us about your team and what you want people to learn. We'll set up a demo with your logo and colours, and answer security questions.</p>
          {CONTACT_EMAIL ? (
            <div className="h-contact-card">
              <span className="h-co-lbl">Email our sales team</span>
              <div className="h-contact-mail">
                <b className="h-contact-addr">{CONTACT_EMAIL}</b>
                <button type="button" className="btn primary small" onClick={copy} aria-live="polite">
                  {copied ? "Copied ✓" : "Copy email"}
                </button>
              </div>
              <div className="h-contact-open">
                <a className="btn white small" href={`https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${su}&body=${body}`} target="_blank" rel="noopener noreferrer">
                  Open in Gmail
                </a>
                <a className="btn white small" href={`https://outlook.office.com/mail/deeplink/compose?to=${to}&subject=${su}&body=${body}`} target="_blank" rel="noopener noreferrer">
                  Open in Outlook
                </a>
                <a className="btn white small" href={`mailto:${CONTACT_EMAIL}?subject=${su}&body=${body}`}>
                  Use my email app
                </a>
              </div>
              <span className="fine">Tip: include your company, team size and what you'd like to train.</span>
            </div>
          ) : (
            <p className="banner">Sales contact isn't set up yet. Meanwhile, try the product yourself in the free demo.</p>
          )}
          <div className="h-sec-cta">
            <a className="btn lime" href="#/experience">Try the demo first</a>
          </div>
        </div>
        <div className="h-contact-art" aria-hidden="true">
          <Mascot who="explorer" mood="cheer" size={150} />
          <Mascot who="puff" mood="happy" size={150} />
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
