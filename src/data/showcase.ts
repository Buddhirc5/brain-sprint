/* Demo content for the newer question types (swipe sort, buckets, case study): one daily quiz per
   demo company, so the sandbox shows them off. Written as admin drafts and sealed like the editor does. */
import { sealQuestion, type DraftQ, type DraftScene } from "../lib/answers";
import type { AnswerKey, Game } from "../types";

type Reply = [string, string, 0 | 1 | 2]; // what you say · what happens · 2 best, 1 okay, 0 poor
const scene = (who: DraftScene["who"], name: string, say: string, replies: Reply[]): DraftScene => ({ who, name, say, choices: replies.map(([t, then, q]) => ({ t, then, q })) });
const base = (id: string, topic: string, q: string, explain: string) => ({ id, topic, q, explain, options: [], answer: 0, tf: true, pairs: [], steps: [] });

const BANK: DraftQ[] = [
  {
    ...base("sh-sw", "Cyber Security", "Swipe each card: risky or safe?", "Anything that hands over credentials, OTPs or skips checks is risky — report it."),
    type: "swipe",
    sides: ["Risky", "Safe"],
    cards: [
      { t: "A caller asks for a customer's OTP to 'verify' them", side: 0 },
      { t: "Checking ID before any account change", side: 1 },
      { t: "Sharing your login with a colleague who's covering", side: 0 },
      { t: "Locking your screen when you step away", side: 1 },
      { t: "Clicking a link in an 'urgent' SMS from 'the bank'", side: 0 },
      { t: "Reporting a phishing email with the report button", side: 1 },
    ],
  },
  {
    ...base("sh-bk", "AML & Compliance", "Sort each item: personal data or not?", "If it can identify a person, it's personal data — protect it."),
    type: "bucket",
    buckets: ["Personal data", "Not personal"],
    things: [
      { t: "Customer's NIC number", b: 0 },
      { t: "Today's exchange rate", b: 1 },
      { t: "A customer's mobile number", b: 0 },
      { t: "Branch opening hours", b: 1 },
      { t: "A photo of a customer", b: 0 },
      { t: "Savings interest rate", b: 1 },
    ],
  },
  {
    ...base("sh-st", "Customer Experience", "The blocked card", "Calm the customer first, verify identity, fix it in the branch when you can — and keep your manager in the loop."),
    type: "story",
    story: {
      intro: "Monday, 9:05 am. The branch has just opened. A customer hurries to your counter, phone in hand.",
      scenes: [
        scene("customer", "Nimal", "My card got blocked and I fly to Dubai in two hours! Fix it NOW!", [
          ["I'm sorry — let's sort this out together. May I see your ID?", "Nimal takes a breath and hands over his ID.", 2],
          ["Please call our hotline, they handle card blocks.", "Nimal sighs: “I'm already standing here…”", 1],
          ["Cards aren't my department, sorry.", "Nimal's voice rises: “Then whose department IS it?”", 0],
        ]),
        scene("narrator", "", "The system shows the card was blocked after three wrong PIN tries at an ATM last night.", [
          ["Explain why, verify him, and unblock it with a fresh PIN", "Nimal relaxes: “That was me — I forgot my new PIN!”", 2],
          ["Unblock it straight away, no questions", "It works — but you skipped the checks the bank requires.", 0],
          ["Ask him to come back tomorrow", "He'd miss his flight. Nimal asks for your manager.", 0],
        ]),
        scene("manager", "Ms. Perera", "Everything okay here? I saw a queue building.", [
          ["All sorted — I verified him and unblocked the card. He's on his way.", "Ms. Perera smiles: “That's exactly how we do it.”", 2],
          ["I think so — I'm not sure I followed every step.", "Ms. Perera walks you through the checklist — useful for next time.", 1],
          ["It was chaos, the customer was rude.", "Ms. Perera frowns: “And what did you do to help him?”", 0],
        ]),
      ],
      endings: ["", "", ""],
    },
  },
];

const GENERAL: DraftQ[] = [
  {
    ...base("sh-sw", "Cyber Security", "Swipe each card: myth or fact?", "Length beats symbols, urgency is a phishing tell, and private browsing doesn't hide you from your employer."),
    type: "swipe",
    sides: ["Myth", "Fact"],
    cards: [
      { t: "A short password is fine if it has symbols", side: 0 },
      { t: "Phishing emails often try to rush you", side: 1 },
      { t: "Private browsing hides your activity from your employer", side: 0 },
      { t: "Reporting a near-miss helps prevent accidents", side: 1 },
      { t: "It's fine to reuse your work password at home", side: 0 },
      { t: "Locking your screen takes one key press", side: 1 },
    ],
  },
  {
    ...base("sh-bk", "Data Privacy", "Sort each document by how sensitive it is", "Label documents so everyone knows how to share them."),
    type: "bucket",
    buckets: ["Public", "Internal", "Confidential"],
    things: [
      { t: "Press release", b: 0 },
      { t: "Team lunch menu", b: 1 },
      { t: "Salary list", b: 2 },
      { t: "Product brochure", b: 0 },
      { t: "Org chart", b: 1 },
      { t: "Customer contracts", b: 2 },
    ],
  },
  {
    ...base("sh-st", "Customer Service", "The new joiner", "Small acts of help in someone's first week build a team people want to stay in."),
    type: "story",
    story: {
      intro: "Tuesday morning. Maya joined the team yesterday — and she looks a little lost at her desk.",
      scenes: [
        scene("colleague", "Maya", "Sorry to bother you… I can't work out how to log in to the CRM.", [
          ["No bother — let me show you, then I'll send you the guide.", "Maya is logged in within five minutes, and smiles for the first time today.", 2],
          ["Check your onboarding email, it's in there somewhere.", "Maya scrolls for ages, but finds it eventually.", 1],
          ["Ask IT, I'm swamped.", "Maya waits two hours for a reply to her ticket.", 0],
        ]),
        scene("manager", "Sam", "Could you take Maya along to the team meeting?", [
          ["Sure — I'll introduce her and say what she'll be working on.", "The team gives Maya a warm welcome.", 2],
          ["I'll tell her which room it's in.", "Maya slips in late and sits at the back.", 1],
          ["It's on the calendar, she'll find it.", "Maya misses the first ten minutes looking for the room.", 0],
        ]),
        scene("narrator", "", "In the meeting, someone asks Maya a question she can't answer yet.", [
          ["Step in: “Maya started yesterday — I'll loop her in after.”", "The room nods; Maya mouths “thank you”.", 2],
          ["Stay quiet — she'll work it out.", "Maya goes red, but manages an answer.", 1],
          ["Joke that new people never know anything.", "A few laugh. Maya doesn't.", 0],
        ]),
      ],
      endings: ["", "", ""],
    },
  },
];

/** A demo daily quiz with one of each new type. */
export function showcaseQuiz(industry: "bank" | "any", gid: string, extra: Partial<Game>): { g: Game; k: AnswerKey } {
  const now = Date.now();
  const sealed = (industry === "bank" ? BANK : GENERAL).map((d) => sealQuestion(d));
  const g: Game = {
    id: gid, kind: "sprint", title: "New: swipe, sort & a story", desc: "Try the newest question types.", minutes: 4, color: "blue", status: "live",
    questions: sealed.map((s) => s.q), createdAt: now, updatedAt: now, ...extra,
  };
  return { g, k: { gid, answers: Object.fromEntries(sealed.map((s) => [s.q.id, s.canon])), updatedAt: now } };
}
