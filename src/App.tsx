// App — the 3-panel command dashboard. Loads the world seed, wires the
// WebSocket, and composes the left event log, center map, and right profile.
// The topbar carries the global search (so all 246 nations are reachable,
// including the ~72 with no 110m map geometry) and the live market ticker.

import { useEffect, useState } from "react";
import { EventLog } from "./EventLog.js";
import { WorldMap } from "./WorldMap.js";
import { CountryProfile } from "./CountryProfile.js";
import { GlobalSearch } from "./GlobalSearch.js";
import { MarketTicker } from "./MarketTicker.js";
import { gameSocket } from "./gameSocket.js";
import { loadOrSeedWorld } from "./gameStore.js";
import type { WorldSeed } from "./shared/types.js";
import seedData from "../data/world-seed-2026.json";

const SEED = seedData as WorldSeed;

export default function App() {
  const [seed] = useState<WorldSeed>(SEED);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState<string>("");
  const [tick, setTick] = useState(0);
  const [turnBusy, setTurnBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const world = await loadOrSeedWorld(seed);
        if (cancelled) return;
        (window as unknown as { __worldSeed?: WorldSeed }).__worldSeed = seed;
        gameSocket.setPersistedWorld(world, seed);
        gameSocket.connect();
        setStatus("ready");
      } catch (err) {
        console.error("[app] failed to load/seed world", err);
        if (cancelled) return;
        setErrMsg(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seed]);

  useEffect(() => gameSocket.onTick(setTick), []);

  const advanceTurn = async () => {
    if (turnBusy) return;
    setTurnBusy(true);
    try {
      await gameSocket.advanceTurn();
    } finally {
      setTimeout(() => setTurnBusy(false), 400);
    }
  };

  if (status === "loading") {
    return (
      <div className="app-shell">
        <div className="boot-screen">
          <div className="boot-spinner" aria-hidden />
          <h2>Initializing world…</h2>
          <p>Seeding 246 nations, diplomatic relations, and military forces.</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="app-shell">
        <div className="boot-screen boot-error">
          <h2>Could not connect to the world database</h2>
          <p>{errMsg}</p>
          <button className="btn btn-accent" onClick={() => location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>◤</span>
          <div>
            <h1>GEOSIM COMMAND</h1>
            <span className="brand-sub">Modern World Dashboard · 2026</span>
          </div>
        </div>
        <GlobalSearch seed={seed} />
        <div className="topbar-status">
          <span className="tick-badge" title="Simulation turn">Turn {tick}</span>
          <button
            className={turnBusy ? "btn btn-accent turn-btn turn-busy" : "btn btn-accent turn-btn"}
            onClick={advanceTurn}
            disabled={turnBusy}
          >
            {turnBusy ? "Processing…" : "Advance Turn"}
          </button>
          <span className="status status-ok">● {seed.countryCount} nations online</span>
        </div>
      </header>

      <MarketTicker />

      <main className="layout">
        <EventLog />
        <section className="map-pane">
          <WorldMap seed={seed} />
        </section>
        <CountryProfile />
      </main>
    </div>
  );
}
