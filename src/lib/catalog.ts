/* Avatar store catalog. Prices are in coins (cosmetic only — no cash value). */
export type Slot = "face" | "head" | "ears" | "bg" | "pet" | "ride" | "power";

export interface Item {
  id: string;
  slot: Slot;
  name: string;
  price: number;
  minLevel?: number;
  blurb?: string;
  max?: number; // how many you can hold (power-ups)
  retired?: boolean; // no longer sold (owners keep it)
}

export const ITEMS: Item[] = [
  { id: "specs", slot: "face", name: "Round Specs", price: 150, blurb: "Reads the fine print." },
  { id: "shades", slot: "face", name: "Sunset Shades", price: 250, blurb: "Too cool for phishing." },
  { id: "phones", slot: "head", name: "Neon Headphones", price: 400, blurb: "Focus mode: on." },
  { id: "cap", slot: "head", name: "Sprint Cap", price: 300, blurb: "Built for speed." },
  { id: "bow", slot: "head", name: "Big Bow", price: 220 },
  { id: "beanie", slot: "head", name: "Cosy Beanie", price: 260 },
  { id: "crown", slot: "head", name: "Legend Crown", price: 900, minLevel: 8, blurb: "Level 8 and up." },
  { id: "hearts", slot: "ears", name: "Heart Earrings", price: 200 },
  { id: "hoops", slot: "ears", name: "Gold Hoops", price: 180 },
  { id: "studs", slot: "ears", name: "Star Studs", price: 140 },
  { id: "bg-sunset", slot: "bg", retired: true, name: "Sunset", price: 100 },
  { id: "bg-bubble", slot: "bg", retired: true, name: "Bubblegum", price: 100 },
  { id: "bg-ocean", slot: "bg", retired: true, name: "Ocean", price: 100 },
  { id: "bg-mint", slot: "bg", retired: true, name: "Mint", price: 100 },
  { id: "bg-galaxy", slot: "bg", retired: true, name: "Galaxy", price: 350, minLevel: 5, blurb: "Level 5 and up." },
  { id: "pet-cat", slot: "pet", name: "Mochi the cat", price: 250, blurb: "Naps on every stop you finish." },
  { id: "pet-bunny", slot: "pet", name: "Pip the bunny", price: 250, blurb: "Hops along beside you." },
  { id: "pet-corgi", slot: "pet", name: "Biscuit the corgi", price: 320, blurb: "Never misses a streak." },
  { id: "pet-panda", slot: "pet", name: "Bao the panda", price: 380, blurb: "Brings snacks." },
  { id: "pet-owl", slot: "pet", name: "Professor Owl", price: 450, minLevel: 4, blurb: "Level 4 and up. Knows every answer." },
  { id: "pet-dragon", slot: "pet", name: "Ember the dragon", price: 900, minLevel: 8, blurb: "Level 8 and up. Legendary." },
  { id: "ride-skate", slot: "ride", name: "Skateboard", price: 200, blurb: "Roll to your next stop." },
  { id: "ride-scooter", slot: "ride", name: "Kick scooter", price: 280 },
  { id: "ride-bike", slot: "ride", name: "City bicycle", price: 350, blurb: "Green all the way." },
  { id: "ride-tuktuk", slot: "ride", name: "Tuk-tuk", price: 500, minLevel: 3, blurb: "Level 3 and up. Room for the team." },
  { id: "ride-hover", slot: "ride", name: "Hoverboard", price: 800, minLevel: 6, blurb: "Level 6 and up. From the future." },
  { id: "shield", slot: "power", name: "Streak Shield", price: 120, max: 2, blurb: "Covers one missed day so your streak survives." },
];

export const ITEM = Object.fromEntries(ITEMS.map((i) => [i.id, i])) as Record<string, Item>;

export const BG_FILL: Record<string, [string, string]> = {
  "bg-sunset": ["#FF8A3D", "#FF5A1F"],
  "bg-bubble": ["#FFB3D4", "#FF7EB6"],
  "bg-ocean": ["#7FB0FF", "#3D7BFF"],
  "bg-mint": ["#B9F5D0", "#5FD39A"],
  "bg-galaxy": ["#3B2A7A", "#141414"],
};
