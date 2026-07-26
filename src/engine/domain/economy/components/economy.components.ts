import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';

export const ECONOMIC_INDICATOR_TYPE = 'economy.indicator' as ComponentType;
export const RESOURCE_PRODUCTION_TYPE = 'economy.production' as ComponentType;
export const FINANCIAL_STATUS_TYPE = 'economy.financial-status' as ComponentType;
export const COMMODITY_IMPACT_TYPE = 'economy.commodity-impact' as ComponentType;

/** Component representing country macro-economic indicators. */
export interface EconomicIndicatorComponent extends IComponent {
  readonly type: typeof ECONOMIC_INDICATOR_TYPE;
  readonly gdp: bigint | number; // In billions USD or BigInt cents/units
  readonly inflationRate: number; // e.g. 0.03 = 3%
  readonly treasury: bigint | number; // In billions USD or BigInt cents/units
  readonly taxRate: number; // e.g. 0.25 = 25%
}

/** Component tracking SWIFT/financial-network access and asset-freeze status. */
export interface FinancialStatusComponent extends IComponent {
  readonly type: typeof FINANCIAL_STATUS_TYPE;
  readonly isSwiftConnected: boolean;
  readonly swiftDisconnectTick: number | null;
  readonly frozenAssetAmount: number;
  readonly transactionFeeMultiplier: number;
}

/** Component tracking commodity scarcity impacts on a country (stability & recruitment). */
export interface CommodityImpactComponent extends IComponent {
  readonly type: typeof COMMODITY_IMPACT_TYPE;
  readonly foodDeficit: number;
  readonly energyDeficit: number;
  readonly recruitmentCostMultiplier: number;
  readonly stabilityPenalty: number;
}

/** Component representing region resource production capacities. */
export interface ResourceProductionComponent extends IComponent {
  readonly type: typeof RESOURCE_PRODUCTION_TYPE;
  readonly energyOutput: number;
  readonly foodOutput: number;
  readonly mineralsOutput: number;
  readonly industrialOutput: number;
  readonly technologyOutput: number;
  readonly rareEarthOutput: number;
}
