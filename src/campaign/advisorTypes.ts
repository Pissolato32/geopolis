// Advisor types for the Universal Advisory Council — defines 5 universal
// advisor slots present across all regime types, competing proposals,
// candidate profiles for appointment, and vacant-post mechanics.

import type {
  StrictIntent,
  AdvisorSlotId,
  AdvisorIdeology,
  AdvisorState,
  AdvisorCandidate,
  CabinetState,
  CompetingCard,
} from "../shared/types.js";

// Legacy domain type kept for BYOD directive responses (backward compat).
export type AdvisorDomain = "defense" | "economy" | "foreign" | "intelligence";

export type UrgencyRating = "critical" | "high" | "standard";

/** Metadata for each universal advisor slot. */
export interface AdvisorSlotMeta {
  slotId: AdvisorSlotId;
  label: string;
  title: string;
  icon: string;
  accentColor: string;
  focus: string;
  kpiFocus: string[];
}

/** Legacy advisor card (single-advisor, used by existing agenda). */
export interface AdvisorCard {
  id: string;
  advisorDomain: AdvisorDomain;
  advisorName: string;
  rationale: string;
  urgency: UrgencyRating;
  title: string;
  description: string;
  estimatedCost: string;
  projectedImpact: string;
  intent?: StrictIntent;
  tickCreated: number;
  persistent: boolean;
  followUpFor?: string;
}

export interface AdvisorAgenda {
  cards: AdvisorCard[];
  competingCards: CompetingCard[];
  councilSummary: string;
  vacantSlots: AdvisorSlotId[];
}

export interface ByodAdvisorResponse {
  advisorDomain: AdvisorDomain;
  advisorName: string;
  recommendation: string;
  counterProposal: string;
  supportsDirective: boolean;
  urgency: UrgencyRating;
}

/** The 5 universal advisor slots — present for every regime type. */
export const ADVISOR_SLOTS: Record<AdvisorSlotId, AdvisorSlotMeta> = {
  finance: {
    slotId: "finance",
    label: "Financial & Economic Advisor",
    title: "Financial & Economic Council",
    icon: "▲",
    accentColor: "#5ad07a",
    focus: "GDP Growth, Inflation Control, Market Stimulation",
    kpiFocus: ["gdp", "stability", "taxRate"],
  },
  treasury: {
    slotId: "treasury",
    label: "Treasury & Fiscal Advisor",
    title: "Treasury & Fiscal Council",
    icon: "◈",
    accentColor: "#4a9cc4",
    focus: "Fiscal Discipline, Deficit Reduction, Debt Management",
    kpiFocus: ["treasury", "deficit", "taxRate"],
  },
  defense: {
    slotId: "defense",
    label: "Defense & National Security Advisor",
    title: "Defense & National Security Council",
    icon: "🛡",
    accentColor: "#e85d5a",
    focus: "Military Readiness, Border Security, Force Deployment",
    kpiFocus: ["readiness", "morale", "tension"],
  },
  foreign: {
    slotId: "foreign",
    label: "Foreign Affairs Advisor",
    title: "Foreign Affairs Council",
    icon: "🤝",
    accentColor: "#c4a84a",
    focus: "Diplomatic Pacts, Trade Alliances, Sanctions",
    kpiFocus: ["affinity", "treaties", "tension"],
  },
  stability: {
    slotId: "stability",
    label: "Internal Stability & Social Advisor",
    title: "Internal Stability & Social Council",
    icon: "◆",
    accentColor: "#c47a4a",
    focus: "Public Popularity, Public Order, Domestic Welfare",
    kpiFocus: ["stability", "legislativeSupport", "militaryLoyalty"],
  },
};

export const SLOT_ORDER: AdvisorSlotId[] = ["finance", "treasury", "defense", "foreign", "stability"];

/** Ideology display metadata. */
export const IDEOLOGY_LABELS: Record<AdvisorIdeology, string> = {
  "keynesian-growth": "Keynesian Growth",
  "fiscal-conservative": "Fiscal Conservative",
  "hawkish": "Hawkish",
  "social-democrat": "Social Democrat",
  "pragmatist": "Pragmatist",
  "isolationist": "Isolationist",
};

/** Satisfaction/loyalty constants. */
export const SATISFACTION_GAIN_ACCEPT = 8;   // +5 to +10, midpoint
export const SATISFACTION_GAIN_MIN = 5;
export const SATISFACTION_GAIN_MAX = 10;
export const SATISFACTION_LOSS_REJECT = 5;   // -3 to -6, midpoint
export const SATISFACTION_LOSS_MIN = 3;
export const SATISFACTION_LOSS_MAX = 6;
export const LOYALTY_GAIN_ACCEPT = 3;
export const LOYALTY_LOSS_REJECT = 2;

/** Policy cooldown durations in ticks. */
export const COOLDOWN_TICKS: Record<string, number> = {
  "set-tax": 10,
  "set-readiness": 8,
  "set-posture": 6,
  "send-aid": 5,
  "fund-sabotage": 7,
  "gather-intel": 4,
};

/** Legacy advisor mapping for BYOD compat. */
export const ADVISORS: Record<AdvisorDomain, { name: string; title: string; icon: string; accentColor: string }> = {
  defense: {
    name: "Gen. Helena Voss",
    title: "Defense Council",
    icon: "🛡",
    accentColor: "#e85d5a",
  },
  economy: {
    name: "Dir. Marcus Chen",
    title: "Economic Council",
    icon: "▲",
    accentColor: "#5ad07a",
  },
  foreign: {
    name: "Amb. Sofia Renner",
    title: "Foreign Affairs Council",
    icon: "🤝",
    accentColor: "#c4a84a",
  },
  intelligence: {
    name: "Dir. Kael Okoye",
    title: "Intelligence Council",
    icon: "◆",
    accentColor: "#c47a4a",
  },
};

export const URGENCY_LABELS: Record<UrgencyRating, string> = {
  critical: "Critical",
  high: "High Priority",
  standard: "Standard Routine",
};

/** Generate 3 distinct candidate profiles for a given slot. */
export function generateCandidates(slotId: AdvisorSlotId, tick: number): AdvisorCandidate[] {
  const profiles: Record<AdvisorSlotId, { ideologies: AdvisorIdeology[]; names: string[]; bios: string[] }> = {
    finance: {
      ideologies: ["keynesian-growth", "fiscal-conservative", "pragmatist"],
      names: ["Dr. Elara Vance", "Mr. Cyrus Wen", "Prof. Lila Marchetti"],
      bios: [
        "Advocates deficit spending to stimulate GDP growth during downturns.",
        "Champions balanced budgets and inflation control through tight fiscal policy.",
        "Balances growth targets with pragmatic inflation monitoring.",
      ],
    },
    treasury: {
      ideologies: ["fiscal-conservative", "keynesian-growth", "pragmatist"],
      names: ["Mr. Reginald Holt", "Dr. Anya Petrov", "Ms. Soo-Jin Park"],
      bios: [
        "Prioritizes deficit reduction and sovereign debt management.",
        "Supports strategic borrowing for infrastructure investment.",
        "Pragmatic on deficits — focuses on revenue efficiency.",
      ],
    },
    defense: {
      ideologies: ["hawkish", "isolationist", "pragmatist"],
      names: ["Gen. Marcus Thorne", "Col. Vivian Reyes", "Adm. Jorah Khalid"],
      bios: [
        "Believes in overwhelming force projection and proactive deterrence.",
        "Favors reduced overseas commitments and homeland defense focus.",
        "Balances readiness with diplomatic cost-benefit analysis.",
      ],
    },
    foreign: {
      ideologies: ["pragmatist", "isolationist", "social-democrat"],
      names: ["Amb. Tariq Bensouda", "Dr. Helena Frost", "Min. Rafael Costa"],
      bios: [
        "Multilateralist — builds alliances through trade and mutual defense pacts.",
        "Prefers bilateral deals and minimal alliance entanglements.",
        "Focuses on soft power, cultural exchange, and humanitarian diplomacy.",
      ],
    },
    stability: {
      ideologies: ["social-democrat", "fiscal-conservative", "pragmatist"],
      names: ["Dr. Mira Okonkwo", "Sen. Bastian Vilar", "Gov. Priya Raman"],
      bios: [
        "Champions welfare spending and public popularity through social programs.",
        "Focuses on public order through fiscal restraint and institutional stability.",
        "Balances popularity with pragmatic domestic policy.",
      ],
    },
  };

  const p = profiles[slotId];
  return p.names.map((name, i) => ({
    id: `cand-${slotId}-${tick}-${i}`,
    name,
    ideology: p.ideologies[i]!,
    bio: p.bios[i]!,
    satisfactionPrediction: 55 + Math.round(Math.random() * 15),
    loyaltyPrediction: 50 + Math.round(Math.random() * 15),
  }));
}

/** Create a default cabinet with all 5 slots filled. */
export function createDefaultCabinet(tick: number): CabinetState {
  const defaults: Record<AdvisorSlotId, { name: string; ideology: AdvisorIdeology }> = {
    finance: { name: "Dir. Marcus Chen", ideology: "pragmatist" },
    treasury: { name: "Mr. Reginald Holt", ideology: "fiscal-conservative" },
    defense: { name: "Gen. Helena Voss", ideology: "hawkish" },
    foreign: { name: "Amb. Sofia Renner", ideology: "pragmatist" },
    stability: { name: "Dr. Mira Okonkwo", ideology: "social-democrat" },
  };

  const cabinet: Partial<CabinetState> = {};
  for (const slotId of SLOT_ORDER) {
    const d = defaults[slotId];
    cabinet[slotId] = {
      slotId,
      name: d.name,
      ideology: d.ideology,
      satisfaction: 60,
      loyalty: 55,
      appointedTick: tick,
    } as AdvisorState;
  }
  return cabinet as CabinetState;
}

/** Apply satisfaction/loyalty changes when a proposal is accepted or rejected. */
export function applyAdvisorFeedback(
  cabinet: CabinetState,
  acceptedSlotId: AdvisorSlotId,
  rejectedSlotIds: AdvisorSlotId[],
): CabinetState {
  const next: Partial<CabinetState> = {};
  for (const slotId of SLOT_ORDER) {
    const adv = cabinet[slotId];
    if (!adv) {
      next[slotId] = null;
      continue;
    }
    if (slotId === acceptedSlotId) {
      next[slotId] = {
        ...adv,
        satisfaction: clampPct(adv.satisfaction + SATISFACTION_GAIN_ACCEPT),
        loyalty: clampPct(adv.loyalty + LOYALTY_GAIN_ACCEPT),
      };
    } else if (rejectedSlotIds.includes(slotId)) {
      next[slotId] = {
        ...adv,
        satisfaction: clampPct(adv.satisfaction - SATISFACTION_LOSS_REJECT),
        loyalty: clampPct(adv.loyalty - LOYALTY_LOSS_REJECT),
      };
    } else {
      next[slotId] = adv;
    }
  }
  return next as CabinetState;
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n));
}
