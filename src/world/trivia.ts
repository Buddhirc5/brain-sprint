/* Knowledge bubbles: light, company-neutral trivia for the break-room game.
   Nothing is scored on the server or stored in the database — it's for fun. */
export interface Trivia {
  q: string;
  options: string[];
  a: number; // index of the right option
  why: string;
}

export const TRIVIA: Trivia[] = [
  { q: "What makes a password strongest?", options: ["Your pet's name + 1", "A long passphrase of random words", "The same one everywhere", "Only numbers"], a: 1, why: "Length beats complexity: four random words are far harder to crack than P@ssw0rd." },
  { q: "An email says your account is locked — click within 1 hour! This is most likely…", options: ["An urgent IT update", "Phishing", "A calendar invite", "Spam filter test"], a: 1, why: "Urgency plus a link is the classic phishing recipe. Check the sender and go to the site yourself." },
  { q: "What does MFA add to your sign-in?", options: ["A second proof it's really you", "A faster login", "A longer password", "A new username"], a: 0, why: "Multi-factor authentication asks for something you have (like a phone) as well as something you know." },
  { q: "Before leaving your desk, you should…", options: ["Turn off the monitor", "Lock your screen", "Close your email", "Nothing, it's fine"], a: 1, why: "Win + L (Windows) or Ctrl + Cmd + Q (Mac) locks your screen in one move." },
  { q: "The 20-20-20 rule helps your…", options: ["Posture", "Eyes", "Sleep", "Budget"], a: 1, why: "Every 20 minutes, look at something 20 feet away for 20 seconds to rest your eyes." },
  { q: "Which is the largest ocean on Earth?", options: ["Atlantic", "Indian", "Pacific", "Arctic"], a: 2, why: "The Pacific covers about a third of the planet's surface." },
  { q: "How many minutes is a typical Brain Sprint?", options: ["About 2", "About 20", "About 45", "A full hour"], a: 0, why: "Little and often: two minutes a day beats an hour once a year." },
  { q: "What is 'tailgating' in office security?", options: ["Parking too close", "Following someone through a secure door", "Replying-all to email", "Sharing a lunch"], a: 1, why: "Always let secure doors close behind you — politely ask visitors to badge in." },
  { q: "Which planet is known as the Red Planet?", options: ["Venus", "Jupiter", "Mars", "Mercury"], a: 2, why: "Iron oxide (rust) on the surface gives Mars its colour." },
  { q: "A USB stick found in the car park should be…", options: ["Plugged in to find the owner", "Handed to IT / security", "Kept as a spare", "Thrown away"], a: 1, why: "Dropped USB sticks are a known attack trick. Let security handle it." },
  { q: "What's the best way to remember something you learned?", options: ["Read it once, carefully", "Recall it a few times over several days", "Highlight everything", "Listen to it at 2x speed"], a: 1, why: "Spaced retrieval practice — exactly what daily quizzes do — makes memories stick." },
  { q: "How many continents are there?", options: ["5", "6", "7", "8"], a: 2, why: "Africa, Antarctica, Asia, Australia/Oceania, Europe, North America and South America." },
  { q: "Which is personal data?", options: ["A company's logo", "An employee's home address", "Today's weather", "A product price"], a: 1, why: "Anything that identifies a person — name, address, ID number — is personal data and must be protected." },
  { q: "A good meeting usually has…", options: ["No agenda", "A clear goal and agenda", "Everyone on mute forever", "At least 20 people"], a: 1, why: "A clear purpose and agenda keeps meetings short and useful." },
  { q: "Which animal is the fastest on land?", options: ["Lion", "Cheetah", "Horse", "Greyhound"], a: 1, why: "Cheetahs can sprint at around 100 km/h for short bursts." },
  { q: "What should you do with a suspicious email?", options: ["Forward it to colleagues", "Report it using your company's process", "Reply and ask who they are", "Click to check"], a: 1, why: "Reporting helps security block it for everyone." },
  { q: "Water boils at sea level at…", options: ["90 °C", "100 °C", "110 °C", "120 °C"], a: 1, why: "100 °C (212 °F) at standard atmospheric pressure." },
  { q: "The best time to give feedback is…", options: ["At the yearly review", "Soon after it happens", "Never", "Only by email"], a: 1, why: "Timely, specific feedback is the easiest to act on." },
  { q: "Which of these is a renewable energy source?", options: ["Coal", "Natural gas", "Wind", "Diesel"], a: 2, why: "Wind, solar and hydro are renewable — they won't run out." },
  { q: "Public Wi-Fi at a café is…", options: ["Always private", "Fine for anything", "Best avoided for sensitive work without a VPN", "Faster than office Wi-Fi"], a: 2, why: "Open networks can be snooped on. Use your company VPN or your phone's hotspot." },
  { q: "How many bones are in the adult human body?", options: ["106", "206", "306", "406"], a: 1, why: "Babies start with about 270; some fuse as we grow, leaving 206." },
  { q: "A short walk after lunch mostly helps…", options: ["Focus and energy", "Your inbox", "Nothing at all", "Wi-Fi speed"], a: 0, why: "Light movement boosts circulation and afternoon concentration." },
  { q: "What does 'CC' mean on an email?", options: ["Carbon copy", "Company content", "Confirmed contact", "Copy cancelled"], a: 0, why: "It's from the days of carbon paper — everyone in CC gets a copy for information." },
  { q: "The Great Wall is in…", options: ["Japan", "India", "China", "Mongolia only"], a: 2, why: "It stretches thousands of kilometres across northern China." },
];

/** A shuffled deck so each bubble in a session asks something different. */
export function deck(): Trivia[] {
  const d = TRIVIA.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
