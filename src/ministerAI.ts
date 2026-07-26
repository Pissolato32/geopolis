// ministerAI — when the player delegates a cabinet card, this module selects
// the option that best matches the player's current diplomatic posture.

import type { CabinetCard, CardOption, DiplomaticPosture } from "./shared/types.js";

const POSTURE_PRIORITIES: Record<DiplomaticPosture, string[]> = {
  assertive: ["crackdown", "crackdown-on-dissent", "executive-order", "mobilize", "austerity-cut"],
  diplomatic: ["negotiate", "negotiate-with-oligarchs", "international-loan", "concessions", "concessions-to-junta"],
  isolationist: ["austerity-cut", "executive-order", "concessions-to-junta"],
  expansionist: ["crackdown", "executive-order", "mobilize", "international-loan"],
};

export function selectOptionForPosture(
  card: CabinetCard,
  posture: DiplomaticPosture,
): CardOption {
  const priorities = POSTURE_PRIORITIES[posture] ?? [];
  for (const keyword of priorities) {
    const match = card.options.find(
      (o) => o.id.includes(keyword) || o.label.toLowerCase().includes(keyword.replace(/-/g, " ")),
    );
    if (match) return match;
  }
  return card.options[0] ?? { id: "default", label: "Maintain course", effects: {} };
}
