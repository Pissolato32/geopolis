// Advisor Agenda Engine — re-evaluates world state and player directives
// each tick, generating evolving decision cards with advisor attribution,
// competing multi-advisor proposals, treaty filtering, and policy cooldowns.

import type {
  Country,
  GameEvent,
  Relationship,
  StrictIntent,
  AdvisorSlotId,
  CabinetState,
  ActiveTreaty,
  PolicyCooldown,
  CompetingOption,
  CompetingCard,
  CardOptionEffects,
} from "../shared/types.js";
import type { AdvisorCard, AdvisorAgenda, ByodAdvisorResponse, UrgencyRating } from "./advisorTypes.js";
import {
  ADVISORS,
  ADVISOR_SLOTS,
  SLOT_ORDER,
} from "./advisorTypes.js";
import { round2 } from "../briefing/format.js";

interface AgendaInput {
  tick: number;
  player: Country;
  countries: Country[];
  events: GameEvent[];
  previousCards: AdvisorCard[];
}

function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function topTension(player: Country): Relationship | undefined {
  return [...player.relationships].sort((a, b) => b.tension - a.tension)[0];
}

function urgencyFromTension(tension: number): UrgencyRating {
  if (tension >= 70) return "critical";
  if (tension >= 45) return "high";
  return "standard";
}

function urgencyFromStability(stability: number): UrgencyRating {
  if (stability < 30) return "critical";
  if (stability < 50) return "high";
  return "standard";
}
function cardId(domain: string, tick: number, salt: number): string {
  return `${domain}-${tick}-${salt}`;
}

/** Check whether a policy type is currently on cooldown. */
export function isOnCooldown(cooldowns: PolicyCooldown[] | undefined, policyType: string, tick: number): boolean {
  if (!cooldowns) return false;
  return cooldowns.some((c) => c.policyType === policyType && c.expiresAtTick > tick);
}

/** Get active treaties for the player country. */
export function getActiveTreaties(player: Country): ActiveTreaty[] {
  return player.activeTreaties ?? [];
}

/** Check if the player already has a specific treaty kind with a target. */
export function hasTreatyKind(player: Country, targetCode: string, kind: ActiveTreaty["kind"]): boolean {
  return getActiveTreaties(player).some(
    (t) => t.kind === kind && t.parties.includes(targetCode),
  );
}

/** Find the next eligible diplomatic candidate — skips nations with existing trade pacts. */
export function findNextDiplomaticCandidate(
  player: Country,
  countries: Country[],
): { country: Country; suggestedKind: ActiveTreaty["kind"] } | null {
  const sorted = [...player.relationships]
    .filter((r) => r.affinity > 15)
    .sort((a, b) => b.affinity - a.affinity);

  for (const rel of sorted) {
    const target = countries.find((c) => c.id === rel.countryCode);
    if (!target) continue;

    const hasTrade = hasTreatyKind(player, rel.countryCode, "trade");
    const hasAlliance = hasTreatyKind(player, rel.countryCode, "alliance");
    const hasNonAgg = hasTreatyKind(player, rel.countryCode, "non-aggression");

    if (!hasTrade && rel.affinity > 25) {
      return { country: target, suggestedKind: "trade" };
    }
    if (hasTrade && !hasAlliance && rel.affinity > 50) {
      return { country: target, suggestedKind: "alliance" };
    }
    if (!hasNonAgg && rel.affinity > 10) {
      return { country: target, suggestedKind: "non-aggression" };
    }
  }
  return null;
}

/** Generate competing tax proposals from finance, treasury, and stability advisors. */
function generateCompetingTaxCard(
  player: Country,
  tick: number,
  cabinet: CabinetState | undefined,
): CompetingCard | null {
  const taxOnCooldown = isOnCooldown(player.cooldowns, "set-tax", tick);
  if (taxOnCooldown) return null;

  const currentTax = player.economy.taxRate;
  const options: CompetingOption[] = [];
  const effectsBase: CardOptionEffects = {};

  // Finance advisor — Keynesian: lower tax for growth
  if (cabinet?.finance) {
    const proposedRate = clamp(currentTax - 0.03, 0, 1);
    options.push({
      id: "comp-tax-finance",
      slotId: "finance",
      advisorName: cabinet.finance.name,
      ideology: cabinet.finance.ideology,
      objective: "Stimulate Consumer Spending & GDP Growth",
      targetKpi: "GDP Growth",
      label: `Set tax to ${(proposedRate * 100).toFixed(0)}%`,
      effects: { ...effectsBase, treasuryDelta: -Math.round(player.economy.gdp * 0.01), stabilityDelta: 2 },
      satisfactionDelta: 8,
    });
  }

  // Treasury advisor — Fiscal Conservative: moderate tax for discipline
  if (cabinet?.treasury) {
    const proposedRate = clamp(currentTax + 0.01, 0, 1);
    options.push({
      id: "comp-tax-treasury",
      slotId: "treasury",
      advisorName: cabinet.treasury.name,
      ideology: cabinet.treasury.ideology,
      objective: "Preserve Fiscal Discipline & Curb Inflation",
      targetKpi: "Treasury Balance",
      label: `Set tax to ${(proposedRate * 100).toFixed(0)}%`,
      effects: { ...effectsBase, treasuryDelta: Math.round(player.economy.gdp * 0.005), stabilityDelta: -2 },
      satisfactionDelta: 8,
    });
  }

  // Stability advisor — Social Democrat: higher tax for welfare
  if (cabinet?.stability) {
    const proposedRate = clamp(currentTax + 0.03, 0, 1);
    options.push({
      id: "comp-tax-stability",
      slotId: "stability",
      advisorName: cabinet.stability.name,
      ideology: cabinet.stability.ideology,
      objective: "Fund Public Welfare & Boost Popularity",
      targetKpi: "Public Stability",
      label: `Set tax to ${(proposedRate * 100).toFixed(0)}%`,
      effects: { ...effectsBase, treasuryDelta: Math.round(player.economy.gdp * 0.01), stabilityDelta: 4, legislativeSupportDelta: 0.05 },
      satisfactionDelta: 8,
    });
  }

  if (options.length < 2) return null;

  return {
    id: cardId("competing-tax", tick, 1),
    title: "Tax Rate Policy — Competing Council Proposals",
    description: `Current tax rate: ${(currentTax * 100).toFixed(0)}%. Your advisors disagree on the optimal fiscal path. Choose a proposal to implement.`,
    category: "Economy",
    kpiTrigger: "Tax Rate Policy",
    options,
    tickCreated: tick,
  };
}

/** Generate competing readiness proposals from defense, treasury, and stability. */
function generateCompetingReadinessCard(
  player: Country,
  threat: Relationship | undefined,
  tick: number,
  cabinet: CabinetState | undefined,
): CompetingCard | null {
  if (isOnCooldown(player.cooldowns, "set-readiness", tick)) return null;
  if (!threat || threat.tension < 40) return null;

  const currentReadiness = player.military.readiness;
  const options: CompetingOption[] = [];

  if (cabinet?.defense) {
    const proposed = clamp(currentReadiness + 15, 10, 100);
    options.push({
      id: "comp-ready-defense",
      slotId: "defense",
      advisorName: cabinet.defense.name,
      ideology: cabinet.defense.ideology,
      objective: "Maximize Military Deterrence",
      targetKpi: "Military Readiness",
      label: `Raise readiness to ${proposed.toFixed(0)}%`,
      effects: { readinessDelta: 15, treasuryDelta: -300 },
      satisfactionDelta: 8,
    });
  }

  if (cabinet?.treasury) {
    const proposed = clamp(currentReadiness + 5, 10, 100);
    options.push({
      id: "comp-ready-treasury",
      slotId: "treasury",
      advisorName: cabinet.treasury.name,
      ideology: cabinet.treasury.ideology,
      objective: "Measured Readiness Within Budget",
      targetKpi: "Fiscal Balance",
      label: `Raise readiness to ${proposed.toFixed(0)}%`,
      effects: { readinessDelta: 5, treasuryDelta: -100 },
      satisfactionDelta: 8,
    });
  }

  if (cabinet?.stability) {
    const proposed = clamp(currentReadiness - 5, 10, 100);
    options.push({
      id: "comp-ready-stability",
      slotId: "stability",
      advisorName: cabinet.stability.name,
      ideology: cabinet.stability.ideology,
      objective: "Reduce Military Posture to Ease Tension",
      targetKpi: "Public Stability",
      label: `Lower readiness to ${proposed.toFixed(0)}%`,
      effects: { readinessDelta: -5, stabilityDelta: 3 },
      satisfactionDelta: 8,
    });
  }

  if (options.length < 2) return null;

  return {
    id: cardId("competing-readiness", tick, 1),
    title: "Military Readiness — Competing Council Proposals",
    description: `Border tension with ${threat.countryCode} at ${threat.tension}. Your advisors propose different readiness levels.`,
    category: "Defense",
    kpiTrigger: "Border Tension",
    options,
    tickCreated: tick,
  };
}

/** Generate competing treasury/deficit proposals. */
function generateCompetingDeficitCard(
  player: Country,
  tick: number,
  cabinet: CabinetState | undefined,
): CompetingCard | null {
  if (player.economy.treasury >= 0) return null;

  const options: CompetingOption[] = [];

  if (cabinet?.treasury) {
    options.push({
      id: "comp-deficit-treasury",
      slotId: "treasury",
      advisorName: cabinet.treasury.name,
      ideology: cabinet.treasury.ideology,
      objective: "Austerity to Eliminate Deficit",
      targetKpi: "Treasury Balance",
      label: "Implement Austerity Measures",
      effects: { treasuryDelta: 800, stabilityDelta: -10, legislativeSupportDelta: -0.1 },
      satisfactionDelta: 8,
    });
  }

  if (cabinet?.finance) {
    options.push({
      id: "comp-deficit-finance",
      slotId: "finance",
      advisorName: cabinet.finance.name,
      ideology: cabinet.finance.ideology,
      objective: "Growth-Focused Stimulus Borrowing",
      targetKpi: "GDP Growth",
      label: "Issue Infrastructure Bonds",
      effects: { treasuryDelta: 1200, stabilityDelta: -3, tensionDelta: 5 },
      satisfactionDelta: 8,
    });
  }

  if (cabinet?.stability) {
    options.push({
      id: "comp-deficit-stability",
      slotId: "stability",
      advisorName: cabinet.stability.name,
      ideology: cabinet.stability.ideology,
      objective: "Protect Welfare Programs",
      targetKpi: "Public Stability",
      label: "Negotiate Debt Restructuring",
      effects: { treasuryDelta: 500, stabilityDelta: 5, legislativeSupportDelta: 0.1 },
      satisfactionDelta: 8,
    });
  }

  if (options.length < 2) return null;

  return {
    id: cardId("competing-deficit", tick, 1),
    title: "Treasury Deficit — Competing Council Proposals",
    description: `National treasury in deficit at ${fmtMoney(player.economy.treasury)}. Advisors propose different fiscal responses.`,
    category: "Economy",
    kpiTrigger: "Treasury Deficit",
    options,
    tickCreated: tick,
  };
}

/** Generate the advisor agenda for the current tick. */
export function generateAdvisorAgenda(input: AgendaInput): AdvisorAgenda {
  const { tick, player, countries, events, previousCards } = input;
  const cards: AdvisorCard[] = [];
  const competingCards: CompetingCard[] = [];
  const cabinet = player.cabinet;
  const turnEvents = events.filter((e) => {
    if ("tick" in e && typeof e.tick === "number") return e.tick === tick;
    return false;
  });

  // Identify vacant slots
  const vacantSlots: AdvisorSlotId[] = SLOT_ORDER.filter((s) => !cabinet?.[s]);

  // --- COMPETING PROPOSALS (Step 2) ---
  // Tax policy competing card (suppressed during cooldown)
  const taxCard = generateCompetingTaxCard(player, tick, cabinet);
  if (taxCard) competingCards.push(taxCard);

  // Readiness competing card (only when tension is high)
  const threat = topTension(player);
  const readinessCard = generateCompetingReadinessCard(player, threat, tick, cabinet);
  if (readinessCard) competingCards.push(readinessCard);

  // Deficit competing card
  const deficitCard = generateCompetingDeficitCard(player, tick, cabinet);
  if (deficitCard) competingCards.push(deficitCard);

  // --- SINGLE-ADVISOR CARDS (existing logic, gated by vacant slots) ---

  // --- DEFENSE ADVISOR ---
  if (cabinet?.defense) {
    const warEvents = turnEvents.filter((e) => e.type === "war.declared");
    const defenseUrgency = threat
      ? warEvents.length > 0
        ? "critical"
        : urgencyFromTension(threat.tension)
      : "standard";

    if (threat && threat.tension >= 35) {
      const target = countries.find((c) => c.id === threat.countryCode);
      const newReadiness = clamp(player.military.readiness + 10, 0, 100);
      const existing = previousCards.find(
        (c) => c.advisorDomain === "defense" && c.intent?.intent === "set-readiness" && c.persistent,
      );
      cards.push({
        id: existing?.id ?? cardId("defense", tick, 1),
        advisorDomain: "defense",
        advisorName: cabinet.defense.name,
        rationale: `${cabinet.defense.name} considers this ${defenseUrgency === "critical" ? "urgent" : "pressing"} due to rising border tension with ${target?.name ?? threat.countryCode} (tension: ${threat.tension}).`,
        urgency: defenseUrgency,
        title: existing
          ? `Escalating Threat from ${target?.name ?? threat.countryCode}`
          : `Elevate Readiness Against ${target?.name ?? threat.countryCode}`,
        description: `${cabinet.defense.name} recommends raising military readiness to ${round2(newReadiness)}% to project deterrence. Current tension at ${threat.tension} points demands a defensive posture.`,
        estimatedCost: `Fiscal: ${fmtMoney(player.economy.gdp * 0.01)} · Morale: -5%`,
        projectedImpact: "Reduces aggression risk. May escalate bilateral tension.",
        intent: { intent: "set-readiness", from: player.id, level: round2(newReadiness) },
        tickCreated: existing?.tickCreated ?? tick,
        persistent: threat.tension >= 60,
        followUpFor: existing?.id,
      });
    }
  }

  // --- ECONOMY ADVISOR (legacy domain, maps to finance slot) ---
  if (cabinet?.finance) {
    const econUrgency = urgencyFromStability(player.economy.stability);
    const higherTax = clamp(player.economy.taxRate + 0.02, 0, 1);
    const lowerTax = clamp(player.economy.taxRate - 0.02, 0, 1);

    if (player.economy.stability < 55) {
      const existing = previousCards.find(
        (c) => c.advisorDomain === "economy" && c.intent?.intent === "set-tax" && c.persistent,
      );
      // Skip if we already have a competing tax card
      if (!taxCard) {
        cards.push({
          id: existing?.id ?? cardId("economy", tick, 1),
          advisorDomain: "economy",
          advisorName: cabinet.finance.name,
          rationale: `${cabinet.finance.name} warns that economic stability at ${round2(player.economy.stability)}% is ${econUrgency === "critical" ? "critically low" : "below healthy levels"}. Fiscal action needed.`,
          urgency: econUrgency,
          title: existing ? `Persistent Economic Instability (${round2(player.economy.stability)}%)` : "Fiscal Consolidation Package",
          description: `${cabinet.finance.name} recommends raising the tax rate to ${round2(higherTax * 100)}% to shore up treasury reserves. Current stability at ${round2(player.economy.stability)}%.`,
          estimatedCost: `Revenue gain: ${fmtMoney(player.economy.gdp * 0.02)} · Stability: -3%`,
          projectedImpact: "Treasury reinforced. Moderate public pressure expected.",
          intent: { intent: "set-tax", from: player.id, rate: round2(higherTax) },
          tickCreated: existing?.tickCreated ?? tick,
          persistent: player.economy.stability < 40,
          followUpFor: existing?.id,
        });
      }
    } else if (!taxCard) {
      cards.push({
        id: cardId("economy", tick, 1),
        advisorDomain: "economy",
        advisorName: cabinet.finance.name,
        rationale: `${cabinet.finance.name} notes the economy is stable at ${round2(player.economy.stability)}%. A tax reduction could stimulate growth.`,
        urgency: "standard",
        title: "Growth Stimulus via Tax Reduction",
        description: `Lower the tax rate to ${round2(lowerTax * 100)}% to boost consumer spending and GDP growth. Stability is healthy enough to absorb the revenue reduction.`,
        estimatedCost: `Revenue loss: ${fmtMoney(player.economy.gdp * 0.02)} · Approval: +4%`,
        projectedImpact: "Short-term GDP boost. Treasury drain requires monitoring.",
        intent: { intent: "set-tax", from: player.id, rate: round2(lowerTax) },
        tickCreated: tick,
        persistent: false,
      });
    }
  }

  // --- FOREIGN AFFAIRS ADVISOR (with active treaty filtering — Step 4) ---
  if (cabinet?.foreign) {
    // Use treaty-aware candidate selection
    const diploCandidate = findNextDiplomaticCandidate(player, countries);
    if (diploCandidate) {
      const { country: target, suggestedKind } = diploCandidate;
      const treatyLabels: Record<ActiveTreaty["kind"], string> = {
        trade: "Trade Agreement",
        alliance: "Mutual Defense Pact",
        "non-aggression": "Non-Aggression Pact",
      };
      const intentMap: Record<ActiveTreaty["kind"], StrictIntent> = {
        trade: { intent: "propose-trade", from: player.id, target: target.id },
        alliance: { intent: "improve-relations", from: player.id, target: target.id },
        "non-aggression": { intent: "improve-relations", from: player.id, target: target.id },
      };
      const rel = player.relationships.find((r) => r.countryCode === target.id);
      cards.push({
        id: cardId("foreign", tick, 1),
        advisorDomain: "foreign",
        advisorName: cabinet.foreign.name,
        rationale: `${cabinet.foreign.name} identifies an opportunity to deepen ties with ${target.name} (affinity: +${rel?.affinity ?? 0}). No existing ${treatyLabels[suggestedKind]} in place.`,
        urgency: (rel?.affinity ?? 0) > 60 ? "high" : "standard",
        title: `${treatyLabels[suggestedKind]} with ${target.name}`,
        description: `${cabinet.foreign.name} recommends formalizing a ${treatyLabels[suggestedKind].toLowerCase()} to strengthen the bilateral relationship and boost GDP.`,
        estimatedCost: "Fiscal: minimal · Diplomatic: medium",
        projectedImpact: "Bilateral GDP lift. Strengthens strategic alliance.",
        intent: intentMap[suggestedKind],
        tickCreated: tick,
        persistent: false,
      });
    }

    if (threat && threat.tension >= 50) {
      const target = countries.find((c) => c.id === threat.countryCode);
      cards.push({
        id: cardId("foreign", tick, 2),
        advisorDomain: "foreign",
        advisorName: cabinet.foreign.name,
        rationale: `${cabinet.foreign.name} urges diplomatic engagement with ${target?.name ?? threat.countryCode} to de-escalate before the situation spirals.`,
        urgency: threat.tension >= 70 ? "critical" : "high",
        title: `Diplomatic De-escalation with ${target?.name ?? threat.countryCode}`,
        description: `Open back-channel talks to reduce tension from ${threat.tension} points. ${cabinet.foreign.name} advises this alongside any military readiness changes.`,
        estimatedCost: "Diplomatic capital · low fiscal",
        projectedImpact: "Tension reduction in 60% of cases. Risk: adversary may perceive as weakness.",
        tickCreated: tick,
        persistent: threat.tension >= 60,
      });
    }
  }

  // --- INTELLIGENCE ADVISOR (legacy — mapped to defense slot for vacancy) ---
  if (cabinet?.defense) {
    const intelEvents = turnEvents.filter((e) => e.type === "intel.gathered" || e.type === "sabotage.executed");
    if (threat && threat.tension >= 40 && !isOnCooldown(player.cooldowns, "gather-intel", tick)) {
      const target = countries.find((c) => c.id === threat.countryCode);
      cards.push({
        id: cardId("intel", tick, 1),
        advisorDomain: "intelligence",
        advisorName: ADVISORS.intelligence.name,
        rationale: `Reconnaissance on ${target?.name ?? threat.countryCode} recommended given elevated tension. Intelligence gaps are operationally dangerous.`,
        urgency: threat.tension >= 65 ? "high" : "standard",
        title: `Reconnaissance on ${target?.name ?? threat.countryCode}`,
        description: `Deploy intelligence assets to gather data on military posture and economic stability. Current intel level is insufficient for informed decision-making.`,
        estimatedCost: `Fiscal: ${fmtMoney(200)}`,
        projectedImpact: "Reveals target readiness, morale, and economic health.",
        intent: { intent: "conduct-recon", from: player.id, target: threat.countryCode, cost: 200 },
        tickCreated: tick,
        persistent: false,
      });
    }

    if (intelEvents.length > 0) {
      cards.push({
        id: cardId("intel", tick, 2),
        advisorDomain: "intelligence",
        advisorName: ADVISORS.intelligence.name,
        rationale: `${intelEvents.length} active operation(s) this turn. Data is being processed.`,
        urgency: "standard",
        title: "Intel Operations Update",
        description: `${intelEvents.length} intelligence event(s) recorded. Review the Intel tab for details.`,
        estimatedCost: "None",
        projectedImpact: "Improved situational awareness.",
        tickCreated: tick,
        persistent: false,
      });
    }
  }

  // Carry forward persistent unaddressed cards that weren't regenerated
  for (const prev of previousCards) {
    if (prev.persistent && !cards.some((c) => c.followUpFor === prev.id || c.id === prev.id)) {
      cards.push({
        ...prev,
        rationale: `${prev.advisorName} flags this as an ongoing crisis that remains unaddressed.`,
        urgency: prev.urgency === "standard" ? "high" : prev.urgency,
      });
    }
  }

  // Sort by urgency: critical > high > standard
  const urgencyOrder: Record<UrgencyRating, number> = { critical: 0, high: 1, standard: 2 };
  cards.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  const criticalCount = cards.filter((c) => c.urgency === "critical").length;
  const highCount = cards.filter((c) => c.urgency === "high").length;
  const vacantCount = vacantSlots.length;

  let councilSummary: string;
  if (vacantCount > 0) {
    const vacantLabels = vacantSlots.map((s) => ADVISOR_SLOTS[s].label);
    councilSummary = `${vacantCount} cabinet post(s) vacant: ${vacantLabels.join(", ")}. `;
  } else {
    councilSummary = "";
  }
  councilSummary += criticalCount > 0
    ? `${criticalCount} critical item(s) require immediate attention. ${highCount} high-priority item(s) pending.`
    : highCount > 0
      ? `${highCount} high-priority item(s) on the council agenda. No critical crises detected.`
      : "The council reports no urgent items. Standard routine operations recommended.";

  if (competingCards.length > 0) {
    councilSummary += ` ${competingCards.length} competing proposal(s) await your decision.`;
  }

  return { cards, competingCards, councilSummary, vacantSlots };
}

/** Evaluate a player's freeform BYOD directive and generate advisor responses. */
export function evaluateDirectiveByAdvisors(
  text: string,
  player: Country,
  _countries: Country[],
): ByodAdvisorResponse[] {
  const responses: ByodAdvisorResponse[] = [];
  const lower = text.toLowerCase();
  const threat = topTension(player);
  const cabinet = player.cabinet;

  // Defense advisor
  if (cabinet?.defense && /milit|war|readiness|deploy|arm|border|threat|invas/i.test(lower)) {
    const supports = !/stand.?down|reduce|withdraw|retreat|peace|cease/i.test(lower);
    responses.push({
      advisorDomain: "defense",
      advisorName: cabinet.defense.name,
      recommendation: supports
        ? `${cabinet.defense.name} concurs with the military emphasis. Current readiness at ${round2(player.military.readiness)}%.`
        : `${cabinet.defense.name} cautions against de-escalation given threat levels at ${threat?.tension ?? 0}%.`,
      counterProposal: supports
        ? "Recommend coupling readiness surge with intel gathering on the target."
        : "If standing down, ensure diplomatic channels are opened simultaneously to avoid appearing weak.",
      supportsDirective: supports,
      urgency: threat && threat.tension >= 60 ? "critical" : "high",
    });
  }

  // Economy advisor (finance slot)
  if (cabinet?.finance && /tax|econ|tariff|trade|gdp|fiscal|sanction|embargo|budget/i.test(lower)) {
    const isRestrictive = /sanction|embargo|tariff|restrict|protect/i.test(lower);
    responses.push({
      advisorDomain: "economy",
      advisorName: cabinet.finance.name,
      recommendation: isRestrictive
        ? `${cabinet.finance.name} warns that restrictive economic measures at stability ${round2(player.economy.stability)}% may compound fiscal stress.`
        : `${cabinet.finance.name} supports the economic initiative. Current GDP: ${fmtMoney(player.economy.gdp)}.`,
      counterProposal: isRestrictive
        ? "Recommend phased implementation with quarterly reviews to limit collateral economic damage."
        : "Recommend pairing with a trade pact to maximize GDP uplift.",
      supportsDirective: !isRestrictive || player.economy.stability > 50,
      urgency: isRestrictive && player.economy.stability < 40 ? "critical" : "standard",
    });
  }

  // Foreign affairs advisor
  if (cabinet?.foreign && /diplomat|treaty|allian|relation|negotiat|peace|talk/i.test(lower)) {
    responses.push({
      advisorDomain: "foreign",
      advisorName: cabinet.foreign.name,
      recommendation: `${cabinet.foreign.name} supports diplomatic engagement. Current posture: ${player.posture}.`,
      counterProposal: "Recommend a confidence-building measure (aid or cultural exchange) alongside formal talks.",
      supportsDirective: true,
      urgency: threat && threat.tension >= 60 ? "high" : "standard",
    });
  }

  // Intelligence advisor (mapped to defense slot)
  if (cabinet?.defense && /intel|spy|recon|surveill|infiltrat|sabotag|covert/i.test(lower)) {
    responses.push({
      advisorDomain: "intelligence",
      advisorName: ADVISORS.intelligence.name,
      recommendation: `${ADVISORS.intelligence.name} endorses the intelligence operation. Covert assets are available.`,
      counterProposal: "Recommend a low-cost recon pass first before committing to more aggressive operations.",
      supportsDirective: true,
      urgency: "standard",
    });
  }

  // Treasury advisor
  if (cabinet?.treasury && /deficit|debt|treasury|spend|budget|austerity/i.test(lower)) {
    responses.push({
      advisorDomain: "economy",
      advisorName: cabinet.treasury.name,
      recommendation: `${cabinet.treasury.name} notes fiscal implications. Current treasury: ${fmtMoney(player.economy.treasury)}.`,
      counterProposal: "Recommend tracking deficit-to-GDP ratio quarterly and adjusting spending caps accordingly.",
      supportsDirective: !/spend|stimulus|borrow/i.test(lower) || player.economy.treasury > 0,
      urgency: player.economy.treasury < 0 ? "critical" : "standard",
    });
  }

  // Stability advisor
  if (cabinet?.stability && /welfare|popular|stability|protest|unrest|social|public/i.test(lower)) {
    responses.push({
      advisorDomain: "foreign",
      advisorName: cabinet.stability.name,
      recommendation: `${cabinet.stability.name} emphasizes domestic stability. Current stability: ${round2(player.economy.stability)}%.`,
      counterProposal: "Recommend pairing social spending with legislative engagement to maximize approval.",
      supportsDirective: true,
      urgency: player.economy.stability < 40 ? "high" : "standard",
    });
  }

  if (responses.length === 0) {
    const fallbackName = cabinet?.foreign?.name ?? ADVISORS.foreign.name;
    responses.push({
      advisorDomain: "foreign",
      advisorName: fallbackName,
      recommendation: `${fallbackName} notes the directive but cannot map it to a specific council domain. Recommends clarifying the strategic objective.`,
      counterProposal: "Consider rephrasing with keywords like 'military', 'economy', 'diplomacy', or 'intelligence' for targeted council input.",
      supportsDirective: false,
      urgency: "standard",
    });
  }

  return responses;
}

/** Get the intent for a competing option (maps to a StrictIntent). */
export function competingOptionToIntent(
  option: CompetingOption,
  playerCode: string,
): StrictIntent | null {
  if (option.slotId === "finance" || option.slotId === "treasury" || option.slotId === "stability") {
    // Tax proposals — parse rate from label
    const match = option.label.match(/(\d+)%/);
    if (match) {
      return { intent: "set-tax", from: playerCode, rate: parseInt(match[1]!, 10) / 100 };
    }
  }
  if (option.slotId === "defense") {
    const match = option.label.match(/readiness to (\d+)/);
    if (match) {
      return { intent: "set-readiness", from: playerCode, level: parseInt(match[1]!, 10) };
    }
  }
  return null;
}

/** Alternative policy suggestions when a cooldown is active. */
export function getAlternativeDirectives(policyType: string): string[] {
  if (policyType === "set-tax") {
    return ["Industrial Subsidies", "Infrastructure Investments", "Inflation Defense"];
  }
  if (policyType === "set-readiness") {
    return ["Diplomatic Back-Channel", "Border Patrol Surge", "Civil Defense Drill"];
  }
  return [];
}
