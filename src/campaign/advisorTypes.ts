// Advisor types for the AI Advisory Council — defines advisors, evolving
// decision cards, urgency ratings, and agenda items.

import type { StrictIntent } from "../shared/types.js";

export type AdvisorDomain = "defense" | "economy" | "foreign" | "intelligence";

export type UrgencyRating = "critical" | "high" | "standard";

export interface Advisor {
  domain: AdvisorDomain;
  name: string;
  title: string;
  icon: string;
  accentColor: string;
}

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
  councilSummary: string;
}

export interface ByodAdvisorResponse {
  advisorDomain: AdvisorDomain;
  advisorName: string;
  recommendation: string;
  counterProposal: string;
  supportsDirective: boolean;
  urgency: UrgencyRating;
}

export const ADVISORS: Record<AdvisorDomain, Advisor> = {
  defense: {
    domain: "defense",
    name: "Gen. Helena Voss",
    title: "Defense Council",
    icon: "🛡",
    accentColor: "#e85d5a",
  },
  economy: {
    domain: "economy",
    name: "Dir. Marcus Chen",
    title: "Economic Council",
    icon: "▲",
    accentColor: "#5ad07a",
  },
  foreign: {
    domain: "foreign",
    name: "Amb. Sofia Renner",
    title: "Foreign Affairs Council",
    icon: "🤝",
    accentColor: "#4ac4c4",
  },
  intelligence: {
    domain: "intelligence",
    name: "Dir. Kael Okoye",
    title: "Intelligence Council",
    icon: "◆",
    accentColor: "#c4a84a",
  },
};

export const URGENCY_LABELS: Record<UrgencyRating, string> = {
  critical: "Critical",
  high: "High Priority",
  standard: "Standard Routine",
};
