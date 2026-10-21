/* Search and sharing details for the public pages: the landing page (/) and one page per landing
   section (/features …). Used by the build (scripts/prerender.mjs writes each page's <head>) and in the
   browser (tab title, description and canonical when moving between them). Titles stay under ~60
   characters and descriptions under ~155, so search results show them whole. */
import type { Section } from "../app/router";

export interface PageMeta {
  path: string;
  title: string;
  description: string;
  /** section pages: the small label, heading and intro above the section */
  tag?: string;
  h1?: string;
  lead?: string;
}

export const HOME_META: PageMeta = {
  path: "/",
  title: "Ant Arena — Gamified employee training & quiz games",
  description: "White-label gamified training: 2-minute daily quizzes, live quiz games, polls and certification your team actually plays — with knowledge-gap analytics.",
};

export const SECTION_META: Record<Section, PageMeta> = {
  features: {
    path: "/features",
    title: "Features: daily quizzes, live games & polls · Ant Arena",
    description: "Daily quiz sprints, live quiz games, word clouds and polls, certification exams, coins and streaks, and knowledge-gap analytics — under your own brand.",
    tag: "Features",
    h1: "Training your people actually finish",
    lead: "Daily practice, big-room energy and proof of competence — in one branded app that runs in any browser, with nothing to install.",
  },
  "how-it-works": {
    path: "/how-it-works",
    title: "How it works: live in a day · Ant Arena",
    description: "Get your own branded address, add offices and departments, and let staff play two minutes a day. Spot weak topics by team and watch them improve.",
    tag: "How it works",
    h1: "Up and running in a day",
    lead: "Your company gets its own branded address. Staff play two minutes a day from any phone or laptop. You see exactly where the knowledge gaps are.",
  },
  "use-cases": {
    path: "/use-cases",
    title: "Use cases: onboarding, compliance & sales · Ant Arena",
    description: "Gamified training for HR and onboarding, compliance and safety, sales and customer teams, and leaders running all-hands polls and live games.",
    tag: "Who it's for",
    h1: "Gamified training for every team",
    lead: "From a new joiner's first week to the yearly compliance refresher and the all-hands Q&A — one platform your teams already enjoy.",
  },
  security: {
    path: "/security",
    title: "Security: built for banks · Ant Arena",
    description: "Row-level tenant isolation, server-side scoring, five admin roles with authenticator sign-in, maker-checker approvals and a full audit trail.",
    tag: "Security",
    h1: "Security your IT team will sign off",
    lead: "Every company's data is walled off at the database level, answers are checked on the server, and every admin action is logged.",
  },
  faq: {
    path: "/faq",
    title: "FAQ: gamified employee training · Ant Arena",
    description: "Answers about Ant Arena: how daily quizzes and live games work, branding, sign-in options, security, certificates, analytics and getting started.",
    tag: "FAQ",
    h1: "Ant Arena FAQ",
    lead: "Everything companies usually ask before rolling out Ant Arena — from sign-in and branding to security reviews.",
  },
};

export const PUBLIC_PAGES: PageMeta[] = [HOME_META, ...Object.values(SECTION_META)];
