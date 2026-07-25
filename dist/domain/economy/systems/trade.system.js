import { ECONOMY_TRADE_ROUTE_TYPE, } from '../components/trade.components.js';
import { ECONOMY_MARKET_TYPE, } from '../components/market.components.js';
import { ECONOMIC_INDICATOR_TYPE, } from '../components/economy.components.js';
import { ECONOMY_TRADE_FLOW_EVENT, } from '../events/trade.events.js';
export const TRADE_SYSTEM_ID = 'economy.trade';
export class TradeSystem {
    descriptor = {
        id: TRADE_SYSTEM_ID,
        name: 'Trade Route Flow System',
        priority: 175,
        requiredComponents: [ECONOMY_TRADE_ROUTE_TYPE],
        subscribedEvents: [ECONOMY_TRADE_FLOW_EVENT],
        emittedEvents: [ECONOMY_TRADE_FLOW_EVENT],
    };
    initialize(eventBus, worldState) {
        if (!worldState)
            return;
        eventBus.subscribe(ECONOMY_TRADE_FLOW_EVENT, (event) => {
            const srcId = event.payload.sourceCountryId;
            if (!worldState.hasEntity(srcId))
                return;
            const entity = worldState.getEntity(srcId);
            const indicator = entity?.getComponent(ECONOMIC_INDICATOR_TYPE);
            if (!indicator)
                return;
            const currentTreasury = typeof indicator.treasury === 'bigint'
                ? Number(indicator.treasury)
                : indicator.treasury;
            const tradeValue = event.payload.value;
            const newTreasury = currentTreasury + tradeValue;
            worldState.updateComponent(srcId, {
                ...indicator,
                treasury: typeof indicator.treasury === 'bigint'
                    ? BigInt(Math.round(newTreasury))
                    : newTreasury,
            });
        });
    }
    execute(state, eventBus) {
        const routes = state.getEntitiesByComponent(ECONOMY_TRADE_ROUTE_TYPE);
        if (routes.length === 0)
            return;
        const markets = state.getEntitiesByComponent(ECONOMY_MARKET_TYPE);
        const priceByResource = new Map();
        for (const m of markets) {
            const comp = m.getComponent(ECONOMY_MARKET_TYPE);
            if (comp)
                priceByResource.set(comp.resourceType, comp.currentPrice);
        }
        for (const routeEntity of routes) {
            const route = routeEntity.getComponent(ECONOMY_TRADE_ROUTE_TYPE);
            if (!route || !route.isActive)
                continue;
            const basePrice = priceByResource.get(route.resourceType) ?? 100;
            const volume = route.volumePerTick;
            const value = volume * basePrice;
            if (value <= 0)
                continue;
            eventBus.publish(ECONOMY_TRADE_FLOW_EVENT, {
                routeId: routeEntity.id,
                sourceCountryId: route.sourceCountryId,
                targetCountryId: route.targetCountryId,
                resourceType: route.resourceType,
                volume,
                value,
            }, TRADE_SYSTEM_ID, route.sourceCountryId);
        }
    }
}
//# sourceMappingURL=trade.system.js.map