// Technology Tree Definitions — 3 branches (Economy, Defense, Governance & Intel),
// each with 3 tiers (T1 foundational, T2 strategic, T3 transformative).
// Prerequisites enforce a branching progression: T1 unlocks before T2,
// T2 unlocks before T3 within each branch.

import type { ITechNode } from "../shared/types.js";

export const TECH_TREE: ITechNode[] = [
  // ===== ECONOMY BRANCH =====
  {
    id: "eco-t1-industrial",
    name: "Industrial Modernization",
    branch: "economy",
    tier: 1,
    costPoints: 50,
    prerequisites: [],
    description: "Modernize manufacturing infrastructure. Boosts GDP growth and tax revenue collection efficiency.",
    kpiModifiers: { gdpGrowthDelta: 0.02, taxYieldBonus: 0.01 },
  },
  {
    id: "eco-t2-digital",
    name: "Digital Economy Framework",
    branch: "economy",
    tier: 2,
    costPoints: 120,
    prerequisites: ["eco-t1-industrial"],
    description: "Establish national digital infrastructure. Significantly accelerates GDP growth through technology sector expansion.",
    kpiModifiers: { gdpGrowthDelta: 0.03, taxYieldBonus: 0.015, stabilityDelta: 0.02 },
  },
  {
    id: "eco-t3-fintech",
    name: "Financial Hegemony Protocol",
    branch: "economy",
    tier: 3,
    costPoints: 250,
    prerequisites: ["eco-t2-digital"],
    description: "Achieve global financial dominance. Transformative GDP growth and treasury revenue. Establishes your currency as a global reserve standard.",
    kpiModifiers: { gdpGrowthDelta: 0.05, taxYieldBonus: 0.025, stabilityDelta: 0.05 },
  },

  // ===== DEFENSE BRANCH =====
  {
    id: "def-t1-mobilization",
    name: "Rapid Mobilization Doctrine",
    branch: "defense",
    tier: 1,
    costPoints: 50,
    prerequisites: [],
    description: "Reform military logistics for faster troop deployment. Raises maximum military readiness ceiling.",
    kpiModifiers: { readinessMaxBonus: 5, stabilityDelta: 0.01 },
  },
  {
    id: "def-t2-cyber",
    name: "Cyber Warfare Division",
    branch: "defense",
    tier: 2,
    costPoints: 120,
    prerequisites: ["def-t1-mobilization"],
    description: "Establish dedicated cyber warfare units. Enhances both military readiness ceiling and intelligence fidelity.",
    kpiModifiers: { readinessMaxBonus: 8, intelFidelityBonus: 0.10, stabilityDelta: 0.02 },
  },
  {
    id: "def-t3-quantum",
    name: "Quantum Defense Grid",
    branch: "defense",
    tier: 3,
    costPoints: 250,
    prerequisites: ["def-t2-cyber"],
    description: "Deploy quantum-encrypted national defense systems. Transformative readiness boost and intelligence superiority.",
    kpiModifiers: { readinessMaxBonus: 12, intelFidelityBonus: 0.20, stabilityDelta: 0.05 },
  },

  // ===== GOVERNANCE & INTEL BRANCH =====
  {
    id: "gov-t1-survey",
    name: "National Census & Survey System",
    branch: "governance_intel",
    tier: 1,
    costPoints: 50,
    prerequisites: [],
    description: "Comprehensive domestic intelligence gathering. Improves stability monitoring and intel fidelity baseline.",
    kpiModifiers: { stabilityDelta: 0.03, intelFidelityBonus: 0.05 },
  },
  {
    id: "gov-t2-ai",
    name: "AI Governance Platform",
    branch: "governance_intel",
    tier: 2,
    costPoints: 120,
    prerequisites: ["gov-t1-survey"],
    description: "Deploy AI-driven policy optimization systems. Substantial stability improvement and intel enhancement.",
    kpiModifiers: { stabilityDelta: 0.05, intelFidelityBonus: 0.10, gdpGrowthDelta: 0.01 },
  },
  {
    id: "gov-t3-oracle",
    name: "Predictive Oracle Network",
    branch: "governance_intel",
    tier: 3,
    costPoints: 250,
    prerequisites: ["gov-t2-ai"],
    description: "Real-time predictive analytics for all governance domains. Transformative stability and intelligence capabilities.",
    kpiModifiers: { stabilityDelta: 0.08, intelFidelityBonus: 0.20, gdpGrowthDelta: 0.02 },
  },
];

/** Map of techId → ITechNode for quick lookups. */
export const TECH_MAP: Map<string, ITechNode> = new Map(
  TECH_TREE.map((t) => [t.id, t]),
);

/** Get all tech nodes for a specific branch, sorted by tier. */
export function getBranchNodes(branch: ITechNode["branch"]): ITechNode[] {
  return TECH_TREE.filter((t) => t.branch === branch).sort((a, b) => a.tier - b.tier);
}

/** Branch display metadata. */
export const BRANCH_META: Record<ITechNode["branch"], { label: string; icon: string; accentColor: string; description: string }> = {
  economy: {
    label: "Economy",
    icon: "▲",
    accentColor: "#5ad07a",
    description: "GDP growth, tax revenue, and financial dominance",
  },
  defense: {
    label: "Defense",
    icon: "🛡",
    accentColor: "#e85d5a",
    description: "Military readiness, cyber warfare, and national security",
  },
  governance_intel: {
    label: "Governance & Intel",
    icon: "◆",
    accentColor: "#c4a84a",
    description: "Stability, intelligence fidelity, and AI governance",
  },
};
