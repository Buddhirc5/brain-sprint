/* Starter packs: ready-made certifications, live quizzes and live polls an admin can add in one
   click (as drafts). One banking set and one general-knowledge set of each. */
import type { Slide } from "../types";

/** [question, options, right option index, explanation] — or a true/false: [question, true|false, explanation]. */
type MC = [string, string[], number, string];
type TF = [string, boolean, string];
export type PackQ = MC | TF;

export interface QuizPack {
  id: string;
  kind: "cert" | "live";
  industry: "bank" | "any";
  title: string;
  desc: string;
  topic: string;
  certTitle?: string;
  questions: PackQ[];
}
export interface PollPack {
  id: string;
  kind: "poll";
  industry: "bank" | "any";
  title: string;
  desc: string;
  slides: Omit<Slide, "id">[];
}
export type StarterPack = QuizPack | PollPack;

export const STARTER_PACKS: StarterPack[] = [
  /* ---------------- certifications ---------------- */
  {
    id: "cert-bank",
    kind: "cert",
    industry: "bank",
    title: "Banking Essentials Certification",
    desc: "Pass mark 80% · 3 attempts · valid 1 year",
    topic: "Banking Knowledge",
    certTitle: "Certified in Banking Essentials",
    questions: [
      ["What does KYC stand for?", ["Keep Your Cash", "Know Your Customer", "Key Yield Calculation", "Know Your Credit"], 1, "KYC means verifying who a customer is before and during the relationship."],
      ["A customer wants to deposit a large amount of cash in many small amounts over several days. What is this called?", ["Structuring (smurfing)", "Layering", "Netting", "Pooling"], 0, "Splitting cash to stay under reporting limits is structuring — a classic money-laundering red flag. Report it."],
      ["You suspect a transaction is linked to money laundering. What should you do?", ["Tell the customer you're reporting them", "Ignore it if the customer is a regular", "Report it to your compliance / MLRO without telling the customer", "Refuse all future business without a report"], 2, "Report internally and never 'tip off' the customer — tipping off is itself an offence."],
      ["The bank may ask a customer to share their card PIN over the phone to verify them.", false, "Never. A PIN or OTP is for the customer alone. Anyone asking for one is a fraudster."],
      ["What is the main purpose of a credit score?", ["To set the customer's salary", "To estimate how likely a borrower is to repay", "To decide the branch's opening hours", "To measure deposit growth"], 1, "Lenders use credit scores to judge repayment risk and price loans."],
      ["Which of these is a fixed-income product?", ["Ordinary shares", "A government bond", "A crypto token", "A commodity future"], 1, "Bonds pay fixed interest (coupons) until they mature."],
      ["A 'politically exposed person' (PEP) needs enhanced due diligence.", true, "PEPs carry higher bribery and corruption risk, so banks apply extra checks and approvals."],
      ["What does APR show a borrower?", ["Only the monthly instalment", "The yearly cost of credit including interest and most fees", "The bank's profit margin", "The deposit insurance limit"], 1, "APR (annual percentage rate) lets customers compare the true yearly cost of loans."],
      ["A customer complains on social media. What is the best first step?", ["Delete the comment", "Respond publicly with their account details", "Acknowledge politely and move the conversation to a secure private channel", "Ignore it"], 2, "Show you care in public, then solve it privately — never share account data in public."],
      ["Leaving your workstation unlocked for two minutes inside the branch is acceptable.", false, "Always lock it (Windows + L). Any action taken on your login is recorded under your ID."],
    ],
  },
  {
    id: "cert-general",
    kind: "cert",
    industry: "any",
    title: "Workplace Essentials Certification",
    desc: "Pass mark 80% · 3 attempts · valid 1 year",
    topic: "General Knowledge",
    certTitle: "Certified in Workplace Essentials",
    questions: [
      ["An email says your account will close in 2 hours unless you 'verify' your password. What should you do?", ["Click the link quickly", "Reply with your password", "Report it as phishing and delete it", "Forward it to a colleague"], 2, "Urgency plus a request for credentials is a classic phishing sign."],
      ["Which password is the strongest?", ["Summer2026!", "P@ssw0rd", "river-Lamp-kite-73-Mango", "Company123"], 2, "Long passphrases of random words are far harder to crack."],
      ["It's fine to share customer data with a friend if they promise to keep it secret.", false, "Personal data is only shared for a legitimate business reason and with authorised people."],
      ["What should you do first if you see a fire in the office?", ["Finish your email", "Raise the alarm and leave by the nearest safe exit", "Use the lift to get out quickly", "Collect your belongings"], 1, "Raise the alarm, evacuate by the stairs and go to the assembly point."],
      ["Which behaviour best shows respect in meetings?", ["Interrupting to save time", "Listening fully and letting others finish", "Checking your phone", "Only speaking to senior people"], 1, "Active listening makes meetings faster and fairer for everyone."],
      ["You find a USB stick in the car park. What is the safest action?", ["Plug it in to find the owner", "Hand it to IT / security without using it", "Use it for your files", "Throw it in the bin"], 1, "Unknown USB sticks can carry malware. Let IT handle it."],
      ["A gift from a supplier worth more than the policy limit should be declared.", true, "Declaring gifts protects you and the company from conflicts of interest."],
      ["What does 'GDPR' mainly protect?", ["Company trade secrets", "People's personal data", "Software licences", "Shareholder votes"], 1, "GDPR (and similar laws worldwide) protect personal data and privacy rights."],
      ["A colleague is being treated unfairly. What helps most?", ["Stay silent", "Join in", "Support them and report it through the proper channel", "Post about it online"], 2, "Speak up safely and use your company's reporting routes."],
      ["Locking your screen when you leave your desk takes just a second and protects your access.", true, "Windows + L, or Ctrl + Cmd + Q on Mac."],
    ],
  },

  /* ---------------- live quizzes ---------------- */
  {
    id: "live-bank",
    kind: "live",
    industry: "bank",
    title: "Banking Knowledge Showdown",
    desc: "8 fast questions · 20 seconds each",
    topic: "Banking Knowledge",
    questions: [
      ["What does ATM stand for?", ["Automated Teller Machine", "Any Time Money", "Automatic Transfer Module", "Account Transaction Manager"], 0, "The first ATMs appeared in the 1960s."],
      ["Which organisation usually sets a country's main interest rate?", ["The tax office", "The central bank", "The stock exchange", "The largest retail bank"], 1, "Central banks set policy rates to manage inflation."],
      ["IBAN numbers help send money between countries.", true, "IBAN (International Bank Account Number) identifies accounts across borders."],
      ["What is 'phishing'?", ["A savings product", "A fake message that tricks you into giving details", "A type of loan", "A branch audit"], 1, "Phishing uses fake emails, texts or calls to steal credentials."],
      ["Which card lets a customer spend money they already have in their account?", ["Credit card", "Debit card", "Charge card", "Store card"], 1, "Debit cards draw directly from the customer's own balance."],
      ["Compound interest earns interest on previously earned interest.", true, "That's why starting to save early makes such a difference."],
      ["What does 'liquidity' mean for a bank?", ["Its number of branches", "How easily it can meet cash demands", "Its brand colours", "Its staff turnover"], 1, "Liquidity is the ability to pay what's owed when it's due."],
      ["A customer's OTP should be read out to staff to confirm a transfer.", false, "Never ask for — or accept — a customer's OTP. Warn them about the scam."],
    ],
  },
  {
    id: "live-general",
    kind: "live",
    industry: "any",
    title: "General Knowledge Showdown",
    desc: "8 fun questions · 20 seconds each",
    topic: "General Knowledge",
    questions: [
      ["Which planet is known as the Red Planet?", ["Venus", "Mars", "Jupiter", "Mercury"], 1, "Iron oxide dust gives Mars its red colour."],
      ["What is the largest ocean on Earth?", ["Atlantic", "Indian", "Pacific", "Arctic"], 2, "The Pacific covers about a third of the planet's surface."],
      ["Light travels faster than sound.", true, "That's why you see lightning before you hear thunder."],
      ["How many continents are there?", ["5", "6", "7", "8"], 2, "Africa, Antarctica, Asia, Australia/Oceania, Europe, North and South America."],
      ["Which gas do plants mostly absorb from the air?", ["Oxygen", "Nitrogen", "Carbon dioxide", "Helium"], 2, "Plants use CO₂ and sunlight to make sugar through photosynthesis."],
      ["Which language has the most native speakers?", ["English", "Spanish", "Mandarin Chinese", "Hindi"], 2, "Mandarin Chinese has close to a billion native speakers."],
      ["The Great Wall of China is easy to see from the Moon with the naked eye.", false, "It's a popular myth — the wall is far too narrow to see from that distance."],
      ["What is the hardest natural substance?", ["Gold", "Iron", "Diamond", "Quartz"], 2, "Diamond scores 10 on the Mohs hardness scale."],
    ],
  },

  /* ---------------- live polls ---------------- */
  {
    id: "poll-bank",
    kind: "poll",
    industry: "bank",
    title: "Branch Team Pulse",
    desc: "6 slides · branch huddles and banking town halls",
    slides: [
      { type: "text", prompt: "Welcome to the team pulse", body: "Answer on your phone — it's anonymous.\nWe'll look at the results together." },
      { type: "word", prompt: "One word for how this month felt at your branch", maxWords: 1 },
      { type: "mc", prompt: "Which training should we run next?", options: ["Fraud & scam awareness", "Customer service", "Digital banking products", "Lending & credit basics"], multi: false },
      { type: "scale", prompt: "How confident are you spotting a scam call or message?", scaleMin: 1, scaleMax: 5, scaleLabels: ["Not confident", "Very confident"] },
      { type: "points", prompt: "Share 100 points between next quarter's priorities", options: ["Shorter queue times", "More digital adoption", "Fewer errors", "Staff training"] },
      { type: "qa", prompt: "Ask the leadership team anything" },
    ],
  },
  {
    id: "poll-general",
    kind: "poll",
    industry: "any",
    title: "All-hands Icebreaker",
    desc: "6 slides · town halls, workshops and kick-offs",
    slides: [
      { type: "text", prompt: "Welcome — let's warm up", body: "Grab your phone and join with the code on screen.\nAnswers are anonymous." },
      { type: "word", prompt: "Describe our team in one word", maxWords: 1 },
      { type: "guess", prompt: "How many cups of coffee does our office drink in a week?", numMin: 0, numMax: 500 },
      { type: "rank", prompt: "Rank what matters most to you at work", options: ["Learning new skills", "Work-life balance", "Great teammates", "Recognition"] },
      { type: "grid", prompt: "Where do these ideas sit?", options: ["Team lunch day", "Mentoring", "New tools"], axes: ["Effort", "Impact"] },
      { type: "open", prompt: "What's one thing we should start doing?" },
    ],
  },
];
