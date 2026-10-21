/* Starter library: ready-made quiz sets copied into new companies (and on demand by company admins). */
import { useEffect, useMemo, useState } from "react";
import type { LibraryItem, Question, QType } from "../types";
import { useApi, errMsg } from "../app/ApiCtx";
import { Modal, Seg } from "../components/ui";
import { TYPE_NAME, choiceText, draftProblem, sealQuestion, unseal, type DraftQ } from "../lib/answers";
import { cleanText } from "../lib/security";
import { randHex } from "../lib/util";
import { SI, useSuper } from "./shared";

type Ind = LibraryItem["industry"];

export function Library() {
  const { api, toast } = useApi();
  const { recheck } = useSuper();
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [f, setF] = useState<"all" | Ind>("all");
  const [open, setOpen] = useState<LibraryItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [del, setDel] = useState<LibraryItem | null>(null);

  const load = () => api.library().then(setItems, (e) => toast(errMsg(e)));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const saveAll = async (next: LibraryItem[], ok: string) => {
    try {
      await api.superSaveLibrary(next);
      setItems(next);
      toast(ok);
      return true;
    } catch (e) {
      toast(errMsg(e));
      if ((e as { code?: string }).code === "forbidden") recheck();
      return false;
    }
  };

  const list = useMemo(() => (items || []).filter((x) => f === "all" || x.industry === f), [items, f]);
  const totalQ = (items || []).reduce((a, x) => a + x.questions.length, 0);

  return (
    <>
      <div className="toolbar">
        <h1>Starter library</h1>
        <button className="btn lime small" onClick={() => setAdding(true)}>
          <SI.plus /> Add a set
        </button>
      </div>
      <p className="fine su-intro">
        Ready-made quiz sets. New companies can start with them as drafts (sets marked <b>Any</b> go to every company; <b>Bank</b> sets only to bank-template companies). Company admins can also copy them later. {items && <>{items.length} sets · {totalQ} questions.</>}
      </p>
      <Seg className="narrow" value={f} onChange={setF} label="Industry" options={[["all", "All"], ["any", "Any company"], ["bank", "Banks"]]} />
      {items === null ? (
        <p className="fine">Loading…</p>
      ) : !list.length ? (
        <div className="empty">No sets here yet.</div>
      ) : (
        <div className="gcards">
          {list.map((it) => (
            <article key={it.id} className="gcard su-lcard">
              <div className={`top ${it.industry}`}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className={`su-ind ${it.industry}`}>{it.industry === "bank" ? "Bank" : "Any"}</span>
                  <span className="fine">{it.questions.length} questions</span>
                </div>
                <h3>{it.title}</h3>
                <span className="fine">{it.topic}</span>
              </div>
              <div className="body">
                <div className="chips-row">
                  {typeMix(it.questions).map(([t, n]) => (
                    <span key={t} className="chip">{n} × {TYPE_NAME[t]}</span>
                  ))}
                </div>
                <div className="acts">
                  <button className="btn tiny primary" onClick={() => setOpen(it)}>View & edit</button>
                  <button className="btn tiny white" onClick={() => api.download(`${it.id}.json`, JSON.stringify(it, null, 1), "application/json")}>
                    JSON
                  </button>
                  <button className="btn tiny white su-del" aria-label={`Delete ${it.title}`} onClick={() => setDel(it)}>
                    <SI.trash />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {open && items && (
        <EditSet
          item={open}
          onClose={() => setOpen(null)}
          onSave={async (x) => {
            if (await saveAll(items.map((y) => (y.id === x.id ? x : y)), "Library saved")) setOpen(null);
          }}
        />
      )}
      {adding && items && (
        <AddSet
          existing={items}
          onClose={() => setAdding(false)}
          onAdd={async (xs) => {
            if (await saveAll([...items, ...xs], xs.length === 1 ? `Added “${xs[0].title}”` : `Added ${xs.length} sets`)) setAdding(false);
          }}
        />
      )}
      {del && items && (
        <Modal label="Delete set" onClose={() => setDel(null)}>
          <h3>Delete “{del.title}”?</h3>
          <p>It's removed from the starter library. Companies that already copied it keep their quizzes.</p>
          <div className="row end">
            <button className="btn ghost small" onClick={() => setDel(null)}>Cancel</button>
            <button
              className="btn small su-btn-danger"
              onClick={async () => {
                if (await saveAll(items.filter((x) => x.id !== del.id), "Set deleted")) setDel(null);
              }}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function typeMix(qs: Question[]): [QType, number][] {
  const m = new Map<QType, number>();
  qs.forEach((q) => m.set(q.type, (m.get(q.type) || 0) + 1));
  return [...m.entries()];
}

/* ---------- view & edit ---------- */
function EditSet({ item, onClose, onSave }: { item: LibraryItem; onClose: () => void; onSave: (x: LibraryItem) => void }) {
  const [title, setTitle] = useState(item.title);
  const [topic, setTopic] = useState(item.topic);
  const [ind, setInd] = useState<Ind>(item.industry);
  const [qs, setQs] = useState(item.questions);
  const ok = title.trim().length >= 3 && topic.trim().length >= 2 && qs.length > 0;
  const dirty = title !== item.title || topic !== item.topic || ind !== item.industry || qs.length !== item.questions.length;
  return (
    <Modal label={`Edit ${item.title}`} onClose={onClose} wide>
      <h3>Edit set</h3>
      <div className="row2">
        <div className="field">
          <label htmlFor="ls-title">Title</label>
          <input className="inp" id="ls-title" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ls-topic">Topic</label>
          <input className="inp" id="ls-topic" value={topic} maxLength={40} onChange={(e) => setTopic(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <span className="flabel">Who gets it</span>
        <Seg value={ind} onChange={setInd} label="Industry" options={[["any", "Any company"], ["bank", "Banks only"]]} />
      </div>
      <div className="su-qs">
        <span className="label">{qs.length} questions · answers shown to super admins only</span>
        {qs.map((q, i) => (
          <div key={q.id} className="su-q">
            <span className="su-q-n">{i + 1}</span>
            <div>
              <b>{q.q}</b>
              <span className="fine">
                {TYPE_NAME[q.type]} · {q.topic}
              </span>
              <span className="su-q-a">✓ {choiceText(q, item.answers[q.id])}</span>
            </div>
            <button className="x" aria-label={`Remove question ${i + 1}`} title="Remove question" disabled={qs.length < 2} onClick={() => setQs(qs.filter((x) => x.id !== q.id))}>
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="row end">
        <button className="btn ghost small" onClick={onClose}>Cancel</button>
        <button
          className="btn primary small"
          disabled={!ok || !dirty}
          onClick={() => {
            const answers: Record<string, string> = {};
            qs.forEach((q) => (answers[q.id] = item.answers[q.id]));
            onSave({ ...item, title: cleanText(title.trim(), 60), topic: cleanText(topic.trim(), 40), industry: ind, questions: qs, answers });
          }}
        >
          Save changes
        </button>
      </div>
    </Modal>
  );
}

/* ---------- add: paste JSON or CSV ---------- */
const CSV_EXAMPLE = `type,topic,question,options,answer,explain
mcq,Cyber Security,Which password is strongest?,Summer2024|P@ssword|correct-horse-battery-staple|12345678,3,Long passphrases beat short complex ones.
tf,Cyber Security,It's fine to share your one-time code with IT support over the phone.,,F,Real IT staff never ask for your code.
match,Cyber Security,Match each threat to what it is,Phishing=Fake message that asks for secrets|Malware=Harmful software|Tailgating=Following someone through a secure door,,
order,Cyber Security,Put these steps in order when you spot a phishing email,Don't click anything|Report it|Delete it,,`;

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const TYPE_ALIAS: Record<string, QType> = { mcq: "mcq", multiple: "mcq", "multiple choice": "mcq", choice: "mcq", tf: "tf", "true/false": "tf", truefalse: "tf", boolean: "tf", match: "match", pairs: "match", order: "order", sequence: "order" };

/** CSV rows → sealed questions + answer key, or a list of problems. */
export function csvToSet(text: string, setTopic: string): { questions: Question[]; answers: Record<string, string>; errors: string[] } {
  const rows = parseCSV(text);
  const errors: string[] = [];
  const questions: Question[] = [];
  const answers: Record<string, string> = {};
  if (rows.length && rows[0][0]?.trim().toLowerCase() === "type") rows.shift();
  if (!rows.length) errors.push("Paste at least one question row.");
  const pre = "q" + randHex(2);
  rows.forEach((r, i) => {
    const n = i + 1;
    const [typeRaw = "", topicRaw = "", qRaw = "", optRaw = "", ansRaw = "", expRaw = ""] = r.map((x) => x.trim());
    const type = TYPE_ALIAS[typeRaw.toLowerCase()];
    if (!type) return errors.push(`Row ${n}: type must be mcq, tf, match or order (got “${typeRaw || "empty"}”).`);
    const d: DraftQ = { id: `${pre}${n}`, type, topic: cleanText(topicRaw || setTopic, 40), q: cleanText(qRaw, 300), explain: cleanText(expRaw, 400), options: [], answer: 0, tf: true, pairs: [], steps: [] };
    const parts = optRaw ? optRaw.split("|").map((x) => cleanText(x.trim(), 160)) : [];
    if (type === "mcq") {
      d.options = parts;
      if (parts.length < 2 || parts.length > 6) return errors.push(`Row ${n}: multiple choice needs 2–6 options separated by |.`);
      const a = ansRaw.trim();
      let idx = -1;
      if (/^\d+$/.test(a)) idx = Number(a) - 1;
      else if (/^[A-Fa-f]$/.test(a)) idx = a.toUpperCase().charCodeAt(0) - 65;
      else idx = parts.findIndex((o) => o.toLowerCase() === a.toLowerCase());
      if (idx < 0 || idx >= parts.length) return errors.push(`Row ${n}: answer must be the option number (1–${parts.length}), letter, or the exact option text.`);
      d.answer = idx;
    } else if (type === "tf") {
      const a = ansRaw.toLowerCase();
      if (!["t", "true", "yes", "f", "false", "no"].includes(a)) return errors.push(`Row ${n}: true/false answer must be T or F.`);
      d.tf = ["t", "true", "yes"].includes(a);
    } else if (type === "match") {
      const pairs = parts.map((p) => p.split("=").map((x) => x.trim()));
      if (pairs.length < 2 || pairs.length > 6 || pairs.some((p) => p.length !== 2)) return errors.push(`Row ${n}: match needs 2–6 pairs like term=meaning|term=meaning.`);
      d.pairs = pairs as [string, string][];
    } else {
      if (parts.length < 2 || parts.length > 6) return errors.push(`Row ${n}: order needs 2–6 steps in the right order, separated by |.`);
      d.steps = parts;
    }
    const p = draftProblem(d, n);
    if (p) return errors.push(p.replace(/^Question/, "Row"));
    const s = sealQuestion(d);
    questions.push(s.q);
    answers[s.q.id] = s.canon;
  });
  return { questions, answers, errors };
}

/** JSON (one set or a list of sets, as exported with the JSON button) → checked sets. */
export function jsonToSets(text: string): { sets: LibraryItem[]; errors: string[] } {
  const errors: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { sets: [], errors: ["That isn't valid JSON."] };
  }
  const arr = Array.isArray(raw) ? raw : [raw];
  const sets: LibraryItem[] = [];
  arr.forEach((o, si) => {
    const at = arr.length > 1 ? `Set ${si + 1}` : "Set";
    const x = o as Partial<LibraryItem>;
    if (!x || typeof x !== "object") return errors.push(`${at}: not an object.`);
    if (typeof x.title !== "string" || x.title.trim().length < 3) return errors.push(`${at}: needs a "title".`);
    if (typeof x.topic !== "string" || !x.topic.trim()) return errors.push(`${at}: needs a "topic".`);
    if (x.industry && x.industry !== "any" && x.industry !== "bank") return errors.push(`${at}: "industry" must be "any" or "bank".`);
    if (!Array.isArray(x.questions) || !x.questions.length) return errors.push(`${at}: needs a "questions" list.`);
    const ans = (x.answers || {}) as Record<string, string>;
    const qs: Question[] = [];
    const out: Record<string, string> = {};
    const seen = new Set<string>();
    let bad = false;
    x.questions.forEach((q0, i) => {
      if (bad) return;
      const q = q0 as Question;
      const n = i + 1;
      if (!q || typeof q.q !== "string" || !["mcq", "tf", "match", "order", "swipe", "bucket", "story"].includes(q.type)) {
        bad = true;
        return errors.push(`${at}, question ${n}: needs "type" (mcq/tf/match/order/swipe/bucket/story) and "q".`);
      }
      const id = typeof q.id === "string" && q.id && !seen.has(q.id) ? q.id : `q${randHex(2)}${n}`;
      seen.add(id);
      const canon = ans[q.id];
      if (canon == null) {
        bad = true;
        return errors.push(`${at}, question ${n}: no answer in "answers" for id "${q.id}".`);
      }
      const d = unseal({ ...q, id, topic: q.topic || x.topic! }, String(canon));
      if (q.type === "mcq" && (!Array.isArray(q.options) || Number(canon) >= q.options.length || !/^\d+$/.test(String(canon)))) {
        bad = true;
        return errors.push(`${at}, question ${n}: answer must be an option index.`);
      }
      if (q.type === "tf" && canon !== "T" && canon !== "F") {
        bad = true;
        return errors.push(`${at}, question ${n}: true/false answer must be "T" or "F".`);
      }
      if ((q.type === "match" && (!Array.isArray(q.left) || !Array.isArray(q.right) || q.left.length !== q.right.length)) || (q.type === "order" && !Array.isArray(q.items))) {
        bad = true;
        return errors.push(`${at}, question ${n}: incomplete ${q.type} question.`);
      }
      if ((q.type === "swipe" || q.type === "bucket") && (!Array.isArray(q.options) || !Array.isArray(q.items) || String(canon).split(",").length !== q.items.length || String(canon).split(",").some((v) => !/^\d$/.test(v) || Number(v) >= q.options!.length))) {
        bad = true;
        return errors.push(`${at}, question ${n}: the answer needs one ${q.type === "swipe" ? "side (0 or 1)" : "bucket index"} per item.`);
      }
      if (q.type === "story" && (!q.story || !Array.isArray(q.story.steps) || String(canon).split(";").length !== q.story.steps.length || !/^[0-2](,[0-2])*(;[0-2](,[0-2])*)*$/.test(String(canon)))) {
        bad = true;
        return errors.push(`${at}, question ${n}: a case study's answer rates each reply 2 (best), 1 or 0, scenes split by ";".`);
      }
      const idx = String(canon).split(",").map(Number);
      const len = q.type === "match" ? q.right!.length : q.type === "order" ? q.items!.length : 0;
      if ((q.type === "match" || q.type === "order") && (idx.length !== len || new Set(idx).size !== len || idx.some((v) => !(v >= 0 && v < len)))) {
        bad = true;
        return errors.push(`${at}, question ${n}: the answer doesn't fit the ${q.type === "match" ? "pairs" : "steps"}.`);
      }
      d.q = cleanText(d.q, 300);
      d.explain = cleanText(d.explain, 400);
      const p = draftProblem(d, n);
      if (p) {
        bad = true;
        return errors.push(`${at}: ${p}`);
      }
      const s = sealQuestion(d, { ...q, id });
      qs.push(s.q);
      out[id] = s.canon;
    });
    if (bad) return;
    sets.push({ id: "", title: cleanText(x.title.trim(), 60), topic: cleanText(x.topic.trim(), 40), industry: x.industry === "bank" ? "bank" : "any", questions: qs, answers: out });
  });
  return { sets, errors };
}

function AddSet({ existing, onClose, onAdd }: { existing: LibraryItem[]; onClose: () => void; onAdd: (xs: LibraryItem[]) => void }) {
  const [fmt, setFmt] = useState<"csv" | "json">("csv");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [ind, setInd] = useState<Ind>("any");

  const res = useMemo(() => {
    if (!text.trim()) return null;
    if (fmt === "csv") {
      const r = csvToSet(text, topic.trim() || "General");
      const errors = [...r.errors];
      if (title.trim().length < 3) errors.unshift("Give the set a title (3+ characters).");
      if (!topic.trim()) errors.unshift("Give the set a topic.");
      return { sets: r.questions.length ? [{ id: "", title: cleanText(title.trim(), 60), topic: cleanText(topic.trim(), 40), industry: ind, questions: r.questions, answers: r.answers }] : [], errors };
    }
    return jsonToSets(text);
  }, [fmt, text, title, topic, ind]);

  const ids = new Set(existing.map((x) => x.id));
  const add = () => {
    if (!res || res.errors.length || !res.sets.length) return;
    onAdd(
      res.sets.map((s) => {
        let id = "lib-" + randHex(4);
        while (ids.has(id)) id = "lib-" + randHex(4);
        ids.add(id);
        return { ...s, id };
      }),
    );
  };
  const nQ = res?.sets.reduce((a, s) => a + s.questions.length, 0) || 0;

  return (
    <Modal label="Add a set" onClose={onClose} wide>
      <h3>Add a set</h3>
      <Seg value={fmt} onChange={setFmt} label="Format" options={[["csv", "Simple CSV"], ["json", "JSON"]]} />
      {fmt === "csv" ? (
        <>
          <div className="row2">
            <div className="field">
              <label htmlFor="as-title">Title</label>
              <input className="inp" id="as-title" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Fraud Awareness" />
            </div>
            <div className="field">
              <label htmlFor="as-topic">Topic</label>
              <input className="inp" id="as-topic" value={topic} maxLength={40} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Cyber Security" />
            </div>
          </div>
          <Seg value={ind} onChange={setInd} label="Industry" options={[["any", "Any company"], ["bank", "Banks only"]]} />
          <p className="fine">
            One question per row: <code>type,topic,question,options,answer,explain</code>. Options are separated by <code>|</code>. <b>mcq</b>: answer is the option number, letter or text. <b>tf</b>: T or F. <b>match</b>: options as <code>term=meaning|…</code>. <b>order</b>: steps in the right order (they're shuffled for players). Quote cells that contain commas.
          </p>
        </>
      ) : (
        <p className="fine">
          Paste one set or a list of sets in the same shape as the <b>JSON</b> download: <code>{`{ "title", "topic", "industry": "any"|"bank", "questions": [...], "answers": { id: answer } }`}</code>.
        </p>
      )}
      <div className="field">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <label htmlFor="as-text">{fmt === "csv" ? "CSV rows" : "JSON"}</label>
          {fmt === "csv" && (
            <button type="button" className="link" onClick={() => { setText(CSV_EXAMPLE); if (!title) setTitle("Cyber Quick Check"); if (!topic) setTopic("Cyber Security"); }}>
              Insert example
            </button>
          )}
        </div>
        <textarea className="inp su-mono" id="as-text" rows={9} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      </div>
      {res &&
        (res.errors.length ? (
          <div className="banner red su-errs" role="alert">
            <b>Fix {res.errors.length === 1 ? "this" : `these ${res.errors.length} problems`}:</b>
            <ul>
              {res.errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}
              {res.errors.length > 8 && <li>…and {res.errors.length - 8} more</li>}
            </ul>
          </div>
        ) : (
          <p className="banner su-okbanner">
            Looks good: {res.sets.length} set{res.sets.length === 1 ? "" : "s"}, {nQ} question{nQ === 1 ? "" : "s"} ({res.sets.map((s) => typeMix(s.questions).map(([t, n]) => `${n} ${TYPE_NAME[t].toLowerCase()}`).join(", ")).join(" · ")}).
          </p>
        ))}
      <div className="row end">
        <button className="btn ghost small" onClick={onClose}>Cancel</button>
        <button className="btn primary small" disabled={!res || !!res.errors.length || !res.sets.length} onClick={add}>
          Add to library
        </button>
      </div>
    </Modal>
  );
}
