export declare const ECONOMY_TRADE_FLOW_EVENT = "economy.trade-flow";
export declare const ECONOMY_TRADE_ROUTE_ESTABLISHED_EVENT = "economy.trade-route-established";
export declare const ECONOMY_TRADE_ROUTE_BLOCKED_EVENT = "economy.trade-route-blocked";
export declare const ECONOMY_TRADE_SANCTION_EFFECT_EVENT = "economy.trade-sanction-effect";
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
//# sourceMappingURL=trade.events.d.ts.map