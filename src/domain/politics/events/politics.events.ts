export const POLITICS_STABILITY_CHANGED_EVENT = 'politics.stability-changed';
export const POLITICS_COUP_RISK_EVENT = 'politics.coup-risk';

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
