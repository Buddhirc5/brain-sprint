import { useApp } from "../app/ctx";
import { Chibi, Sprinty } from "../components/Chibi";
import { Icon, Speech } from "../components/ui";
import { ITEM } from "../lib/catalog";
import { answerPoints, levelStart, levelTitle, RULES } from "../lib/scoring";

/* The user guide. Every number here comes from RULES / the catalog, so it can't drift from the real logic. */
export function Guide() {
  const { go, me, d, features: f, labels, pub } = useApp();
  const br = labels.branch.toLowerCase();
  const ex = { share: 30, a: 6, b: 15 };
  const p1 = answerPoints(true, ex.a * 1000, ex.share * 1000);
  const p2 = answerPoints(true, ex.b * 1000, ex.share * 1000);
  const all: [string, string, boolean][] = [
    ["sprint", "Daily sprint", f.sprint], ["points", "Points", f.sprint], ["coins", "Coins", f.coins], ["streaks", "Streaks", f.streaks], ["levels", "Levels", true],
    ["scorecard", "Scorecard", f.sprint], ["boards", "Leaderboards", true], ["rewards", "Rewards", f.rewards], ["cert", "Certification", f.cert],
    ["live", "Live quiz", f.live], ["polls", "Live polls", f.polls], ["fair", "Fair play & privacy", true],
  ];
  const toc = all.filter((x) => x[2]).map(([id, l]) => [id, l] as [string, string]);
  const num = (id: string) => toc.findIndex((x) => x[0] === id) + 1;
  const jump = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById("g-" + id)?.scrollIntoView({ behavior: "smooth" });
  };
  const Head = ({ n, title, color }: { n: number; title: string; color: string }) => (
    <div className="g-head">
      <span className="no" style={{ background: `var(--${color})`, color: color === "ink" || color === "orange" || color === "blue" ? "#fff" : "var(--ink)" }}>
        {n}
      </span>
      <h2>{title}</h2>
    </div>
  );

  return (
    <div className="phone guide">
      <div className="topbar">
        <button type="button" className="icon-btn" aria-label="Back" onClick={() => go({ v: me ? "lobby" : "welcome" })}>
          <Icon.back />
        </button>
        <span className="title">How it works</span>
        <span style={{ width: 44 }} />
      </div>

      <section className="g-hero">
        <div>
          <h1>
            How to
            <br />
            play
          </h1>
          <p>Everything about {pub.branding.productName}{f.coins ? " — points, coins and the leaderboard" : " — points and the leaderboard"} — in two minutes.</p>
        </div>
        <Sprinty mood="cheer" size={110} />
        <nav className="toc" aria-label="Guide sections">
          {toc.map(([id, l]) => (
            <a key={id} href={"#g-" + id} onClick={jump(id)}>
              {l}
            </a>
          ))}
        </nav>
      </section>

      {f.sprint && (
        <section className="g-sec" id="g-sprint">
        <Head n={num("sprint")} title="The daily sprint" color="lime" />
        <div className="g-talk">
          <Sprinty mood="happy" size={64} />
          <Speech tone="lime">New quizzes drop regularly — usually 1 to 5 questions. Each takes about a minute.</Speech>
        </div>
        <div className="rule-grid">
          <div className="rule paper"><b>1 try</b><span>Each quiz can be played once. Only your first try counts.</span></div>
          <div className="rule paper"><b>1 clock</b><span>One timer for the whole quiz. It pauses while you read each answer.</span></div>
          <div className="rule paper"><b>Instant</b><span>You see the right answer and a short "why" straight away.</span></div>
          <div className="rule paper"><b>No reset</b><span>Leaving or refreshing doesn't stop the clock on a question.</span></div>
        </div>
        <p>
          <b>Four kinds of question:</b> Pick one · True or false · Match the pairs · Put in order. Missed a day? Older quizzes stay open under <b>Catch up</b> until they close.
        </p>
      </section>
      )}

      {f.sprint && (
      <section className="g-sec" id="g-points">
        <Head n={num("points")} title="Points" color="orange" />
        <p>Points decide your level and your place on the leaderboard. Faster right answers earn more. Wrong answers never cost you anything.</p>
        <div className="formula">
          <span>Right answer = {RULES.base} + speed bonus</span>
          <span>
            Speed bonus = <code>{RULES.speedMax} × (1 − seconds used ÷ your time share)</code>
          </span>
          <span>
            Your time share = <code>quiz time ÷ number of questions</code>
          </span>
          <span>Perfect run (every answer right) = +{RULES.perfect} bonus</span>
          <span>Wrong answer or out of time = 0</span>
        </div>
        <div className="worked">
          <span className="hand">Worked example</span>
          <span>3 questions in 1½ minutes → your time share is {ex.share} seconds each.</span>
          <span>
            Q1 right in {ex.a}s → {RULES.base} + {p1 - RULES.base} = <b>{p1}</b>
          </span>
          <span>
            Q2 right in {ex.b}s → {RULES.base} + {p2 - RULES.base} = <b>{p2}</b>
          </span>
          <span>
            Q3 wrong → <b>0</b> (so no perfect bonus)
          </span>
          <span>
            Total: <b>{p1 + p2} points</b>
          </span>
        </div>
      </section>
      )}

      {f.coins && (
        <section className="g-sec" id="g-coins">
        <Head n={num("coins")} title="Coins" color="yellow" />
        <div className="g-talk">
          <Chibi look={me?.look ?? 1} equipped={{ head: "phones", ears: "hearts" }} variant="full" size={70} mood="cheer" />
          <Speech>{f.store ? `Coins are your pocket money for the store — new hats, shades, backgrounds${f.streaks ? " and Streak Shields" : ""}.` : "Coins show how much you've played and learned."}</Speech>
        </div>
        <div className="rule-grid">
          <div className="rule lime"><b>+{RULES.coinPerCorrect}</b><span>for every right answer</span></div>
          <div className="rule paper"><b>+{RULES.coinFinish}</b><span>for finishing a quiz (showing up counts)</span></div>
          <div className="rule pink"><b>+{RULES.coinPerfect}</b><span>for a perfect run</span></div>
          {f.streaks && <div className="rule orange"><b>+{RULES.streakCoinStep}/day</b><span>streak bonus from day 2, up to +{RULES.streakCoinCap} a day</span></div>}
        </div>
        {f.streaks && <div className="worked">
          <span className="hand">Example</span>
          <span>
            2 of 3 right on day 4 of your streak: {2 * RULES.coinPerCorrect} + {RULES.coinFinish} + {Math.min(RULES.streakCoinCap, RULES.streakCoinStep * 4)} = <b>{2 * RULES.coinPerCorrect + RULES.coinFinish + Math.min(RULES.streakCoinCap, RULES.streakCoinStep * 4)} coins</b>
          </span>
        </div>}
        <p className="fine">{f.streaks ? "The streak bonus is paid once a day, on your first finished quiz. " : ""}Coins are for fun: no cash value, can't be transferred, and they don't affect your leaderboard points.</p>
      </section>
      )}

      {f.streaks && (
        <section className="g-sec" id="g-streaks">
        <Head n={num("streaks")} title="Streaks" color="pink" />
        <p>
          Finish at least one quiz a day to grow your streak. Your streak card says <b>"Play today!"</b> until you've played. Miss a whole day and it resets{f.store && f.coins ? <> — unless you own a <b>Streak Shield</b> ({ITEM.shield.price} coins), which covers one missed day automatically. You can hold {ITEM.shield.max}.</> : "."}
        </p>
      </section>
      )}

      <section className="g-sec" id="g-levels">
        <Head n={num("levels")} title="Levels" color="blue" />
        <p>Your level grows with your total points. Each level needs a little more than the last.{f.store && f.coins ? " Some store items unlock at higher levels." : ""}</p>
        <div className="levels">
          {[1, 2, 3, 5, 8, 12, 16].map((L) => (
            <div className="lv" key={L}>
              <b>Lv {L}</b>
              <span>{levelTitle(L)}</span>
              <span className="num">{levelStart(L).toLocaleString()} pts</span>
            </div>
          ))}
        </div>
      </section>

      {f.sprint && (
        <section className="g-sec" id="g-scorecard">
        <Head n={num("scorecard")} title="Your scorecard" color="lime" />
        <p>After every quiz you get a scorecard:</p>
        <table className="tbl-mini">
          <tbody>
            <tr><td>Points</td><td>right answers, speed bonus and perfect bonus, added up</td></tr>
            {f.coins && <tr><td>Coins</td><td>what you earned from this quiz{f.streaks ? ", including any streak bonus" : ""}</td></tr>}
            <tr><td>Rank in quiz</td><td>your place among everyone who played this quiz</td></tr>
            <tr><td>Accuracy</td><td>right answers ÷ questions</td></tr>
            <tr><td>Time used</td><td>total seconds spent answering</td></tr>
            <tr><td>Worth a refresh</td><td>topics you missed — handy before the next sprint</td></tr>
          </tbody>
        </table>
        <p>Then watch your row climb this week's leaderboard.</p>
      </section>
      )}

      <section className="g-sec" id="g-boards">
        <Head n={num("boards")} title="Leaderboards" color="ink" />
        <div className="rule-grid">
          <div className="rule ink"><b>Week</b><span>Monday to Sunday — resets every Monday</span></div>
          <div className="rule paper"><b>Month</b><span>from the 1st of the month</span></div>
          <div className="rule paper"><b>All time</b><span>every quiz you've played</span></div>
          {f.battle && <div className="rule lime"><b>{labels.branches}</b><span>average points per active player</span></div>}
        </div>
        <p>
          <b>How ties are broken:</b> most points, then higher accuracy, then less time used, then whoever reached the score first. Only first tries count.{f.battle && <> A {br} or {labels.dept.toLowerCase()} needs {RULES.branchMin}+ active players to be ranked in {labels.battle}, and using the average means a small {br} can beat a big one.</>}
        </p>
      </section>

      {f.rewards && (
        <section className="g-sec" id="g-rewards">
        <Head n={num("rewards")} title="Rewards" color="orange" />
        <div className="g-talk">
          <Sprinty mood="cheer" size={64} />
          <Speech tone="ink">Top players get recognition, announced in the Hall of Fame.</Speech>
        </div>
        <div className="rule-grid">
          <div className="rule lime"><b>Weekly</b><span>Top 3 on the weekly board</span></div>
          <div className="rule pink"><b>Monthly</b><span>Most improved accuracy</span></div>
          {f.battle && <div className="rule blue"><b>{labels.branch}</b><span>{labels.battle} champion</span></div>}
          <div className="rule paper"><b>Fair</b><span>Reviewed by admins before any gift is issued</span></div>
        </div>
      </section>
      )}

      {f.cert && (
        <section className="g-sec" id="g-cert">
          <Head n={num("cert")} title="Certification exams" color="ink" />
          <p>Some topics have a formal exam. Pass it to earn a certificate with your name on it — you can print it or save it as a PDF.</p>
          <div className="rule-grid">
            <div className="rule paper"><b>Pass mark</b><span>Each exam sets its own, for example 80%.</span></div>
            <div className="rule paper"><b>Attempts</b><span>You may get a few tries. Once you pass, you are certified.</span></div>
            <div className="rule paper"><b>Hidden</b><span>Right answers stay hidden until the exam ends.</span></div>
            <div className="rule paper"><b>1 clock</b><span>One timer for the whole exam — it keeps running if you leave.</span></div>
          </div>
          <p className="fine">Some certificates expire after a set number of months — your Certifications page shows the date.</p>
        </section>
      )}

      {f.live && (
        <section className="g-sec" id="g-live">
          <Head n={num("live")} title="Live quiz" color="orange" />
          <p>
            At a meeting or town hall, the host shows a question on the big screen and everyone answers on their phone. Open <b>Join a live game</b> and type the 6-digit PIN.
          </p>
          <div className="rule-grid">
            <div className="rule lime"><b>Fast</b><span>Right answers earn more the quicker you are.</span></div>
            <div className="rule orange"><b>Streaks</b><span>Answers in a row add a bonus.</span></div>
          </div>
          <p className="fine">Live games have their own scoreboard and don't change your points here.</p>
        </section>
      )}

      {f.polls && (
        <section className="g-sec" id="g-polls">
          <Head n={num("polls")} title="Live polls" color="pink" />
          <p>
            Hosts sometimes run a quick poll — multiple choice, word clouds, ratings or questions for the speaker. Go to the vote link or scan the QR code, enter the code, and answer. Polls are anonymous and there are no right answers.
          </p>
        </section>
      )}

      <section className="g-sec" id="g-fair">
        <Head n={num("fair")} title="Fair play & privacy" color="blue" />
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
          <li>One player card per person. Sign in only to your own card{pub.signIn.empId ? <> — on a new device, enter your Employee ID and tap "Yes, that's me"</> : ""}. Signing in on one device signs you out of the others.</li>
          <li>Answers are checked on the server against a sealed answer key, and unusual plays are reviewed. Scores that don't add up are removed.</li>
          <li>Switching away from the quiz screen is noted. It isn't blocked.</li>
          <li>Other players see your {d.cfg.lastInitialOnly ? "first name and last initial" : "name"}, {br} and points{d.cfg.maskIds ? " — your Employee ID stays hidden" : ""}.</li>
          <li>{pub.name} uses results to plan training, not for performance ratings. Plays are kept for {d.cfg.retentionDays} days.</li>
        </ul>
      </section>
      <button type="button" className="btn primary block" onClick={() => go({ v: me ? "lobby" : "welcome" })}>
        {me ? "Back to the lobby" : "Let's play"}
      </button>
    </div>
  );
}
