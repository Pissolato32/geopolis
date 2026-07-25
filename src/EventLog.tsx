// EventLog — left panel. A scrollable feed consuming all game events from the
// WebSocket. Country codes in every event render as clickable inline links
// that update the SelectionManager (cross-navigation).

import { useEffect, useRef, useState } from "react";
import { gameSocket } from "./gameSocket.js";
import type { GameEvent } from "./shared/types.js";
import { selection } from "./selectionManager.js";

interface FeedEntry {
  id: string;
  evt: GameEvent;
}

export function EventLog() {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const bufferRef = useRef<FeedEntry[]>([]);

  useEffect(() => {
    return gameSocket.onEvent((evt) => {
      // market updates go to the ticker, not the log
      if (evt.type === "economy.market-update") return;
      const entry = { id: `${evt.at}-${Math.random().toString(36).slice(2, 7)}`, evt };
      if (pausedRef.current) {
        bufferRef.current.push(entry);
        return;
      }
      setEntries((prev) => {
        const next = [...prev, entry];
        return next.length > 200 ? next.slice(next.length - 200) : next;
      });
    });
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  const onResume = () => {
    setPaused(false);
    if (bufferRef.current.length) {
      setEntries((prev) => [...prev, ...bufferRef.current].slice(-200));
      bufferRef.current = [];
    }
  };

  const onClear = () => {
    setEntries([]);
    bufferRef.current = [];
  };

  return (
    <section className="panel event-log">
      <header className="panel-header">
        <h2>Event &amp; Diplomatic Log</h2>
        <div className="panel-actions">
          <button
            className={paused ? "chip chip-warn" : "chip"}
            onClick={() => (paused ? onResume() : setPaused(true))}
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button className="chip" onClick={onClear}>
            Clear
          </button>
        </div>
      </header>
      <div className="feed" ref={listRef} onScroll={onScroll}>
        {entries.length === 0 && (
          <div className="feed-empty">Awaiting telemetry from the world…</div>
        )}
        {entries.map((e) => (
          <EventRow key={e.id} evt={e.evt} />
        ))}
      </div>
    </section>
  );
}

function CountryLink({ code }: { code: string }) {
  return <button className="country-link" onClick={(e) => jumpTo(code, e)}> {code}</button>;
}

function jumpTo(code: string, e: React.MouseEvent) {
  e.stopPropagation();
  const seed = (window as unknown as { __worldSeed?: { countries: Array<{ id: string }> } }).__worldSeed;
  const country = seed?.countries.find((c) => c.id === code);
  if (country) selection.selectCountry(country as never);
}

function EventRow({ evt }: { evt: GameEvent }) {
  const time = new Date(evt.at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  if (evt.type === "war.unit-destroyed") {
    return (
      <article className="feed-row feed-war">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-war">UNIT</span>
        <span className="feed-text">
          Unit <b>{evt.unitId}</b> of<CountryLink code={evt.ownerCode} /> destroyed by
          <CountryLink code={evt.by} />.
        </span>
      </article>
    );
  }
  if (evt.type === "war.combat-resolved") {
    return (
      <article className="feed-row feed-war">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-war">WAR</span>
        <span className="feed-text">
          <CountryLink code={evt.attacker} /> engaged<CountryLink code={evt.defender} /> — victor
          <CountryLink code={evt.victor} />. Losses: {evt.attackerLosses.toLocaleString()} /{" "}
          {evt.defenderLosses.toLocaleString()}.
        </span>
      </article>
    );
  }
  if (evt.type === "diplomacy.treaty-signed") {
    return (
      <article className="feed-row feed-diplo">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-diplo">DIPLO</span>
        <span className="feed-text">
          <CountryLink code={evt.parties[0]} /> +<CountryLink code={evt.parties[1]} /> signed a {evt.kind} treaty ({evt.durationYears}y).
        </span>
      </article>
    );
  }
  if (evt.type === "war.declared") {
    return (
      <article className="feed-row feed-war">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-war">WAR</span>
        <span className="feed-text">
          <CountryLink code={evt.aggressor} /> declared war on <CountryLink code={evt.target} /> ({evt.reason}).
        </span>
      </article>
    );
  }
  if (evt.type === "peace.declared") {
    return (
      <article className="feed-row feed-diplo">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-diplo">PEACE</span>
        <span className="feed-text">
          <CountryLink code={evt.initiator} /> sued for peace with <CountryLink code={evt.target} /> ({evt.terms}).
        </span>
      </article>
    );
  }
  if (evt.type === "ai.decision") {
    return (
      <article className="feed-row feed-ai">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-ai">AI STRATEGY</span>
        <span className="feed-text">
          <CountryLink code={evt.country} /> {evt.action} — {evt.rationale}.
        </span>
      </article>
    );
  }
  if (evt.type === "policy.tax-set") {
    const sign = evt.treasuryImpact >= 0 ? "+" : "";
    return (
      <article className="feed-row feed-policy">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-policy">POLICY</span>
        <span className="feed-text">
          <CountryLink code={evt.country} /> set tax rate to {(evt.rate * 100).toFixed(0)}% (treasury {sign}{fmtMoney(evt.treasuryImpact)}/yr).
        </span>
      </article>
    );
  }
  if (evt.type === "policy.readiness-set") {
    const moraleSign = evt.moraleImpact >= 0 ? "+" : "";
    return (
      <article className="feed-row feed-policy">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-policy">POLICY</span>
        <span className="feed-text">
          <CountryLink code={evt.country} /> set military readiness to {evt.level}% (morale {moraleSign}{evt.moraleImpact}).
        </span>
      </article>
    );
  }
  if (evt.type === "policy.posture-set") {
    return (
      <article className="feed-row feed-policy">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-policy">POLICY</span>
        <span className="feed-text">
          <CountryLink code={evt.country} /> adopted a <b>{evt.posture}</b> diplomatic posture.
        </span>
      </article>
    );
  }
  if (evt.type === "turn.advanced") {
    const s = evt.summary;
    const gdpSign = s.globalGdpDelta >= 0 ? "+" : "";
    return (
      <article className="feed-row feed-turn">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-turn">TURNO N</span>
        <span className="feed-text">
          <b>Turn {s.tick}</b> — {s.economiesGrown} economies grew, {s.economiesShrunk} shrank, {s.combats} combats, {s.treaties} treaties, {s.aiDecisions} AI moves. Global GDP {gdpSign}{fmtMoney(s.globalGdpDelta)}.
        </span>
      </article>
    );
  }
  if (evt.type === "turn.tension-shift") {
    const sign = evt.delta >= 0 ? "+" : "";
    return (
      <article className="feed-row feed-diplo">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-diplo">TENS</span>
        <span className="feed-text">
          <CountryLink code={evt.countryA} /> ↔ <CountryLink code={evt.countryB} /> tension {sign}{evt.delta} ({evt.reason}).
        </span>
      </article>
    );
  }
  if (evt.type === "turn.economy-growth") {
    const sign = evt.gdpGrowth >= 0 ? "+" : "";
    return (
      <article className="feed-row feed-econ">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-econ">ECON</span>
        <span className="feed-text">
          <CountryLink code={evt.country} /> GDP {sign}{fmtMoney(evt.gdpGrowth)}, treasury {fmtMoney(evt.treasuryChange)}.
        </span>
      </article>
    );
  }
  if (evt.type === "turn.stability-shift") {
    const sign = evt.delta >= 0 ? "+" : "";
    return (
      <article className="feed-row feed-econ">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-econ">STAB</span>
        <span className="feed-text">
          <CountryLink code={evt.country} /> stability now {evt.stability}/100 ({sign}{evt.delta}).
        </span>
      </article>
    );
  }
  if (evt.type === "military.recruitment") {
    return (
      <article className="feed-row feed-mil">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-mil">MIL</span>
        <span className="feed-text">
          <CountryLink code={evt.country} /> commissioned <b>{evt.unitType}</b> unit <b>{evt.unitId}</b> (${fmtMoney(evt.cost)}).
        </span>
      </article>
    );
  }
  if (evt.type === "aid.sent") {
    return (
      <article className="feed-row feed-aid">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-aid">AID</span>
        <span className="feed-text">
          <CountryLink code={evt.from} /> sent ${fmtMoney(evt.amount)} aid to <CountryLink code={evt.target} /> (+{evt.affinityGain} affinity).
        </span>
      </article>
    );
  }
  if (evt.type === "intel.gathered") {
    return (
      <article className="feed-row feed-intel">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-intel">INTEL</span>
        <span className="feed-text">
          <CountryLink code={evt.player} /> gathered intelligence on <CountryLink code={evt.target} /> — intel level {evt.intelLevel}/100 (${fmtMoney(evt.cost)}).
        </span>
      </article>
    );
  }
  if (evt.type === "sabotage.executed") {
    return (
      <article className="feed-row feed-sabotage">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-sabotage">SABOTAGE</span>
        <span className="feed-text">
          <CountryLink code={evt.from} /> sabotaged <CountryLink code={evt.target} /> — stability {evt.stabilityHit}, readiness {evt.readinessHit} (${fmtMoney(evt.cost)}).
        </span>
      </article>
    );
  }
  if (evt.type === "sabotage.failed") {
    return (
      <article className="feed-row feed-sabotage">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-sabotage">SABOTAGE</span>
        <span className="feed-text">
          <CountryLink code={evt.from} /> sabotage against <CountryLink code={evt.target} /> FAILED — {evt.reason} (${fmtMoney(evt.cost)}).
        </span>
      </article>
    );
  }
  // economy.indicator — narrowed; market-update is filtered out above
  const e = evt as Extract<GameEvent, { type: "economy.indicator" }>;
  const sign = e.delta >= 0 ? "+" : "";
  return (
    <article className="feed-row feed-econ">
      <span className="feed-time">{time}</span>
      <span className="feed-tag tag-econ">ECON</span>
      <span className="feed-text">
        <CountryLink code={e.country} /> treasury ${fmtMoney(e.treasury)} ({sign}
        {fmtMoney(e.delta)}).
      </span>
    </article>
  );
}

function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return `${n}`;
}
