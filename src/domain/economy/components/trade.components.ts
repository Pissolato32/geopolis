import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import { TickNumber } from '../../../core/interfaces/event-bus.interface.js';

export const ECONOMY_TRADE_ROUTE_TYPE = 'economy.trade-route' as ComponentType;

export type ResourceType = 'energy' | 'food' | 'minerals' | 'industrial' | 'technology';

export interface TradeRouteComponent extends IComponent {
  readonly type: typeof ECONOMY_TRADE_ROUTE_TYPE;
  readonly sourceCountryId: EntityId;
  readonly targetCountryId: EntityId;
  readonly resourceType: ResourceType;
  readonly volumePerTick: number;
  readonly isActive: boolean;
  readonly establishedTick: TickNumber;
}
