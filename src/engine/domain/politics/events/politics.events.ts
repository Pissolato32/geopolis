export const POLITICS_STABILITY_CHANGED_EVENT = 'politics.stability-changed';
export const POLITICS_COUP_RISK_EVENT = 'politics.coup-risk';
export const POLITICS_COUP_DE_ETAT_EVENT = 'politics.coup-d-etat';
export const POLITICS_FACTION_INFLUENCE_EVENT = 'politics.faction-influence-changed';
export const POLITICS_LEGISLATIVE_VOTE_EVENT = 'politics.legislative-vote';
export const POLITICS_REGIME_CHANGE_EVENT = 'politics.regime-change';

export interface IPoliticsStabilityChangedPayload {
  readonly countryId: string;
  readonly previousStability: number;
  readonly newStability: number;
  readonly delta: number;
}

export interface IPoliticsCoupRiskPayload {
  readonly countryId: string;
  readonly stabilityIndex: number;
  readonly militaryLoyalty: number;
  readonly riskLevel: 'low' | 'moderate' | 'critical';
}

export interface IPoliticsCoupDetatPayload {
  readonly countryId: string;
  readonly previousGovernmentType: string;
  readonly newGovernmentType: string;
  readonly treasuryDisruptionPercent: number;
  readonly allianceTreatiesReset: number;
  readonly tick: number;
  readonly reason: string;
}

export interface IPoliticsFactionInfluencePayload {
  readonly countryId: string;
  readonly factionType: string;
  readonly previousPowerShare: number;
  readonly newPowerShare: number;
  readonly previousLoyalty: number;
  readonly newLoyalty: number;
  readonly driver: string;
}

export interface IPoliticsLegislativeVotePayload {
  readonly countryId: string;
  readonly voteType: 'war-declaration' | 'tax-hike' | 'confidence';
  readonly supportPercent: number;
  readonly passed: boolean;
  readonly reason: string;
}

export interface IPoliticsRegimeChangePayload {
  readonly countryId: string;
  readonly previousGovernmentType: string;
  readonly newGovernmentType: string;
  readonly tick: number;
}
