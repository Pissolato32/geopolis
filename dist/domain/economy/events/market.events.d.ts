export declare const ECONOMY_MARKET_CRASH_EVENT = "economy.market-crash";
export declare const ECONOMY_PRICE_UPDATED_EVENT = "economy.price-updated";
export declare const ECONOMY_GLOBAL_SUPPLY_EVENT = "economy.global-supply";
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
//# sourceMappingURL=market.events.d.ts.map