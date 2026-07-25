// App — the 3-panel command dashboard. Loads the world seed, wires the
// WebSocket, and composes the left event log, center map, right profile,
// time speed controls, turn progression, scenario selector, achievement points, and interactive tutorial.

import { useEffect, useState } from "react";
import { EventLog } from "./EventLog.js";
import { WorldMap } from "./WorldMap.js";
import { CountryProfile } from "./CountryProfile.js";
import { GlobalSearch } from "./GlobalSearch.js";
import { MarketTicker } from "./MarketTicker.js";
import { AchievementManager } from "./AchievementManager.js";
import { TutorialOverlay } from "./TutorialOverlay.js";
import { gameSocket } from "./gameSocket.js";
import type { WorldSeed } from "./shared/types.js";
import seedData from "./world-seed-2026.json";

const SEED = (seedData as unknown) as WorldSeed;
const LS_KEY_PLAYER = "geopolis.player_country";

export default function App() {
  const [seed] = useState<WorldSeed>(SEED);
  const [playerCountry, setPlayerCountry] = useState<string>(() => {
    return localStorage.getItem(LS_KEY_PLAYER) ?? "BRA";
  });
  const [achievementPoints, setAchievementPoints] = useState<number>(0);
  const [showTutorial, setShowTutorial] = useState<boolean>(false);
  const [gameSpeed, setGameSpeed] = useState<number>(1);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [currentTick, setCurrentTick] = useState<number>(1);
  const [isProcessingTurn, setIsProcessingTurn] = useState<boolean>(false);
  const [selectedScenario, setSelectedScenario] = useState<string>("world-seed-2026");

  useEffect(() => {
    (window as unknown as { __worldSeed?: WorldSeed }).__worldSeed = seed;
    gameSocket.setSeed(seed);
    gameSocket.connect();
    return gameSocket.onEvent((e) => {
      if (e.type === "turn.advanced") {
        setCurrentTick(e.tick);
      }
    });
  }, [seed]);

  const handleSelectPlayerCountry = (code: string) => {
    setPlayerCountry(code);
    localStorage.setItem(LS_KEY_PLAYER, code);
  };

  const handleStepTick = async () => {
    if (isProcessingTurn) return;
    setIsProcessingTurn(true);
    try {
      const res = await fetch("/api/v1/tick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticks: 1 }),
      });
      if (res.ok) {
        setCurrentTick((prev) => prev + 1);
      }
    } catch {
      // ignore
    } finally {
      setTimeout(() => setIsProcessingTurn(false), 300);
    }
  };

  const handleScenarioChange = (scenarioId: string) => {
    setSelectedScenario(scenarioId);
    fetch("/api/v1/scenarios/load", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId }),
    }).catch(() => {});
  };

  const playerCountryObj = seed.countries.find((c) => c.id === playerCountry);

  return (
    <div className="app-shell">
      <AchievementManager onPointsUpdate={setAchievementPoints} />

      {showTutorial && <TutorialOverlay onClose={() => setShowTutorial(false)} />}

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden>◤</span>
          <div>
            <h1>GEOSIM COMMAND</h1>
            <span className="brand-sub">GeoPolis AI Engine · Modern World</span>
          </div>
        </div>

        <GlobalSearch seed={seed} />

        {/* Turn Progression Badge & Advance Turn Button */}
        <div className="time-controls" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span className="chip tick-badge">
            ⚡ TURNO {currentTick}
          </span>
          <button
            className={`chip btn-accent ${isProcessingTurn ? "turn-busy" : ""}`}
            onClick={handleStepTick}
            disabled={isProcessingTurn}
            title="Processar simulação e avançar 1 turno"
          >
            {isProcessingTurn ? "⏳ Processando..." : "⚡ Avançar Turno (+1 Tick)"}
          </button>

          <button
            className={isPaused ? "chip chip-warn" : "chip"}
            onClick={() => setIsPaused(!isPaused)}
            title="Pausar / Retomar Simulação"
          >
            {isPaused ? "▶️ Retomar" : "⏸️ Pausar"}
          </button>
          <button
            className={gameSpeed === 1 ? "chip active" : "chip"}
            onClick={() => setGameSpeed(1)}
          >
            1x
          </button>
          <button
            className={gameSpeed === 2 ? "chip active" : "chip"}
            onClick={() => setGameSpeed(2)}
          >
            2x
          </button>
          <button
            className={gameSpeed === 5 ? "chip active" : "chip"}
            onClick={() => setGameSpeed(5)}
          >
            5x
          </button>
        </div>

        {/* Scenario Selector */}
        <select
          className="chip"
          style={{ background: "var(--bg-3)", color: "var(--text)" }}
          value={selectedScenario}
          onChange={(e) => handleScenarioChange(e.target.value)}
        >
          <option value="world-seed-2026">🌍 Mundo Moderno 2026</option>
          <option value="crise-recursos-2030">🚀 Crise de Recursos 2030</option>
          <option value="guerra-fria-1962">☢️ Guerra Fria 1962</option>
        </select>

        <div className="topbar-status" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Active Player Country Badge */}
          <div
            className="chip active"
            style={{
              background: "rgba(74, 227, 196, 0.15)",
              borderColor: "var(--accent)",
              color: "var(--accent)",
              fontWeight: "bold",
            }}
          >
            🎮 {playerCountryObj ? playerCountryObj.name : playerCountry} ({playerCountry})
          </div>

          {/* Achievement Points Badge */}
          <span className="status" style={{ color: "var(--warn)", fontWeight: "bold" }}>
            🏆 {achievementPoints} PTS
          </span>

          {/* Tutorial Trigger Button */}
          <button className="chip" onClick={() => setShowTutorial(true)}>
            ❓ Tutorial
          </button>
        </div>
      </header>

      <MarketTicker />

      <main className="layout">
        <EventLog />
        <section className="map-pane">
          <WorldMap seed={seed} />
        </section>
        <CountryProfile
          playerCountry={playerCountry}
          onSelectPlayerCountry={handleSelectPlayerCountry}
        />
      </main>
    </div>
  );
}
