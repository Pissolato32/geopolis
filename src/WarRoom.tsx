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
  alliedBlocs: string[];
  attackerId: string;
  defenderId: string;
  attackerWins: number;
  defenderWins: number;
  totalEngagements: number;
  attackerCasualties: number;
  defenderCasualties: number;
  lastTick: number;
}

function getCountryName(seed: WorldSeed, code: string): string {
  return seed.countries.find((c) => c.id === code)?.name ?? code;
}

function getCountryFlag(seed: WorldSeed, code: string): string {
  const c = seed.countries.find((c) => c.id === code);
  return c ? `assets/flags/${c.id.toLowerCase()}.svg` : "";
}

export function WarRoom({ open, onClose, events, seed, playerCode, intelLevel }: WarRoomProps) {
  // Parse combat-resolved events to build conflict list
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
          alliedBlocs: [],
          attackerId,
          defenderId,
          attackerWins: 0,
          defenderWins: 0,
          totalEngagements: 0,
          attackerCasualties: 0,
          defenderCasualties: 0,
          lastTick: 0,
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

    return Array.from(conflictMap.values()).sort((a, b) => b.totalEngagements - a.totalEngagements);
  }, [events]);

  // Mask casualty numbers based on intel level
  function maskCasualties(casualties: number): string {
    if (casualties === 0) return "None reported";
    if (intelLevel >= 0.9) return casualties.toLocaleString();
    if (intelLevel >= 0.6) {
      // Approximate to nearest 100
      return `~${Math.round(casualties / 100) * 100}`;
    }
    if (intelLevel >= 0.3) {
      // Approximate to nearest 500
      return `~${Math.round(casualties / 500) * 500}`;
    }
    // Very low intel — just show a vague category
    if (casualties < 500) return "Light";
    if (casualties < 2000) return "Moderate";
    return "Heavy";
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[80vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-700 bg-slate-900/95 px-6 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚔️</span>
            <h2 className="text-xl font-bold text-slate-100">War Room — Active Conflicts</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            Close
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {conflicts.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <span className="block text-4xl mb-3">🕊️</span>
              <p className="text-lg font-medium">No active conflicts</p>
              <p className="text-sm mt-1">The world is at peace... for now.</p>
            </div>
          ) : (
            conflicts.map((conflict) => {
              const totalWins = conflict.attackerWins + conflict.defenderWins;
              const attackerAdvantage = totalWins > 0
                ? (conflict.attackerWins / totalWins) * 100
                : 50;
              const defenderAdvantage = 100 - attackerAdvantage;

              return (
                <div
                  key={conflict.id}
                  className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 space-y-3"
                >
                  {/* Belligerents header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getCountryFlag(seed, conflict.attackerId) && (
                        <img
                          src={getCountryFlag(seed, conflict.attackerId)}
                          alt=""
                          className="w-6 h-4 rounded-sm object-cover"
                        />
                      )}
                      <span className="font-semibold text-slate-200">
                        {getCountryName(seed, conflict.attackerId)}
                      </span>
                      <span className="text-slate-500 text-sm">vs</span>
                      {getCountryFlag(seed, conflict.defenderId) && (
                        <img
                          src={getCountryFlag(seed, conflict.defenderId)}
                          alt=""
                          className="w-6 h-4 rounded-sm object-cover"
                        />
                      )}
                      <span className="font-semibold text-slate-200">
                        {getCountryName(seed, conflict.defenderId)}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">
                      {conflict.totalEngagements} engagement{conflict.totalEngagements !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Momentum / Advantage bar */}
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-red-400 font-medium">
                        {conflict.attackerId === playerCode ? "You" : getCountryName(seed, conflict.attackerId)}
                        : {Math.round(attackerAdvantage)}%
                      </span>
                      <span className="text-blue-400 font-medium">
                        {Math.round(defenderAdvantage)}% :{conflict.defenderId === playerCode ? "You" : getCountryName(seed, conflict.defenderId)}
                      </span>
                    </div>
                    <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-700">
                      <div
                        className="bg-gradient-to-r from-red-600 to-red-500 transition-all duration-500"
                        style={{ width: `${attackerAdvantage}%` }}
                      />
                      <div
                        className="bg-gradient-to-l from-blue-600 to-blue-500 transition-all duration-500"
                        style={{ width: `${defenderAdvantage}%` }}
                      />
                    </div>
                  </div>

                  {/* Casualties (masked by intel) */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">Casualties:</span>
                      <span className="text-slate-300 font-medium">
                        {maskCasualties(conflict.attackerCasualties)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">Casualties:</span>
                      <span className="text-slate-300 font-medium">
                        {maskCasualties(conflict.defenderCasualties)}
                      </span>
                    </div>
                  </div>

                  {/* Intel level indicator */}
                  <div className="flex items-center gap-2 text-xs text-slate-500 border-t border-slate-700/50 pt-2">
                    <span>Intel accuracy:</span>
                    <div className="flex h-1.5 w-24 overflow-hidden rounded-full bg-slate-700">
                      <div
                        className="bg-emerald-500 transition-all"
                        style={{ width: `${intelLevel * 100}%` }}
                      />
                    </div>
                    <span>{Math.round(intelLevel * 100)}%</span>
                    {intelLevel < 0.5 && (
                      <span className="text-amber-500 ml-2">⚠ Casualty figures are estimates</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
