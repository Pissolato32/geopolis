export const POPULATION_UPDATED_EVENT = 'demographics.population-updated';

export interface IPopulationUpdatedPayload {
  readonly countryId: string;
  readonly previousPopulation: bigint | number;
  readonly newPopulation: bigint | number;
  readonly weeklyGrowthRate: number;
  readonly growthFactors: {
    readonly economicHealth: number;
    readonly stabilityFactor: number;
    readonly warExhaustionFactor: number;
  };
}
