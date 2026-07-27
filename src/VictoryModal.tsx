// VictoryModal — shows real-time percentage progress toward each victory condition.
// Accessible from the header bar.

import type { VictoryProgress, VictoryType } from "./shared/types.js";
import { VICTORY_META } from "./victory/victoryManager.js";

interface Props {
  progress: VictoryProgress | null;
  onClose: () => void;
}

export function VictoryModal({ progress, onClose }: Props) {
  if (!progress) return null;

  const conditions: Array<{ type: VictoryType; pct: number; detail: string }> = [
    {
      type: "hegemonic",
      pct: progress.hegemonic.overallPct,
      detail: `GDP: ${progress.hegemonic.gdpControlPct}% · Military: ${progress.hegemonic.militaryControlPct}% (need 50%)`,
    },
    {
      type: "tech_supremacy",
      pct: progress.techSupremacy.overallPct,
      detail: `${progress.techSupremacy.tier3Unlocked}/3 Tier 3 techs unlocked`,
    },
    {
      type: "pax",
      pct: progress.pax.overallPct,
      detail: `${progress.pax.consecutiveLowTensionTicks}/${progress.pax.requiredTicks} low-tension ticks · Alliances: ${progress.pax.hasActiveAlliances ? "Active" : "None"}`,
    },
    {
      type: "survival",
      pct: progress.survival.overallPct,
      detail: `${progress.survival.scenarioTicksElapsed}/${progress.survival.scenarioTicksRequired} ticks · Gov: ${progress.survival.governmentIntact ? "Stable" : "Critical"} · Capital: ${progress.survival.capitalHeld ? "Held" : "Lost"}`,
    },
  ];

  return (
    <div className="victory-modal-overlay" onClick={onClose}>
      <div className="victory-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div className="victory-modal-title">Campaign Status &amp; Victory Progress</div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", color: "var(--text-faint)",
              fontSize: 18, cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {progress.achieved && (
          <div style={{
            padding: "12px 16px",
            background: "rgba(90,208,122,0.1)",
            border: "1px solid rgba(90,208,122,0.3)",
            borderRadius: 8,
            marginBottom: 16,
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#5ad07a" }}>
              VICTORY ACHIEVED: {VICTORY_META[progress.achieved].label}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
              {VICTORY_META[progress.achieved].description}
            </div>
          </div>
        )}

        {conditions.map((cond) => {
          const meta = VICTORY_META[cond.type];
          return (
            <div key={cond.type} className="victory-condition-card">
              <div className="victory-condition-header">
                <span className="victory-condition-name">{meta.label}</span>
                <span className="victory-condition-pct">{cond.pct.toFixed(1)}%</span>
              </div>
              <p className="victory-condition-desc">{meta.description}</p>
              <div className="victory-condition-bar">
                <div
                  className={`victory-condition-fill ${cond.type === "hegemonic" ? "hegemonic" : cond.type === "tech_supremacy" ? "tech" : cond.type === "pax" ? "pax" : "survival"}`}
                  style={{ width: `${Math.min(100, cond.pct)}%` }}
                />
              </div>
              <div style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "var(--mono)", marginTop: 6 }}>
                {cond.detail}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
