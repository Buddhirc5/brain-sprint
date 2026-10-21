import { useState } from "react";
import { errMsg } from "../app/ApiCtx";
import { useApp } from "../app/ctx";
import { Chibi } from "../components/Chibi";
import { Kit, Pet, Ride } from "../components/Companions";
import { coinBurst, confetti, Icon, Modal } from "../components/ui";
import { ITEMS, type Item, type Slot } from "../lib/catalog";
import type { Equipped } from "../types";
import { TopBar } from "./common";

const TABS: [Slot, string][] = [["pet", "Pets"], ["ride", "Rides"], ["head", "Hats & phones"], ["face", "Glasses"], ["ears", "Earrings"], ["power", "Power-ups"]];

export function Store() {
  const { api, tid, me, stats, go, toast, features } = useApp();
  const [tab, setTab] = useState<Slot>("pet");
  const [trying, setTrying] = useState<Equipped | null>(null);
  const [confirm, setConfirm] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  if (!features.store || !features.coins)
    return (
      <div className="phone">
        <TopBar title="Store" back={() => go({ v: "lobby" })} />
        <div className="empty">The store is closed right now.</div>
      </div>
    );
  const s = stats[me.uid];
  const owned = (id: string) => (me.purchases || []).filter((p) => p.id === id).length;
  const eq = me.equipped || {};
  const look = trying ?? eq;
  const slotKey = (it: Item) => it.slot as keyof Equipped;

  const buy = async (it: Item) => {
    if (busy) return;
    if (s.coins < it.price) return toast(`You need ${it.price - s.coins} more coins.`);
    setBusy(true);
    try {
      await api.buyItem(tid, it.id);
      if (it.slot !== "power") await api.updateMyCard(tid, { equipped: { ...eq, [it.slot]: it.id } }).catch(() => undefined);
      coinBurst(document.querySelector("[data-coin-target]") as HTMLElement, 6);
      confetti(60);
      toast(it.slot === "power" ? `${it.name} ready` : `${it.name} is yours!`);
      setTrying(null);
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };
  const equip = async (it: Item, on: boolean) => {
    const next: Equipped = { ...eq };
    if (on) next[slotKey(it)] = it.id;
    else delete next[slotKey(it)];
    try {
      await api.updateMyCard(tid, { equipped: next });
      setTrying(null);
    } catch (e) {
      toast(errMsg(e));
    }
  };

  const tabs = TABS.filter(([k]) => k !== "power" || features.streaks);
  const items = ITEMS.filter((i) => i.slot === tab && !i.retired);
  return (
    <div className="phone">
      <TopBar title="Store" back={() => go({ v: "lobby" })} />
      <section className="store">
        <div className="store-top">
          <div>
            <div className="nm">{me.name.split(" ")[0]}</div>
            <div className="lv">Level {s.level.level}</div>
          </div>
          <Kit look={me.look} equipped={look} size={124} mood={trying ? "happy" : "idle"} className="store-kit" />
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="pill num" data-coin-target>
            <span className="coin-ic" />
            {s.coins.toLocaleString()} coins
          </span>
          {features.streaks && (
            <span className="pill num">
              <Icon.fire /> {s.streak.current}-day streak
            </span>
          )}
          {features.streaks && s.streak.shieldsOwned > 0 && <span className="pill"><Icon.shield /> {s.streak.shieldsOwned} shield{s.streak.shieldsOwned > 1 ? "s" : ""}</span>}
        </div>
        <div className="tabs" role="tablist">
          {tabs.map(([k, l]) => (
            <button type="button" key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); setTrying(null); }}>
              {l}
            </button>
          ))}
        </div>
        <div className="items">
          {items.map((it) => {
            const have = owned(it.id);
            const locked = (it.minLevel || 0) > s.level.level;
            const isOn = it.slot !== "power" && eq[slotKey(it)] === it.id;
            const full = it.max ? have - s.streak.shieldsUsed >= it.max : false;
            return (
              <div key={it.id} className={`item ${isOn ? "equipped" : ""}`}>
                {have > 0 && it.slot !== "power" && <span className="own">Owned</span>}
                {locked && <span className="lockd">Lv {it.minLevel}</span>}
                {it.slot === "power" ? (
                  <span className="shield-ic">
                    <Icon.shield />
                  </span>
                ) : it.slot === "pet" || it.slot === "ride" ? (
                  <button className="item-art" aria-label={`Try ${it.name}`} onClick={() => setTrying({ ...eq, [slotKey(it)]: it.id })}>
                    {it.slot === "pet" ? <Pet id={it.id} size={96} /> : <Ride id={it.id} size={128} />}
                  </button>
                ) : (
                  <button aria-label={`Try on ${it.name}`} onClick={() => setTrying({ ...eq, [slotKey(it)]: it.id })} style={{ borderRadius: "50%" }}>
                    <Chibi look={me.look} equipped={{ ...eq, [slotKey(it)]: it.id }} size={86} still />
                  </button>
                )}
                <span className="nm">{it.name}</span>
                {it.blurb && <span className="blurb">{it.blurb}</span>}
                {it.slot === "power" ? (
                  <>
                    <span className="price num">
                      <span className="coin-ic" />
                      {it.price}
                    </span>
                    <button className="btn primary tiny" disabled={locked || full || busy} onClick={() => setConfirm(it)}>
                      {full ? `Holding ${it.max}` : "Buy"}
                    </button>
                  </>
                ) : have ? (
                  <button className={`btn ${isOn ? "ghost" : "primary"} tiny`} onClick={() => equip(it, !isOn)}>
                    {isOn ? (it.slot === "pet" ? "Send home" : it.slot === "ride" ? "Park it" : "Take off") : it.slot === "pet" ? "Take along" : it.slot === "ride" ? "Ride" : "Wear"}
                  </button>
                ) : (
                  <>
                    <span className="price num">
                      <span className="coin-ic" />
                      {it.price}
                    </span>
                    <button className="btn primary tiny" disabled={locked || busy} onClick={() => setConfirm(it)}>
                      {locked ? "Locked" : s.coins < it.price ? "Need more coins" : "Buy"}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <p className="fine" style={{ textAlign: "center" }}>
        Coins are for fun only — they have no cash value and can't be transferred.
      </p>
      {confirm && (
        <Modal label="Confirm purchase" onClose={() => setConfirm(null)}>
          <h3>Buy {confirm.name}?</h3>
          <p>
            {confirm.price} coins · you'll have {Math.max(0, s.coins - confirm.price)} left.
          </p>
          <div className="row end">
            <button className="btn ghost small" onClick={() => setConfirm(null)}>
              Not now
            </button>
            <button className="btn primary small" disabled={busy || s.coins < confirm.price} onClick={() => buy(confirm)}>
              {s.coins < confirm.price ? "Not enough coins" : "Buy it"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
