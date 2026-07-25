import { ISystem, SystemPriority } from '../core/interfaces/system.interface.js';
import { IWorldState } from '../core/interfaces/world-state.interface.js';
import { IEventBus } from '../core/interfaces/event-bus.interface.js';
import { IScenarioEventTrigger } from './scenario.types.js';

export const SCENARIO_TRIGGER_SYSTEM_ID = 'scenario.trigger-system';

export class ScenarioTriggerSystem implements ISystem {
  readonly descriptor = {
    id: SCENARIO_TRIGGER_SYSTEM_ID,
    name: 'Scenario Trigger System',
    priority: 2 as SystemPriority,
    requiredComponents: [],
    subscribedEvents: [],
    emittedEvents: [],
  };

  private readonly triggers: ReadonlyArray<IScenarioEventTrigger>;
  private nextIndex = 0;

  constructor(triggers: ReadonlyArray<IScenarioEventTrigger>) {
    this.triggers = [...triggers].sort((a, b) => a.tick - b.tick);
  }

  public initialize(): void {}

  public execute(worldState: Readonly<IWorldState>, eventBus: IEventBus): void {
    const currentTick = worldState.getMetadata().currentTick;
    while (this.nextIndex < this.triggers.length) {
      const trigger = this.triggers[this.nextIndex]!;
      if (trigger.tick > currentTick) break;
      eventBus.publish(
        trigger.eventType,
        { ...trigger.parameters },
        SCENARIO_TRIGGER_SYSTEM_ID,
      );
      this.nextIndex++;
    }
  }

  public teardown(): void {}
}
