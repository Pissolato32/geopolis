export const ECONOMY_MARKET_CRASH_EVENT = 'economy.market-crash';
export const ECONOMY_PRICE_UPDATED_EVENT = 'economy.price-updated';
export const ECONOMY_GLOBAL_SUPPLY_EVENT = 'economy.global-supply';
export const ECONOMY_STRATEGIC_COMMODITY_EVENT = 'economy.strategic-commodity';

export interface IEconomyMarketCrashPayload {
  readonly resourceType: string;
  readonly previousPrice: number;
  readonly newPrice: number;
  readonly crashMagnitude: number;
}

export interface IEconomyPriceUpdatedPayload {
  readonly resourceType: string;
  readonly previousPrice: number;
  readonly newPrice: number;
  readonly supplyShift: number;
  readonly demandShift: number;
}

export interface IEconomyGlobalSupplyPayload {
  readonly resourceType: string;
  readonly totalSupply: number;
  readonly totalDemand: number;
  readonly deficit: number;
}

export type StrategicCommodity = 'petroleum' | 'semiconductors' | 'food_agriculture' | 'rare_earth';

export interface IEconomyStrategicCommodityPayload {
  readonly commodity: StrategicCommodity;
  readonly resourceType: string;
  readonly price: number;
  readonly supply: number;
  readonly demand: number;
  readonly warDisruption: number;
  readonly embargoReduction: number;
}
