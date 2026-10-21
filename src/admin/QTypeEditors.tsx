/* Editors for the newer question types: swipe sort, buckets and case studies (QEditor in Quizzes.tsx). */
import { blankScene, LIMITS, SWIPE_PRESETS, WHO, type DraftQ, type DraftScene } from "../lib/answers";
import type { StoryWho } from "../types";

type Props = { q: DraftQ; i: number; setQ: (i: number, p: Partial<DraftQ>) => void };
const QUAL: [0 | 1 | 2, string][] = [[2, "Best"], [1, "Okay"], [0, "Poor"]];
const ENDING_HINT: [string, string][] = [
  ["🏆 Star employee", "Every call was the best one."],
  ["🙂 Good save", "You got there — a couple of choices could have been better."],
  ["📘 Lesson learned", "A tough one. See below what would have worked better."],
];
const BUCKET_C = ["c-lime", "c-blue", "c-pink"];

/** Swipe sort: two sides and 4–12 cards, each belonging to one side. */
export function SwipeEdit({ q, i, setQ }: Props) {
  const sides = q.sides || ["Risky", "Safe"];
  const cards = q.cards || [];
  const setCards = (c: typeof cards) => setQ(i, { cards: c });
  return (
    <>
      <div className="field">
        <span className="flabel">The two sides — players swipe left or right</span>
        <div className="optrow qe-sides">
          <span className="qe-arrow">←</span>
          <input className="inp" value={sides[0]} maxLength={40} aria-label="Left side" placeholder="Left, e.g. Risky" onChange={(e) => setQ(i, { sides: [e.target.value, sides[1]] })} />
          <input className="inp" value={sides[1]} maxLength={40} aria-label="Right side" placeholder="Right, e.g. Safe" onChange={(e) => setQ(i, { sides: [sides[0], e.target.value] })} />
          <span className="qe-arrow">→</span>
        </div>
        <div className="qe-presets">
          {SWIPE_PRESETS.map(([l, r]) => (
            <button key={l + r} type="button" className={`chip-tg ${sides[0] === l && sides[1] === r ? "on" : ""}`} onClick={() => setQ(i, { sides: [l, r] })}>
              {l} / {r}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="flabel">
          Cards ({cards.length}) — tap the side each one belongs on. Players get them shuffled.
        </span>
        {cards.map((c, k) => (
          <div className="optrow" key={k}>
            <input className="inp" value={c.t} maxLength={140} placeholder={`Card ${k + 1}`} aria-label={`Card ${k + 1}`} onChange={(e) => setCards(cards.map((x, j) => (j === k ? { ...x, t: e.target.value } : x)))} />
            <div className="qe-pick" role="radiogroup" aria-label={`Side for card ${k + 1}`}>
              {([0, 1] as const).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={c.side === s} className={c.side === s ? `on s${s}` : ""} onClick={() => setCards(cards.map((x, j) => (j === k ? { ...x, side: s } : x)))}>
                  {s === 0 ? "← " : ""}
                  {sides[s] || (s ? "Right" : "Left")}
                  {s === 1 ? " →" : ""}
                </button>
              ))}
            </div>
            {cards.length > LIMITS.cards[0] && (
              <button type="button" className="x" aria-label={`Remove card ${k + 1}`} onClick={() => setCards(cards.filter((_, j) => j !== k))}>
                ✕
              </button>
            )}
          </div>
        ))}
        {cards.length < LIMITS.cards[1] && (
          <button type="button" className="link" style={{ justifySelf: "start" }} onClick={() => setCards([...cards, { t: "", side: (cards.length % 2) as 0 | 1 }])}>
            + Add card
          </button>
        )}
      </div>
    </>
  );
}

/** Buckets: 2–3 named buckets and 3–12 items, each with its right bucket. */
export function BucketEdit({ q, i, setQ }: Props) {
  const buckets = q.buckets || [];
  const things = q.things || [];
  const setThings = (t: typeof things) => setQ(i, { things: t });
  return (
    <>
      <div className="field">
        <span className="flabel">Buckets (2–3)</span>
        {buckets.map((b, k) => (
          <div className="optrow" key={k}>
            <span className={`qe-dot ${BUCKET_C[k]}`}>{"ABC"[k]}</span>
            <input className="inp" value={b} maxLength={40} placeholder={["e.g. Public", "e.g. Internal", "e.g. Confidential"][k]} aria-label={`Bucket ${"ABC"[k]}`} onChange={(e) => setQ(i, { buckets: buckets.map((x, j) => (j === k ? e.target.value : x)) })} />
            {buckets.length > LIMITS.buckets[0] && (
              <button
                type="button"
                className="x"
                aria-label={`Remove bucket ${"ABC"[k]}`}
                onClick={() => setQ(i, { buckets: buckets.filter((_, j) => j !== k), things: things.map((t) => ({ ...t, b: t.b === k ? 0 : t.b > k ? t.b - 1 : t.b })) })}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {buckets.length < LIMITS.buckets[1] && (
          <button type="button" className="link" style={{ justifySelf: "start" }} onClick={() => setQ(i, { buckets: [...buckets, ""] })}>
            + Add a third bucket
          </button>
        )}
      </div>
      <div className="field">
        <span className="flabel">Items ({things.length}) — pick the bucket each one belongs in. Players get them shuffled.</span>
        {things.map((t, k) => (
          <div className="optrow" key={k}>
            <input className="inp" value={t.t} maxLength={100} placeholder={`Item ${k + 1}`} aria-label={`Item ${k + 1}`} onChange={(e) => setThings(things.map((x, j) => (j === k ? { ...x, t: e.target.value } : x)))} />
            <div className="qe-pick" role="radiogroup" aria-label={`Bucket for item ${k + 1}`}>
              {buckets.map((b, bi) => (
                <button key={bi} type="button" role="radio" aria-checked={t.b === bi} className={t.b === bi ? `on ${BUCKET_C[bi]}` : ""} title={b} onClick={() => setThings(things.map((x, j) => (j === k ? { ...x, b: bi } : x)))}>
                  {b.trim() || "ABC"[bi]}
                </button>
              ))}
            </div>
            {things.length > LIMITS.things[0] && (
              <button type="button" className="x" aria-label={`Remove item ${k + 1}`} onClick={() => setThings(things.filter((_, j) => j !== k))}>
                ✕
              </button>
            )}
          </div>
        ))}
        {things.length < LIMITS.things[1] && (
          <button type="button" className="link" style={{ justifySelf: "start" }} onClick={() => setThings([...things, { t: "", b: things.length % Math.max(1, buckets.length) }])}>
            + Add item
          </button>
        )}
      </div>
    </>
  );
}

/** Case study: an intro, 2–5 scenes, each with 2–3 replies rated Best / Okay / Poor, and optional endings. */
export function StoryEdit({ q, i, setQ }: Props) {
  const s = q.story || { intro: "", scenes: [], endings: ["", "", ""] as [string, string, string] };
  const put = (p: Partial<typeof s>) => setQ(i, { story: { ...s, ...p } });
  const setScene = (k: number, p: Partial<DraftScene>) => put({ scenes: s.scenes.map((x, j) => (j === k ? { ...x, ...p } : x)) });
  const moveScene = (k: number, dir: -1 | 1) => {
    const j = k + dir;
    if (j < 0 || j >= s.scenes.length) return;
    const sc = s.scenes.slice();
    [sc[k], sc[j]] = [sc[j], sc[k]];
    put({ scenes: sc });
  };
  return (
    <>
      <div className="field">
        <label htmlFor={`q${i}in`}>Opening — set the scene (where, when, who)</label>
        <textarea className="inp" id={`q${i}in`} rows={2} maxLength={400} value={s.intro} placeholder="Monday, 9:05 am. The branch has just opened. A customer hurries to your counter…" onChange={(e) => put({ intro: e.target.value })} />
      </div>
      {s.scenes.map((c, k) => {
        const named = c.who !== "narrator";
        return (
          <div className="qe-scene" key={k}>
            <div className="qed-h">
              <span className="ttl">Scene {k + 1}</span>
              <button type="button" className="x" aria-label={`Move scene ${k + 1} up`} disabled={k === 0} onClick={() => moveScene(k, -1)}>↑</button>
              <button type="button" className="x" aria-label={`Move scene ${k + 1} down`} disabled={k === s.scenes.length - 1} onClick={() => moveScene(k, 1)}>↓</button>
              {s.scenes.length > LIMITS.scenes[0] && (
                <button type="button" className="x" aria-label={`Delete scene ${k + 1}`} onClick={() => put({ scenes: s.scenes.filter((_, j) => j !== k) })}>
                  ✕
                </button>
              )}
            </div>
            <div className="row2">
              <div className="field">
                <label htmlFor={`q${i}s${k}w`}>Who speaks</label>
                <select className="inp" id={`q${i}s${k}w`} value={c.who} onChange={(e) => setScene(k, { who: e.target.value as StoryWho })}>
                  {(Object.keys(WHO) as StoryWho[]).map((w) => (
                    <option key={w} value={w}>
                      {WHO[w].label}
                      {w === "narrator" ? " (no character)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              {named && (
                <div className="field">
                  <label htmlFor={`q${i}s${k}n`}>Their name (optional)</label>
                  <input className="inp" id={`q${i}s${k}n`} value={c.name} maxLength={30} placeholder={c.who === "manager" ? "e.g. Ms. Perera" : c.who === "colleague" ? "e.g. Maya" : "e.g. Nimal"} onChange={(e) => setScene(k, { name: e.target.value })} />
                </div>
              )}
            </div>
            <div className="field">
              <label htmlFor={`q${i}s${k}t`}>{named ? "What they say" : "What happens"}</label>
              <textarea className="inp" id={`q${i}s${k}t`} rows={2} maxLength={300} value={c.say} onChange={(e) => setScene(k, { say: e.target.value })} placeholder={named ? "My card got blocked and I fly in two hours!" : "The system shows three wrong PIN tries last night."} />
            </div>
            <div className="field">
              <span className="flabel">Your replies — rate each one. The best reply scores full marks.</span>
              {c.choices.map((x, r) => (
                <div className="qe-reply" key={r}>
                  <div className="qe-pick qual" role="radiogroup" aria-label={`Rating for reply ${r + 1}`}>
                    {QUAL.map(([v, l]) => (
                      <button key={v} type="button" role="radio" aria-checked={x.q === v} className={x.q === v ? `on q${v}` : ""} onClick={() => setScene(k, { choices: c.choices.map((y, j) => (j === r ? { ...y, q: v } : y)) })}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <input className="inp" value={x.t} maxLength={160} placeholder={`Reply ${"ABC"[r]} — what you say or do`} aria-label={`Scene ${k + 1} reply ${"ABC"[r]}`} onChange={(e) => setScene(k, { choices: c.choices.map((y, j) => (j === r ? { ...y, t: e.target.value } : y)) })} />
                  <input className="inp" value={x.then} maxLength={200} placeholder="…and what happens next" aria-label={`Scene ${k + 1} reply ${"ABC"[r]} outcome`} onChange={(e) => setScene(k, { choices: c.choices.map((y, j) => (j === r ? { ...y, then: e.target.value } : y)) })} />
                  {c.choices.length > LIMITS.replies[0] && (
                    <button type="button" className="x" aria-label={`Remove reply ${"ABC"[r]}`} onClick={() => setScene(k, { choices: c.choices.filter((_, j) => j !== r) })}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {c.choices.length < LIMITS.replies[1] && (
                <button type="button" className="link" style={{ justifySelf: "start" }} onClick={() => setScene(k, { choices: [...c.choices, { t: "", then: "", q: 0 }] })}>
                  + Add reply
                </button>
              )}
            </div>
          </div>
        );
      })}
      {s.scenes.length < LIMITS.scenes[1] && (
        <button type="button" className="btn ghost small" style={{ justifySelf: "start" }} onClick={() => put({ scenes: [...s.scenes, blankScene(s.scenes[s.scenes.length - 1]?.who || "customer")] })}>
          + Add scene
        </button>
      )}
      <details className="qe-endings">
        <summary>Endings (optional) — replace the default text players see at the end</summary>
        {ENDING_HINT.map(([h, ph], k) => (
          <div className="field" key={k}>
            <label htmlFor={`q${i}e${k}`}>{h}</label>
            <input className="inp" id={`q${i}e${k}`} value={s.endings[k]} maxLength={200} placeholder={ph} onChange={(e) => put({ endings: s.endings.map((x, j) => (j === k ? e.target.value : x)) as [string, string, string] })} />
          </div>
        ))}
      </details>
    </>
  );
}
