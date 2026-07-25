import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';
import { ResourceType } from './trade.components.js';

export const ECONOMY_MARKET_TYPE = 'economy.market' as ComponentType;

export interface MarketComponent extends IComponent {
  readonly type: typeof ECONOMY_MARKET_TYPE;
  readonly resourceType: ResourceType;
  readonly currentPrice: number;
  readonly totalSupply: number;
  readonly totalDemand: number;
  readonly priceVolatility: number;
}
