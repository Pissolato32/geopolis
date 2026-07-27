// BYOD — Bring Your Own Directive. Type contracts for the freeform
// strategic directive analyzer that powers the Decision Room's custom
// directive input.

import type { StrictIntent } from "../shared/types.js";

export interface DirectiveImpact {
  label: string;
  value: number;
  suffix: string;
  direction: "up" | "down";
}

export interface DirectiveOption {
  id: string;
  title: string;
  description: string;
  impacts: DirectiveImpact[];
  intent: StrictIntent;
}

export interface DirectiveAnalysisResult {
  options: DirectiveOption[];
  summary: string;
}

export interface AnalysisSnapshot {
  tick: number;
  playerCode: string;
  countries: Array<{
    id: string;
    name: string;
    gdp: number;
    gdpGrowth: number;
    tension: number;
    readiness: number;
    relationships: Array<{ countryCode: string; tension: number; affinity: number }>;
  }>;
  market: Array<{ resource: string; price: number; delta: number }>;
  units: Array<{ ownerCode: string; type: string; readiness: number; latlng: [number, number] }>;
}

export const DIRECTIVE_INTENT_TYPES = [
  "set-tax",
  "adjust-tariffs",
  "set-readiness",
  "impose-sanction",
  "propose-trade",
  "conduct-recon",
] as const;

export type DirectiveIntentType = (typeof DIRECTIVE_INTENT_TYPES)[number];
