import { Activity, Gauge, Map, Pause, Play, Zap } from "lucide-react";
import type { SimSpeed } from "../../gameSocket.js";

interface CommandBarProps {
  tick: number;
  simPaused: boolean;
  simSpeed: SimSpeed;
  onSpeed: (speed: SimSpeed) => void;
  onAdvance: () => void;
  busy?: boolean;
}

export function CommandBar({ tick, simPaused, simSpeed, onSpeed, onAdvance, busy = false }: CommandBarProps) {
  return (
    <nav className="command-bar" aria-label="Simulation commands">
      <span className="command-bar__context"><Map size={16} aria-hidden="true" /> Command</span>
      <span className="command-bar__tick">Turn {tick}</span>
      <div className="command-bar__controls" role="group" aria-label="Simulation speed">
        <button type="button" className={simPaused ? "active" : ""} onClick={() => onSpeed(0)} aria-label="Pause simulation" aria-pressed={simPaused}>
          <Pause size={15} aria-hidden="true" />
        </button>
        <button type="button" className={!simPaused && simSpeed === 1 ? "active" : ""} onClick={() => onSpeed(1)} aria-label="Simulation speed 1x" aria-pressed={!simPaused && simSpeed === 1}>
          <Play size={15} aria-hidden="true" />
        </button>
        <button type="button" className={!simPaused && simSpeed === 2 ? "active" : ""} onClick={() => onSpeed(2)} aria-label="Simulation speed 2x" aria-pressed={!simPaused && simSpeed === 2}>
          <Gauge size={15} aria-hidden="true" />2x
        </button>
        <button type="button" className={!simPaused && simSpeed === 5 ? "active" : ""} onClick={() => onSpeed(5)} aria-label="Simulation speed 5x" aria-pressed={!simPaused && simSpeed === 5}>
          <Activity size={15} aria-hidden="true" />5x
        </button>
        <button type="button" onClick={onAdvance} disabled={busy} aria-label="Advance one turn">
          <Zap size={15} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
