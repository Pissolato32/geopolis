export const ECONOMY_TRADE_FLOW_EVENT = 'economy.trade-flow';
export const ECONOMY_TRADE_ROUTE_ESTABLISHED_EVENT = 'economy.trade-route-established';
export const ECONOMY_TRADE_ROUTE_BLOCKED_EVENT = 'economy.trade-route-blocked';
export const ECONOMY_TRADE_SANCTION_EFFECT_EVENT = 'economy.trade-sanction-effect';
export const ECONOMY_BLOCKADE_EVENT = 'economy.blockade';
export const ECONOMY_COMMODITY_SHORTAGE_EVENT = 'economy.commodity-shortage';

export interface IEconomyTradeFlowPayload {
  readonly routeId: string;
  readonly sourceCountryId: string;
  readonly targetCountryId: string;
  readonly resourceType: string;
  readonly volume: number;
  readonly value: number;
}

export interface IEconomyTradeRouteEstablishedPayload {
  readonly routeId: string;
  readonly sourceCountryId: string;
  readonly targetCountryId: string;
  readonly resourceType: string;
  readonly volumePerTick: number;
}

export interface IEconomyTradeRouteBlockedPayload {
  readonly routeId: string;
  readonly sourceCountryId: string;
  readonly targetCountryId: string;
  readonly reason: 'sanction' | 'sanction-lifted' | 'war' | 'diplomatic-freeze';
}

export interface IEconomyBlockadePayload {
  readonly targetCountryId: string;
  readonly blockadeLevel: number;
  readonly importReduction: number;
}

export interface IEconomyCommodityShortagePayload {
  readonly countryId: string;
  readonly resourceType: string;
  readonly deficit: number;
  readonly stabilityPenalty: number;
  readonly recruitmentCostMultiplier: number;
}
