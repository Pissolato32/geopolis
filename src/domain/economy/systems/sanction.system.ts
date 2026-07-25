import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import {
  ECONOMY_SANCTION_TYPE,
  SanctionComponent,
} from '../components/sanction.components.js';
import {
  ECONOMY_TRADE_ROUTE_TYPE,
  TradeRouteComponent,
} from '../components/trade.components.js';
import {
  ECONOMY_TRADE_ROUTE_BLOCKED_EVENT,
  IEconomyTradeRouteBlockedPayload,
} from '../events/trade.events.js';
export const SANCTION_SYSTEM_ID = 'economy.sanction';

export class SanctionSystem implements ISystem {
  readonly descriptor = {
    id: SANCTION_SYSTEM_ID,
    name: 'Economic Sanctions System',
    priority: 165 as SystemPriority,
    requiredComponents: [ECONOMY_SANCTION_TYPE],
    subscribedEvents: [],
    emittedEvents: [ECONOMY_TRADE_ROUTE_BLOCKED_EVENT],
  };

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    const sanctions = state.getEntitiesByComponent(ECONOMY_SANCTION_TYPE);
    const tradeRoutes = state.getEntitiesByComponent(ECONOMY_TRADE_ROUTE_TYPE);
    if (tradeRoutes.length === 0) return;

    // Phase 1: Block active routes that match an active sanction
    for (const routeEntity of tradeRoutes) {
      const route = routeEntity.getComponent<TradeRouteComponent>(ECONOMY_TRADE_ROUTE_TYPE);
      if (!route || !route.isActive) continue;

      for (const sanctionEntity of sanctions) {
        const sanction = sanctionEntity.getComponent<SanctionComponent>(ECONOMY_SANCTION_TYPE);
        if (!sanction) continue;

        const matches =
          (route.sourceCountryId === sanction.sourceCountryId && route.targetCountryId === sanction.targetCountryId) ||
          (route.sourceCountryId === sanction.targetCountryId && route.targetCountryId === sanction.sourceCountryId);

        if (!matches) continue;

        if (sanction.sanctionType === 'trade-embargo' || sanction.sanctionType === 'oil-embargo') {
          const embargoResource = sanction.sanctionType === 'oil-embargo' ? 'energy' as const : null;
          if (embargoResource && route.resourceType !== embargoResource) continue;
        }

        state.updateComponent(routeEntity.id, {
          ...route,
          isActive: false,
        } as unknown as IComponent);

        eventBus.publish<IEconomyTradeRouteBlockedPayload>(
          ECONOMY_TRADE_ROUTE_BLOCKED_EVENT,
          {
            routeId: routeEntity.id,
            sourceCountryId: route.sourceCountryId,
            targetCountryId: route.targetCountryId,
            reason: 'sanction',
          },
          SANCTION_SYSTEM_ID,
        );
        break; // route blocked by first matching sanction
      }
    }

    // Phase 2: Re-activate inactive routes whose sanction has been lifted
    for (const routeEntity of tradeRoutes) {
      const route = routeEntity.getComponent<TradeRouteComponent>(ECONOMY_TRADE_ROUTE_TYPE);
      if (!route || route.isActive) continue;

      const stillBlocked = sanctions.some(sanctionEntity => {
        const sanction = sanctionEntity.getComponent<SanctionComponent>(ECONOMY_SANCTION_TYPE);
        if (!sanction) return false;

        const matches =
          (route.sourceCountryId === sanction.sourceCountryId && route.targetCountryId === sanction.targetCountryId) ||
          (route.sourceCountryId === sanction.targetCountryId && route.targetCountryId === sanction.sourceCountryId);

        if (!matches) return false;

        if (sanction.sanctionType === 'trade-embargo') return true;
        if (sanction.sanctionType === 'oil-embargo' && route.resourceType === 'energy') return true;

        return false;
      });

      if (!stillBlocked) {
        state.updateComponent(routeEntity.id, {
          ...route,
          isActive: true,
        } as unknown as IComponent);

        eventBus.publish<IEconomyTradeRouteBlockedPayload>(
          ECONOMY_TRADE_ROUTE_BLOCKED_EVENT,
          {
            routeId: routeEntity.id,
            sourceCountryId: route.sourceCountryId,
            targetCountryId: route.targetCountryId,
            reason: 'sanction-lifted',
          },
          SANCTION_SYSTEM_ID,
        );
      }
    }
  }
}
