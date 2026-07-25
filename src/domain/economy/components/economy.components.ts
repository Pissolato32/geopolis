import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';

export const ECONOMIC_INDICATOR_TYPE = 'economy.indicator' as ComponentType;
export const RESOURCE_PRODUCTION_TYPE = 'economy.production' as ComponentType;

/** Component representing country macro-economic indicators. */
export interface EconomicIndicatorComponent extends IComponent {
  readonly type: typeof ECONOMIC_INDICATOR_TYPE;
  readonly gdp: bigint | number; // In billions USD or BigInt cents/units
  readonly inflationRate: number; // e.g. 0.03 = 3%
  readonly treasury: bigint | number; // In billions USD or BigInt cents/units
  readonly taxRate: number; // e.g. 0.25 = 25%
}

/** Component representing region resource production capacities. */
export interface ResourceProductionComponent extends IComponent {
  readonly type: typeof RESOURCE_PRODUCTION_TYPE;
  readonly energyOutput: number;
  readonly foodOutput: number;
  readonly mineralsOutput: number;
  readonly industrialOutput: number;
}
