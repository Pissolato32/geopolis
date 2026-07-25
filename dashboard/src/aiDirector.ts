import type { Country, GameEvent } from "./shared/types.js";

export interface AIDecisionResult {
  events: GameEvent[];
  updatedCountries: Country[];
}

export function runAIDirector(
  countries: Country[],
  playerCountryCode: string,
): AIDecisionResult {
  const events: GameEvent[] = [];
  const at = new Date().toISOString();
  const updatedCountries = countries.map((c) => ({ ...c, economy: { ...c.economy }, military: { ...c.military } }));

  // Pick ~15% of non-player nations to make active strategic decisions
  const eligible = updatedCountries.filter((c) => c.id !== playerCountryCode);
  const sampleCount = Math.max(1, Math.floor(eligible.length * 0.15));
  const activeSample = pickRandomSample(eligible, sampleCount);

  for (const nation of activeSample) {
    const powerScore = nation.military.totalPersonnel * (nation.military.readiness / 100) + (nation.economy.gdp / 1e10) * (nation.economy.stability / 100);

    // Strategy 1: Low stability -> Mobilize Military
    if (nation.economy.stability < 35 && Math.random() < 0.6) {
      nation.military.readiness = Math.min(100, nation.military.readiness + 10);
      nation.military.morale = Math.max(20, nation.military.morale - 5);
      events.push({
        type: "ai.decision",
        at,
        country: nation.id,
        action: "Mobilização Tática",
        rationale: `Estabilidade baixa (${nation.economy.stability}/100); estado de prontidão elevado para ${nation.military.readiness}%.`,
      });
      continue;
    }

    // Strategy 2: Check high tension rivals -> Declare War or Sue for Peace
    const highTensionRel = nation.relationships.find((r) => r.tension >= 75);
    if (highTensionRel) {
      const rival = updatedCountries.find((c) => c.id === highTensionRel.countryCode);
      if (rival) {
        const rivalPower = rival.military.totalPersonnel * (rival.military.readiness / 100) + (rival.economy.gdp / 1e10);

        if (powerScore > rivalPower * 1.3 && Math.random() < 0.4) {
          // Declare War
          highTensionRel.tension = 100;
          highTensionRel.affinity = -100;
          events.push({
            type: "war.declared",
            at,
            aggressor: nation.id,
            target: rival.id,
            reason: `Superioridade militar estratégica (Poder ${powerScore.toFixed(0)} vs ${rivalPower.toFixed(0)}).`,
          });
          continue;
        } else if (powerScore < rivalPower * 0.7 && Math.random() < 0.5) {
          // Sue for Peace
          highTensionRel.tension = Math.max(20, highTensionRel.tension - 40);
          events.push({
            type: "peace.declared",
            at,
            initiator: nation.id,
            target: rival.id,
            terms: "Armistício de não-agressão e redução de tensões de fronteira.",
          });
          continue;
        }
      }
    }

    // Strategy 3: Prosperous & Stable -> Improve Relations or Sign Trade Treaty
    if (nation.economy.stability >= 60 && nation.economy.treasury > 1e10) {
      const friendlyRel = nation.relationships.find((r) => r.affinity >= 30);
      if (friendlyRel && Math.random() < 0.5) {
        friendlyRel.affinity = Math.min(100, friendlyRel.affinity + 15);
        friendlyRel.tension = Math.max(0, friendlyRel.tension - 10);
        events.push({
          type: "ai.decision",
          at,
          country: nation.id,
          action: "Aproximação Diplomática",
          rationale: `Expansão de parcerias com ${friendlyRel.countryCode} (Afinidade: ${friendlyRel.affinity}).`,
        });
        continue;
      }
    }
  }

  return { events, updatedCountries };
}

function pickRandomSample<T>(arr: T[], count: number): T[] {
  const shuffled = arr.slice().sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}
