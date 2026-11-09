/* Wording for Hall of Fame awards. Weekly and monthly top players share the "weekly" kind, so the
   period's own text decides: "Week of 14 Sep" is a week, "October 2026" is a month. */
import type { Gift } from "../types";

export const periodWord = (g: Pick<Gift, "period">): "week" | "month" => (/^week/i.test(g.period.trim()) ? "week" : "month");
const rankOf = (g: Gift) => Number(/#(\d+)/.exec(g.label)?.[1] || 1);
const TITLE: Record<Gift["kind"], string> = { weekly: "Champion", improved: "Most improved", branch: "Team champion" };

/** Big title on the award card: "Champion of the month", "#3 of the week"… */
export function awardTitle(g: Gift) {
  if (g.kind !== "weekly") return TITLE[g.kind];
  const r = rankOf(g), w = periodWord(g);
  return r === 1 ? `Champion of the ${w}` : `#${r} of the ${w}`;
}
/** Short title for small tiles: "Champion", "#2 this month"… */
export function awardShort(g: Gift) {
  if (g.kind !== "weekly") return TITLE[g.kind];
  const r = rankOf(g);
  return r === 1 ? "Champion" : `#${r} this ${periodWord(g)}`;
}
