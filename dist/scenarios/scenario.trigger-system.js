export const SCENARIO_TRIGGER_SYSTEM_ID = 'scenario.trigger-system';
export class ScenarioTriggerSystem {
    descriptor = {
        id: SCENARIO_TRIGGER_SYSTEM_ID,
        name: 'Scenario Trigger System',
        priority: 2,
        requiredComponents: [],
        subscribedEvents: [],
        emittedEvents: [],
    };
    triggers;
    nextIndex = 0;
    constructor(triggers) {
        this.triggers = [...triggers].sort((a, b) => a.tick - b.tick);
    }
    initialize() { }
    execute(worldState, eventBus) {
        const currentTick = worldState.getMetadata().currentTick;
        while (this.nextIndex < this.triggers.length) {
            const trigger = this.triggers[this.nextIndex];
            if (trigger.tick > currentTick)
                break;
            eventBus.publish(trigger.eventType, { ...trigger.parameters }, SCENARIO_TRIGGER_SYSTEM_ID);
            this.nextIndex++;
        }
    }
    teardown() { }
}
//# sourceMappingURL=scenario.trigger-system.js.map