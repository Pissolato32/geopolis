// Presidential Briefing data contract — consumed by the Command Center UI.

export interface IPresidentialBriefing {
  header: {
    turn: number;
    date: string;
    intervalDays: number;
    periodStr: string;
  };
  executiveSummary: string;
  specialReports: Array<{
    id: string;
    title: string;
    subtitle?: string;
    sections: Array<{
      heading: string;
      content: string;
      metrics?: Record<string, string | number>;
    }>;
    recommendation?: string;
  }>;
  domainResults: Array<{
    domain: "militar" | "inteligencia" | "diplomatico" | "politico_economico" | "projetos" | "comunicacao";
    label: string;
    status: "success" | "warning" | "critical" | "neutral";
    summary: string;
    details: string[];
  }>;
  worldDevelopments: Array<{
    category: string;
    headline: string;
    impact: string;
  }>;
  intelligenceRadar: Array<{
    target: string;
    confidence: "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";
    update: string;
  }>;
  assessment: {
    tacticalResult: string;
    rootCause: string;
    fiscalAndPoliticalCosts: Array<{ item: string; cost: string }>;
    strategicOutlook: string;
  };
  decisionOptions: Array<{
    domain: string;
    domainLabel: string;
    options: Array<{
      id: string;
      code: "A" | "B";
      title: string;
      description: string;
      estimatedCost: string;
      projectedImpact: string;
    }>;
  }>;
  reservedArchive: Array<{
    codename: string;
    status: string;
    details: string;
  }>;
  stateMetrics: {
    escalation: number;
    popularity: number;
    gdpGrowth: number;
    inflation: number;
    debtToGdp: number;
    congressSupport: { senators: number; deputies: number };
    militaryReadiness: { army: number; navy: number; airForce: number };
    exchangeRate: number;
    deficit: number;
  };
}

export type BriefingTab =
  | "briefing"
  | "domains"
  | "intel"
  | "decisions"
  | "archive";
