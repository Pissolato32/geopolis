import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import {
  ECONOMY_MARKET_TYPE,
  MarketComponent,
} from '../components/market.components.js';
import { ResourceType } from '../components/trade.components.js';
import {
  RESOURCE_PRODUCTION_TYPE,
  ResourceProductionComponent,
} from '../components/economy.components.js';
import {
  ECONOMY_PRICE_UPDATED_EVENT,
  ECONOMY_MARKET_CRASH_EVENT,
  ECONOMY_GLOBAL_SUPPLY_EVENT,
  IEconomyPriceUpdatedPayload,
  IEconomyMarketCrashPayload,
  IEconomyGlobalSupplyPayload,
} from '../events/market.events.js';

export const MARKET_SYSTEM_ID = 'economy.market';

const BASE_DEMAND: Record<ResourceType, number> = {
  energy: 500,
  food: 400,
  minerals: 300,
  industrial: 350,
  technology: 200,
};

const PRODUCTION_FIELD_MAP: Record<string, keyof ResourceProductionComponent> = {
  energy: 'energyOutput',
  food: 'foodOutput',
  minerals: 'mineralsOutput',
  industrial: 'industrialOutput',
};

const CRASH_THRESHOLD = 2.5;
const RECOVERY_THRESHOLD = 0.3;

export class MarketSystem implements ISystem {
  readonly descriptor = {
    id: MARKET_SYSTEM_ID,
    name: 'Global Market & Price System',
    priority: 230 as SystemPriority,
    requiredComponents: [ECONOMY_MARKET_TYPE],
    subscribedEvents: [ECONOMY_PRICE_UPDATED_EVENT],
    emittedEvents: [
      ECONOMY_PRICE_UPDATED_EVENT,
      ECONOMY_MARKET_CRASH_EVENT,
      ECONOMY_GLOBAL_SUPPLY_EVENT,
    ],
  };

  initialize(eventBus: IEventBus, worldState?: IWorldState): void {
    if (!worldState) return;

    eventBus.subscribe<IEconomyPriceUpdatedPayload>(
      ECONOMY_PRICE_UPDATED_EVENT,
      (event) => {
        const markets = worldState.getEntitiesByComponent(ECONOMY_MARKET_TYPE);
        for (const m of markets) {
          const comp = m.getComponent<MarketComponent>(ECONOMY_MARKET_TYPE);
          if (comp && comp.resourceType === event.payload.resourceType) {
            worldState.updateComponent(m.id, {
              ...comp,
              currentPrice: event.payload.newPrice,
              totalSupply: event.payload.supplyShift,
              totalDemand: event.payload.demandShift,
            } as unknown as IComponent);
            return;
          }
        }
      },
    );
  }

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    const allProduction = state.getEntitiesByComponent(RESOURCE_PRODUCTION_TYPE);

    const totalSupplyByType = new Map<ResourceType, number>();
    for (const field of Object.keys(PRODUCTION_FIELD_MAP)) {
      totalSupplyByType.set(field as ResourceType, 0);
    }

    for (const prodEntity of allProduction) {
      const prod = prodEntity.getComponent<ResourceProductionComponent>(RESOURCE_PRODUCTION_TYPE);
      if (!prod) continue;

      for (const [resType, field] of Object.entries(PRODUCTION_FIELD_MAP)) {
        const currentTotal = totalSupplyByType.get(resType as ResourceType) ?? 0;
        totalSupplyByType.set(resType as ResourceType, currentTotal + (prod[field] as number));
      }
    }

    const markets = state.getEntitiesByComponent(ECONOMY_MARKET_TYPE);

    for (const marketEntity of markets) {
      const market = marketEntity.getComponent<MarketComponent>(ECONOMY_MARKET_TYPE);
      if (!market) continue;

      const totalSupply = totalSupplyByType.get(market.resourceType) ?? 0;
      const baseDemand = BASE_DEMAND[market.resourceType] ?? 100;
      const totalDemand = baseDemand;

      const ratio = totalDemand > 0 ? totalSupply / totalDemand : 1;
      const priceShift = (1 - ratio) * market.priceVolatility;
      const newPrice = Math.max(1, market.currentPrice * (1 + priceShift));

      const previousPrice = market.currentPrice;

      eventBus.publish<IEconomyGlobalSupplyPayload>(
        ECONOMY_GLOBAL_SUPPLY_EVENT,
        {
          resourceType: market.resourceType,
          totalSupply,
          totalDemand,
          deficit: Math.max(0, totalDemand - totalSupply),
        },
        MARKET_SYSTEM_ID,
      );

      eventBus.publish<IEconomyPriceUpdatedPayload>(
        ECONOMY_PRICE_UPDATED_EVENT,
        {
          resourceType: market.resourceType,
          previousPrice,
          newPrice,
          supplyShift: totalSupply,
          demandShift: totalDemand,
        },
        MARKET_SYSTEM_ID,
      );

      const crashMagnitude = previousPrice > 0 ? newPrice / previousPrice : 1;
      if (crashMagnitude >= CRASH_THRESHOLD || crashMagnitude <= RECOVERY_THRESHOLD) {
        eventBus.publish<IEconomyMarketCrashPayload>(
          ECONOMY_MARKET_CRASH_EVENT,
          {
            resourceType: market.resourceType,
            previousPrice,
            newPrice,
            crashMagnitude,
          },
          MARKET_SYSTEM_ID,
        );
      }
    }
  }
}
