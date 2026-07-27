// Advisor Agenda Engine — re-evaluates world state and player directives
// each tick, generating evolving decision cards with advisor attribution,
// urgency ratings, and persistence logic for unaddressed crises.

import type { Country, GameEvent, Relationship } from "../shared/types.js";
import type { AdvisorCard, AdvisorAgenda, ByodAdvisorResponse, UrgencyRating } from "./advisorTypes.js";
import { ADVISORS } from "./advisorTypes.js";
import { round2 } from "../briefing/format.js";

interface AgendaInput {
  tick: number;
  player: Country;
  countries: Country[];
  events: GameEvent[];
  previousCards: AdvisorCard[];
  lastDirectiveText?: string;
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

function topAlly(player: Country): Relationship | undefined {
  return [...player.relationships].sort((a, b) => b.affinity - a.affinity)[0];
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

/** Generate the advisor agenda for the current tick. */
export function generateAdvisorAgenda(input: AgendaInput): AdvisorAgenda {
  const { tick, player, countries, events, previousCards } = input;
  const cards: AdvisorCard[] = [];
  const turnEvents = events.filter((e) => {
    if ("tick" in e && typeof e.tick === "number") return e.tick === tick;
    return false;
  });

  // --- DEFENSE ADVISOR ---
  const threat = topTension(player);
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
      advisorName: ADVISORS.defense.name,
      rationale: `${ADVISORS.defense.name} considers this ${defenseUrgency === "critical" ? "urgent" : "pressing"} due to rising border tension with ${target?.name ?? threat.countryCode} (tension: ${threat.tension}).`,
      urgency: defenseUrgency,
      title: existing
        ? `Escalating Threat from ${target?.name ?? threat.countryCode}`
        : `Elevate Readiness Against ${target?.name ?? threat.countryCode}`,
      description: `${ADVISORS.defense.name} recommends raising military readiness to ${round2(newReadiness)}% to project deterrence. Current tension at ${threat.tension} points demands a defensive posture.`,
      estimatedCost: `Fiscal: ${fmtMoney(player.economy.gdp * 0.01)} · Morale: -5%`,
      projectedImpact: "Reduces aggression risk. May escalate bilateral tension.",
      intent: { intent: "set-readiness", from: player.id, level: round2(newReadiness) },
      tickCreated: existing?.tickCreated ?? tick,
      persistent: threat.tension >= 60,
      followUpFor: existing?.id,
    });
  }

  if (warEvents.length > 0) {
    for (const e of warEvents.slice(0, 2)) {
      const aggr = countries.find((c) => c.id === e.aggressor);
      const tgt = countries.find((c) => c.id === e.target);
      cards.push({
        id: cardId("defense-war", tick, cards.length + 1),
        advisorDomain: "defense",
        advisorName: ADVISORS.defense.name,
        rationale: `War has erupted between ${aggr?.name ?? e.aggressor} and ${tgt?.name ?? e.target}. ${ADVISORS.defense.name} flags this as a critical regional security event.`,
        urgency: "critical",
        title: `Active Conflict: ${aggr?.name ?? e.aggressor} vs ${tgt?.name ?? e.target}`,
        description: `Armed conflict declared this turn. ${ADVISORS.defense.name} advises immediate assessment of alliance obligations and border security.`,
        estimatedCost: "Diplomatic capital · variable",
        projectedImpact: "Regional destabilization risk. Alliance commitments may trigger involvement.",
        tickCreated: tick,
        persistent: true,
      });
    }
  }

  // --- ECONOMY ADVISOR ---
  const econUrgency = urgencyFromStability(player.economy.stability);
  const higherTax = clamp(player.economy.taxRate + 0.02, 0, 1);
  const lowerTax = clamp(player.economy.taxRate - 0.02, 0, 1);

  if (player.economy.stability < 55) {
    const existing = previousCards.find(
      (c) => c.advisorDomain === "economy" && c.intent?.intent === "set-tax" && c.persistent,
    );
    cards.push({
      id: existing?.id ?? cardId("economy", tick, 1),
      advisorDomain: "economy",
      advisorName: ADVISORS.economy.name,
      rationale: `${ADVISORS.economy.name} warns that economic stability at ${round2(player.economy.stability)}% is ${econUrgency === "critical" ? "critically low" : "below healthy levels"}. Fiscal action needed.`,
      urgency: econUrgency,
      title: existing ? `Persistent Economic Instability (${round2(player.economy.stability)}%)` : "Fiscal Consolidation Package",
      description: `${ADVISORS.economy.name} recommends raising the tax rate to ${round2(higherTax * 100)}% to shore up treasury reserves. Current stability at ${round2(player.economy.stability)}%.`,
      estimatedCost: `Revenue gain: ${fmtMoney(player.economy.gdp * 0.02)} · Stability: -3%`,
      projectedImpact: "Treasury reinforced. Moderate public pressure expected.",
      intent: { intent: "set-tax", from: player.id, rate: round2(higherTax) },
      tickCreated: existing?.tickCreated ?? tick,
      persistent: player.economy.stability < 40,
      followUpFor: existing?.id,
    });
  } else {
    cards.push({
      id: cardId("economy", tick, 1),
      advisorDomain: "economy",
      advisorName: ADVISORS.economy.name,
      rationale: `${ADVISORS.economy.name} notes the economy is stable at ${round2(player.economy.stability)}%. A tax reduction could stimulate growth.`,
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

  // --- FOREIGN AFFAIRS ADVISOR ---
  const ally = topAlly(player);
  if (ally && ally.affinity > 30) {
    const allyCountry = countries.find((c) => c.id === ally.countryCode);
    cards.push({
      id: cardId("foreign", tick, 1),
      advisorDomain: "foreign",
      advisorName: ADVISORS.foreign.name,
      rationale: `${ADVISORS.foreign.name} identifies an opportunity to deepen ties with ${allyCountry?.name ?? ally.countryCode} given strong affinity (+${ally.affinity}).`,
      urgency: ally.affinity > 60 ? "high" : "standard",
      title: `Trade Pact with ${allyCountry?.name ?? ally.countryCode}`,
      description: `${ADVISORS.foreign.name} recommends formalizing a bilateral trade agreement to lock in the positive relationship and boost GDP.`,
      estimatedCost: "Fiscal: minimal · Diplomatic: medium",
      projectedImpact: "Bilateral GDP lift. Strengthens strategic alliance.",
      intent: { intent: "propose-trade", from: player.id, target: ally.countryCode },
      tickCreated: tick,
      persistent: false,
    });
  }

  if (threat && threat.tension >= 50) {
    const target = countries.find((c) => c.id === threat.countryCode);
    cards.push({
      id: cardId("foreign", tick, 2),
      advisorDomain: "foreign",
      advisorName: ADVISORS.foreign.name,
      rationale: `${ADVISORS.foreign.name} urges diplomatic engagement with ${target?.name ?? threat.countryCode} to de-escalate before the situation spirals.`,
      urgency: threat.tension >= 70 ? "critical" : "high",
      title: `Diplomatic De-escalation with ${target?.name ?? threat.countryCode}`,
      description: `Open back-channel talks to reduce tension from ${threat.tension} points. ${ADVISORS.foreign.name} advises this alongside any military readiness changes.`,
      estimatedCost: "Diplomatic capital · low fiscal",
      projectedImpact: "Tension reduction in 60% of cases. Risk: adversary may perceive as weakness.",
      tickCreated: tick,
      persistent: threat.tension >= 60,
    });
  }

  // --- INTELLIGENCE ADVISOR ---
  const intelEvents = turnEvents.filter((e) => e.type === "intel.gathered" || e.type === "sabotage.executed");
  if (threat && threat.tension >= 40) {
    const target = countries.find((c) => c.id === threat.countryCode);
    cards.push({
      id: cardId("intel", tick, 1),
      advisorDomain: "intelligence",
      advisorName: ADVISORS.intelligence.name,
      rationale: `${ADVISORS.intelligence.name} recommends surveillance on ${target?.name ?? threat.countryCode} given elevated tension. Intelligence gaps are operationally dangerous.`,
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
      rationale: `${ADVISORS.intelligence.name} reports ${intelEvents.length} active operation(s) this turn. Data is being processed.`,
      urgency: "standard",
      title: "Intel Operations Update",
      description: `${intelEvents.length} intelligence event(s) recorded. ${ADVISORS.intelligence.name} recommends reviewing the Intel tab for details.`,
      estimatedCost: "None",
      projectedImpact: "Improved situational awareness.",
      tickCreated: tick,
      persistent: false,
    });
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
  const councilSummary = criticalCount > 0
    ? `${criticalCount} critical item(s) require immediate attention. ${highCount} high-priority item(s) pending.`
    : highCount > 0
      ? `${highCount} high-priority item(s) on the council agenda. No critical crises detected.`
      : "The council reports no urgent items. Standard routine operations recommended.";

  return { cards, councilSummary };
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

  // Defense advisor
  if (/milit|war|readiness|deploy|arm|border|threat|invas/i.test(lower)) {
    const supports = !/stand.?down|reduce|withdraw|retreat|peace|cease/i.test(lower);
    responses.push({
      advisorDomain: "defense",
      advisorName: ADVISORS.defense.name,
      recommendation: supports
        ? `${ADVISORS.defense.name} concurs with the military emphasis. Current readiness at ${round2(player.military.readiness)}%.`
        : `${ADVISORS.defense.name} cautions against de-escalation given threat levels at ${threat?.tension ?? 0}%.`,
      counterProposal: supports
        ? "Recommend coupling readiness surge with intel gathering on the target."
        : "If standing down, ensure diplomatic channels are opened simultaneously to avoid appearing weak.",
      supportsDirective: supports,
      urgency: threat && threat.tension >= 60 ? "critical" : "high",
    });
  }

  // Economy advisor
  if (/tax|econ|tariff|trade|gdp|fiscal|sanction|embargo|budget/i.test(lower)) {
    const isRestrictive = /sanction|embargo|tariff|restrict|protect/i.test(lower);
    responses.push({
      advisorDomain: "economy",
      advisorName: ADVISORS.economy.name,
      recommendation: isRestrictive
        ? `${ADVISORS.economy.name} warns that restrictive economic measures at stability ${round2(player.economy.stability)}% may compound fiscal stress.`
        : `${ADVISORS.economy.name} supports the economic initiative. Current GDP: ${fmtMoney(player.economy.gdp)}.`,
      counterProposal: isRestrictive
        ? "Recommend phased implementation with quarterly reviews to limit collateral economic damage."
        : "Recommend pairing with a trade pact to maximize GDP uplift.",
      supportsDirective: !isRestrictive || player.economy.stability > 50,
      urgency: isRestrictive && player.economy.stability < 40 ? "critical" : "standard",
    });
  }

  // Foreign affairs advisor
  if (/diplomat|treaty|allian|relation|negotiat|peace|talk/i.test(lower)) {
    responses.push({
      advisorDomain: "foreign",
      advisorName: ADVISORS.foreign.name,
      recommendation: `${ADVISORS.foreign.name} supports diplomatic engagement. Current posture: ${player.posture}.`,
      counterProposal: "Recommend a confidence-building measure (aid or cultural exchange) alongside formal talks.",
      supportsDirective: true,
      urgency: threat && threat.tension >= 60 ? "high" : "standard",
    });
  }

  // Intelligence advisor
  if (/intel|spy|recon|surveill|infiltrat|sabotag|covert/i.test(lower)) {
    responses.push({
      advisorDomain: "intelligence",
      advisorName: ADVISORS.intelligence.name,
      recommendation: `${ADVISORS.intelligence.name} endorses the intelligence operation. Covert assets are available.`,
      counterProposal: "Recommend a low-cost recon pass first before committing to more aggressive operations.",
      supportsDirective: true,
      urgency: "standard",
    });
  }

  if (responses.length === 0) {
    responses.push({
      advisorDomain: "foreign",
      advisorName: ADVISORS.foreign.name,
      recommendation: `${ADVISORS.foreign.name} notes the directive but cannot map it to a specific council domain. Recommends clarifying the strategic objective.`,
      counterProposal: "Consider rephrasing with keywords like 'military', 'economy', 'diplomacy', or 'intelligence' for targeted council input.",
      supportsDirective: false,
      urgency: "standard",
    });
  }

  return responses;
}
