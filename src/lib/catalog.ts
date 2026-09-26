/* Avatar store catalog. Prices are in coins (cosmetic only — no cash value). */
export type Slot = "face" | "head" | "ears" | "bg" | "power";

export interface Item {
  id: string;
  slot: Slot;
  name: string;
  price: number;
  minLevel?: number;
  blurb?: string;
  max?: number; // how many you can hold (power-ups)
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
  { id: "bg-sunset", slot: "bg", name: "Sunset", price: 100 },
  { id: "bg-bubble", slot: "bg", name: "Bubblegum", price: 100 },
  { id: "bg-ocean", slot: "bg", name: "Ocean", price: 100 },
  { id: "bg-mint", slot: "bg", name: "Mint", price: 100 },
  { id: "bg-galaxy", slot: "bg", name: "Galaxy", price: 350, minLevel: 5, blurb: "Level 5 and up." },
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
