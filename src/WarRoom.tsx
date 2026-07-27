// WarRoom — active conflicts widget showing ongoing wars, belligerents,
// momentum/advantage bars, and casualty estimates masked by intel level.
// Follows ADR-004 layout rules — accessible as a modal overlay.

import { useMemo } from "react";
import type { GameEvent, WorldSeed } from "./shared/types.js";

interface WarRoomProps {
  open: boolean;
  onClose: () => void;
  events: GameEvent[];
  seed: WorldSeed;
  playerCode: string;
  intelLevel: number; // 0.0 (blind) to 1.0 (perfect intel)
}

interface ConflictData {
  id: string;
  belligerents: string[];
  attackerId: string;
  defenderId: string;
  attackerWins: number;
  defenderWins: number;
  totalEngagements: number;
  attackerCasualties: number;
  defenderCasualties: number;
  momentum: number;
  attackerAdvantagePct: number;
  defenderAdvantagePct: number;
}

function getCountryName(seed: WorldSeed, code: string): string {
  return seed.countries.find((c) => c.id === code)?.name ?? code;
}

function getCountryFlag(seed: WorldSeed, code: string): string {
  const c = seed.countries.find((c) => c.id === code);
  return c ? `assets/flags/${c.id.toLowerCase()}.svg` : "";
}

export function WarRoom({ open, onClose, events, seed, playerCode, intelLevel }: WarRoomProps) {
  const conflicts = useMemo(() => {
    const combatEvents = events.filter((e) => e.type === "war.combat-resolved");
    const conflictMap = new Map<string, ConflictData>();

    for (const evt of combatEvents) {
      const attackerId = evt.attacker;
      const defenderId = evt.defender;
      const victorId = evt.victor;
      const attackerCas = evt.attackerLosses ?? 0;
      const defenderCas = evt.defenderLosses ?? 0;

      const pairId = [attackerId, defenderId].sort().join(":");

      if (!conflictMap.has(pairId)) {
        conflictMap.set(pairId, {
          id: pairId,
          belligerents: [attackerId, defenderId],
          attackerId,
          defenderId,
          attackerWins: 0,
          defenderWins: 0,
          totalEngagements: 0,
          attackerCasualties: 0,
          defenderCasualties: 0,
          momentum: 0,
          attackerAdvantagePct: 50,
          defenderAdvantagePct: 50,
        });
      }

      const conflict = conflictMap.get(pairId)!;
      conflict.totalEngagements++;
      conflict.attackerCasualties += attackerCas;
      conflict.defenderCasualties += defenderCas;
      if (victorId === attackerId) {
        conflict.attackerWins++;
      } else {
        conflict.defenderWins++;
      }
    }

    // Overlay the latest advantage-shifted data (pre-casualty balance of power)
    const advantageEvents = events.filter((e) => e.type === "war.advantage-shifted");
    for (const evt of advantageEvents) {
      const pairId = [evt.attacker, evt.defender].sort().join(":");
      const conflict = conflictMap.get(pairId);
      if (conflict) {
        conflict.momentum = evt.momentum;
        conflict.attackerAdvantagePct = evt.attackerAdvantagePct;
        conflict.defenderAdvantagePct = evt.defenderAdvantagePct;
      }
    }

    return Array.from(conflictMap.values()).sort((a, b) => b.totalEngagements - a.totalEngagements);
  }, [events]);

  function maskCasualties(casualties: number): string {
    if (casualties === 0) return "None reported";
    if (intelLevel >= 0.9) return casualties.toLocaleString();
    if (intelLevel >= 0.6) return `~${Math.round(casualties / 100) * 100}`;
    if (intelLevel >= 0.3) return `~${Math.round(casualties / 500) * 500}`;
    if (casualties < 500) return "Light";
    if (casualties < 2000) return "Moderate";
    return "Heavy";
  }

  if (!open) return null;

  return (
    <div className="war-room-overlay" onClick={onClose}>
      <div className="war-room-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="war-room-header">
          <div className="war-room-title-group">
            <span className="war-room-icon">⚔</span>
            <h2 className="war-room-title">War Room — Active Conflicts</h2>
          </div>
          <button className="war-room-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="war-room-body">
          {conflicts.length === 0 ? (
            <div className="war-room-empty">
              <span className="war-room-empty-icon">🕊</span>
              <p className="war-room-empty-title">No active conflicts</p>
              <p className="war-room-empty-sub">The world is at peace... for now.</p>
            </div>
          ) : (
            <div className="war-room-conflict-list">
              {conflicts.map((conflict) => {
                const totalWins = conflict.attackerWins + conflict.defenderWins;
                const attackerAdvantage = totalWins > 0
                  ? (conflict.attackerWins / totalWins) * 100
                  : conflict.attackerAdvantagePct;
                const defenderAdvantage = 100 - attackerAdvantage;
                const attackerFlag = getCountryFlag(seed, conflict.attackerId);
                const defenderFlag = getCountryFlag(seed, conflict.defenderId);
                const attackerName = conflict.attackerId === playerCode
                  ? "You"
                  : getCountryName(seed, conflict.attackerId);
                const defenderName = conflict.defenderId === playerCode
                  ? "You"
                  : getCountryName(seed, conflict.defenderId);
                const momentumLabel = conflict.momentum > 0.2
                  ? `${attackerName} advancing`
                  : conflict.momentum < -0.2
                  ? `${defenderName} advancing`
                  : "Stalemate";

                return (
                  <div key={conflict.id} className="war-room-conflict-card">
                    {/* Belligerents row */}
                    <div className="war-room-belligerents">
                      <div className="war-room-belligerent">
                        {attackerFlag && (
                          <img src={attackerFlag} alt="" className="war-room-flag" />
                        )}
                        <span className="war-room-belligerent-name">{attackerName}</span>
                      </div>
                      <span className="war-room-vs">vs</span>
                      <div className="war-room-belligerent">
                        {defenderFlag && (
                          <img src={defenderFlag} alt="" className="war-room-flag" />
                        )}
                        <span className="war-room-belligerent-name">{defenderName}</span>
                      </div>
                      <span className="war-room-engagements">
                        {conflict.totalEngagements} engagement{conflict.totalEngagements !== 1 ? "s" : ""}
                      </span>
                    </div>

                    {/* Momentum indicator */}
                    <div className="war-room-momentum">
                      <span className="war-room-momentum-label">Momentum</span>
                      <div className="war-room-momentum-bar">
                        <div
                          className={conflict.momentum >= 0 ? "war-room-momentum-fill war-room-momentum-attacker" : "war-room-momentum-fill war-room-momentum-defender"}
                          style={{ width: `${Math.abs(conflict.momentum) * 100}%` }}
                        />
                      </div>
                      <span className="war-room-momentum-value">{momentumLabel}</span>
                    </div>

                    {/* Advantage bar */}
                    <div className="war-room-advantage">
                      <div className="war-room-advantage-labels">
                        <span className="war-room-advantage-attacker">
                          {attackerName}: {Math.round(attackerAdvantage)}%
                        </span>
                        <span className="war-room-advantage-defender">
                          {Math.round(defenderAdvantage)}% :{defenderName}
                        </span>
                      </div>
                      <div className="war-room-bar-track">
                        <div
                          className="war-room-bar-attacker"
                          style={{ width: `${attackerAdvantage}%` }}
                        />
                        <div
                          className="war-room-bar-defender"
                          style={{ width: `${defenderAdvantage}%` }}
                        />
                      </div>
                    </div>

                    {/* Casualties */}
                    <div className="war-room-casualties">
                      <div className="war-room-casualty-item">
                        <span className="war-room-casualty-label">{attackerName} casualties</span>
                        <span className="war-room-casualty-value">
                          {maskCasualties(conflict.attackerCasualties)}
                        </span>
                      </div>
                      <div className="war-room-casualty-item">
                        <span className="war-room-casualty-label">{defenderName} casualties</span>
                        <span className="war-room-casualty-value">
                          {maskCasualties(conflict.defenderCasualties)}
                        </span>
                      </div>
                    </div>

                    {/* Intel accuracy indicator */}
                    <div className="war-room-intel">
                      <span className="war-room-intel-label">Intel accuracy</span>
                      <div className="war-room-intel-bar">
                        <div
                          className="war-room-intel-fill"
                          style={{ width: `${intelLevel * 100}%` }}
                        />
                      </div>
                      <span className="war-room-intel-pct">{Math.round(intelLevel * 100)}%</span>
                      {intelLevel < 0.5 && (
                        <span className="war-room-intel-warning">Casualty figures are estimates</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
