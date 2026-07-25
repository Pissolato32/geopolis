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

function safeTime(rawAt?: string): string {
  if (!rawAt) return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const parsed = new Date(rawAt);
  if (isNaN(parsed.getTime())) {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function EventRow({ evt }: { evt: GameEvent }) {
  const time = safeTime(evt.at);

  if (evt.type === "ai.decision") {
    return (
      <article className="feed-row feed-ai">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-ai">AI STRATEGY</span>
        <span className="feed-text">
          <CountryLink code={evt.country} /> decidiu: <b>{evt.action}</b> ({evt.rationale}).
        </span>
      </article>
    );
  }
  if (evt.type === "war.declared") {
    return (
      <article className="feed-row feed-war">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-war">DECLARAÇÃO DE GUERRA</span>
        <span className="feed-text">
          ⚠️ <CountryLink code={evt.aggressor} /> declarou GUERRA a <CountryLink code={evt.target} />! Racional: {evt.reason}.
        </span>
      </article>
    );
  }
  if (evt.type === "peace.declared") {
    return (
      <article className="feed-row feed-diplo">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-diplo">TRÉGUA</span>
        <span className="feed-text">
          🕊️ <CountryLink code={evt.initiator} /> propos paz a <CountryLink code={evt.target} />. Termos: {evt.terms}.
        </span>
      </article>
    );
  }
  if (evt.type === "turn.advanced") {
    const sign = evt.gdpDeltaTotal >= 0 ? "+" : "";
    return (
      <article className="feed-row feed-turn">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-turn">TURNO {evt.tick}</span>
        <span className="feed-text">
          Simulação avançou. Variação PIB Global: <b>{sign}${fmtMoney(evt.gdpDeltaTotal)}</b> | Conflitos Ativos: <b>{evt.activeConflictsCount}</b> | Tratados: <b>{evt.treatiesSignedCount}</b>.
        </span>
      </article>
    );
  }
  if (evt.type === "turn.tension-shift") {
    return (
      <article className="feed-row feed-diplo">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-diplo">TENSÃO</span>
        <span className="feed-text">
          Tensão entre <CountryLink code={evt.countryA} /> e <CountryLink code={evt.countryB} /> alterada para <b>{evt.newTension}/100</b> ({evt.reason}).
        </span>
      </article>
    );
  }
  if (evt.type === "turn.economy-growth") {
    const growth = Number(evt.growthPct ?? 0);
    const sign = growth >= 0 ? "+" : "";
    return (
      <article className="feed-row feed-econ">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-econ">CRESCIMENTO</span>
        <span className="feed-text">
          <CountryLink code={evt.country} /> PIB atualizado: <b>${fmtMoney(evt.gdp)}</b> ({sign}{growth.toFixed(2)}%).
        </span>
      </article>
    );
  }
  if (evt.type === "turn.stability-shift") {
    const delta = Number(evt.delta ?? 0);
    const sign = delta >= 0 ? "+" : "";
    return (
      <article className="feed-row feed-econ">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-econ">ESTABILIDADE</span>
        <span className="feed-text">
          Estabilidade interna de <CountryLink code={evt.country} />: <b>{evt.newStability}/100</b> ({sign}{delta}).
        </span>
      </article>
    );
  }
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
          <CountryLink code={evt.victor} />. Losses: {Number(evt.attackerLosses ?? 0).toLocaleString()} /{" "}
          {Number(evt.defenderLosses ?? 0).toLocaleString()}.
        </span>
      </article>
    );
  }
  if (evt.type === "diplomacy.treaty-signed") {
    const parties = evt.parties || ["UNK", "UNK"];
    return (
      <article className="feed-row feed-diplo">
        <span className="feed-time">{time}</span>
        <span className="feed-tag tag-diplo">DIPLO</span>
        <span className="feed-text">
          <CountryLink code={parties[0] || "UNK"} /> +<CountryLink code={parties[1] || "UNK"} /> signed a {evt.kind || "bilateral"} treaty ({evt.durationYears || 5}y).
        </span>
      </article>
    );
  }
  // economy.indicator
  const e = evt as Extract<GameEvent, { type: "economy.indicator" }>;
  const treasury = Number(e.treasury ?? 0);
  const delta = Number(e.delta ?? 0);
  const country = e.country || "GLOB";
  const sign = delta >= 0 ? "+" : "";
  return (
    <article className="feed-row feed-econ">
      <span className="feed-time">{time}</span>
      <span className="feed-tag tag-econ">ECON</span>
      <span className="feed-text">
        <CountryLink code={country} /> tesouro: <b>${fmtMoney(treasury)}</b> ({sign}${fmtMoney(delta)}).
      </span>
    </article>
  );
}

function fmtMoney(n: number | undefined): string {
  const num = Number(n ?? 0);
  if (isNaN(num)) return "0";
  const abs = Math.abs(num);
  if (abs >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(num / 1e3).toFixed(0)}K`;
  return `${num}`;
}
