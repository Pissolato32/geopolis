export const ECONOMY_GDP_UPDATED_EVENT = 'economy.gdp-updated';
export const ECONOMY_RESOURCE_SHORTAGE_EVENT = 'economy.resource-shortage';
export const ECONOMY_TAX_RATE_ADJUSTED_EVENT = 'economy.tax-rate-adjusted';

export interface IEconomyGdpUpdatedPayload {
  readonly countryId: string;
  readonly previousGdp: bigint | number;
  readonly newGdp: bigint | number;
  readonly gdpGrowthRate: number;
}

export interface IEconomyResourceShortagePayload {
  readonly countryId: string;
  readonly resourceType: 'energy' | 'food' | 'minerals' | 'industrial';
  readonly deficit: number;
}

export interface IEconomyTaxRateAdjustedPayload {
  readonly countryId: string;
  readonly previousRate: number;
  readonly newRate: number;
}
