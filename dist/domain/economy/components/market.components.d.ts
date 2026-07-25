import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';
import { ResourceType } from './trade.components.js';
export declare const ECONOMY_MARKET_TYPE: ComponentType;
export interface MarketComponent extends IComponent {
    readonly type: typeof ECONOMY_MARKET_TYPE;
    readonly resourceType: ResourceType;
    readonly currentPrice: number;
    readonly totalSupply: number;
    readonly totalDemand: number;
    readonly priceVolatility: number;
}
//# sourceMappingURL=market.components.d.ts.map