// CovertOpsPanel — interactive panel for launching, monitoring, and aborting
// covert operations. Rendered inside the Intelligence tab.

import { useState } from "react";
import type { Country, CovertOpType, CovertOperation } from "./shared/types.js";
import {
  OP_TEMPLATES,
  createInitialCovertOpsState,
} from "./domain/intelligence/covertOps.js";
import { gameSocket } from "./gameSocket.js";

interface Props {
  playerCountry: Country;
  onLaunch: (type: CovertOpType, target: string) => void;
  onAbort: (opId: string) => void;
}

const OP_ORDER: CovertOpType[] = ["cyber_sabotage", "political_subversion", "economic_sabotage", "troop_recon"];

export function CovertOpsPanel({ playerCountry, onLaunch, onAbort }: Props) {
  const [selectedTarget, setSelectedTarget] = useState<string>("");
  const countries = gameSocket.getCountries().filter((c) => c.id !== playerCountry.id);
  const covertOps = playerCountry.covertOps ?? createInitialCovertOpsState(playerCountry.id);

  return (
    <div className="covert-panel">
      <div className="covert-header">
        <h3 className="section-heading">Covert Operations</h3>
        <span className="covert-treasury">
          Treasury: ${((playerCountry.economy?.treasury ?? 0) / 1e9).toFixed(2)}B
        </span>
      </div>

      {/* Target selector */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 11, color: "var(--text-dim)", display: "block", marginBottom: 4 }}>
          Select Target Nation:
        </label>
        <select
          value={selectedTarget}
          onChange={(e) => setSelectedTarget(e.target.value)}
          style={{
            width: "100%", padding: "6px 10px", fontSize: 12,
            background: "rgba(13,20,27,0.5)", border: "1px solid var(--border)",
            borderRadius: 6, color: "var(--text)",
          }}
        >
          <option value="">— Choose target —</option>
          {countries.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
          ))}
        </select>
      </div>

      {/* Operation type cards */}
      <div className="covert-ops-grid">
        {OP_ORDER.map((opType) => {
          const template = OP_TEMPLATES[opType];
          const canAfford = (playerCountry.economy?.treasury ?? 0) >= template.baseCost;
          const canLaunch = canAfford && selectedTarget !== "";
          return (
            <div key={opType} className="covert-op-card">
              <div className="covert-op-name">{template.name}</div>
              <p className="covert-op-desc">{template.description}</p>
              <div className="covert-op-stats">
                <span className="covert-op-stat">
                  Success: <span className="val">{Math.round(template.baseSuccessChance * 100)}%</span>
                </span>
                <span className="covert-op-stat">
                  Exposure: <span className="val">{Math.round(template.baseExposureRisk * 100)}%</span>
                </span>
                <span className="covert-op-stat">
                  Cost: <span className="val">${(template.baseCost / 1e6).toFixed(0)}M</span>
                </span>
                <span className="covert-op-stat">
                  Duration: <span className="val">{template.baseDuration} ticks</span>
                </span>
              </div>
              <button
                className="covert-op-launch-btn"
                disabled={!canLaunch}
                onClick={() => onLaunch(opType, selectedTarget)}
              >
                {canAfford ? "Launch Operation" : "Insufficient Treasury"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Active operations */}
      {covertOps.activeOps.length > 0 && (
        <div className="covert-active-section">
          <div className="covert-active-title">Active Missions ({covertOps.activeOps.length})</div>
          {covertOps.activeOps.map((op) => (
            <ActiveOpRow key={op.id} op={op} onAbort={onAbort} />
          ))}
        </div>
      )}

      {/* Exposed incidents */}
      {covertOps.exposedIncidents.length > 0 && (
        <div className="covert-active-section">
          <div className="covert-active-title" style={{ color: "#e85d5a" }}>
            Exposed Incidents ({covertOps.exposedIncidents.length})
          </div>
          {covertOps.exposedIncidents.map((op) => (
            <div key={op.id} className="covert-active-item" style={{ borderColor: "rgba(232,93,90,0.3)" }}>
              <span className="op-type">{OP_TEMPLATES[op.type].name}</span>
              <span className="op-target">→ {op.targetCountry}</span>
              <span style={{ color: "#e85d5a", fontSize: 10, fontWeight: 600 }}>EXPOSED</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActiveOpRow({ op, onAbort }: { op: CovertOperation; onAbort: (id: string) => void }) {
  const totalTicks = op.endTick - op.startTick;
  const elapsed = Math.max(0, Math.min(totalTicks, op.endTick - op.startTick));
  const pct = totalTicks > 0 ? (elapsed / totalTicks) * 100 : 0;

  return (
    <div className="covert-active-item">
      <span className="op-type">{OP_TEMPLATES[op.type].name}</span>
      <span className="op-target">→ {op.targetCountry}</span>
      <div className="op-progress">
        <div className="op-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="op-ticks">{elapsed}/{totalTicks}t</span>
      <button className="op-abort-btn" onClick={() => onAbort(op.id)}>Abort</button>
    </div>
  );
}
