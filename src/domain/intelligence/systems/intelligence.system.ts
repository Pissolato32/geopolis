import { ISystem, SystemPriority } from '../../../core/interfaces/system.interface.js';
import { IWorldState } from '../../../core/interfaces/world-state.interface.js';
import { IEventBus } from '../../../core/interfaces/event-bus.interface.js';
import { IComponent } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
import {
  STEALTH_OPERATION_TYPE,
  StealthOperationComponent,
  INTELLIGENCE_AGENCY_TYPE,
  IntelligenceAgencyComponent,
} from '../components/intelligence.components.js';
import {
  INTEL_REPORT_GENERATED_EVENT,
  INTEL_OP_COMPROMISED_EVENT,
  IIntelReportGeneratedPayload,
  IIntelOpCompromisedPayload,
} from '../events/intelligence.events.js';

export const INTELLIGENCE_SYSTEM_ID = 'intel.system';

/**
 * ECS System responsible for resolving stealth operations and intelligence perception reports per tick.
 * Priority: 600 (executes after war and diplomacy).
 */
export class IntelligenceSystem implements ISystem {
  readonly descriptor = {
    id: INTELLIGENCE_SYSTEM_ID,
    name: 'Intelligence & Covert Operations System',
    priority: 600 as SystemPriority,
    requiredComponents: [STEALTH_OPERATION_TYPE],
    subscribedEvents: [INTEL_REPORT_GENERATED_EVENT],
    emittedEvents: [INTEL_REPORT_GENERATED_EVENT, INTEL_OP_COMPROMISED_EVENT],
  };

  initialize(_eventBus: IEventBus, _worldState?: IWorldState): void {
  }

  execute(state: Readonly<IWorldState>, eventBus: IEventBus): void {
    const ops = state.getEntitiesByComponent(STEALTH_OPERATION_TYPE);
    const completedOps: EntityId[] = [];

    for (const opEntity of ops) {
      const opComp = opEntity.getComponent<StealthOperationComponent>(STEALTH_OPERATION_TYPE);
      if (!opComp) continue;

      // Increment exposureRisk based on target counter-intel capability
      const targetIntel = state
        .getEntity(opComp.targetCountryId)
        ?.getComponent<IntelligenceAgencyComponent>(INTELLIGENCE_AGENCY_TYPE);
      const counterIntel = targetIntel
        ? (targetIntel.sigintCapability + targetIntel.humintCapability + targetIntel.cyberCapability) / 3 * 0.05
        : 0.01;
      const newExposureRisk = Math.min(1.0, opComp.exposureRisk + counterIntel);

      // Progress operation
      const isComplete = opComp.progress >= 1.0;
      const newProgress = isComplete ? 1.0 : Math.min(1.0, opComp.progress + 0.1);

      if (isComplete) {
        completedOps.push(opEntity.id);
        const succeeded = newExposureRisk < 0.6;
        eventBus.publish<IIntelReportGeneratedPayload>(
          INTEL_REPORT_GENERATED_EVENT,
          {
            agencyCountryId: opEntity.id,
            targetCountryId: opComp.targetCountryId,
            discipline: 'CYBER',
            fidelityScore: succeeded ? 0.9 : 0.3,
            summary: `Covert operation ${opComp.operationType} ${succeeded ? 'completed successfully' : 'failed'}`,
          },
          INTELLIGENCE_SYSTEM_ID,
          opEntity.id,
        );
      } else {
        // Update progress and exposure risk
        state.updateComponent(opEntity.id, {
          ...opComp,
          progress: newProgress,
          exposureRisk: newExposureRisk,
        } as unknown as IComponent);

        eventBus.publish<IIntelReportGeneratedPayload>(
          INTEL_REPORT_GENERATED_EVENT,
          {
            agencyCountryId: opEntity.id,
            targetCountryId: opComp.targetCountryId,
            discipline: 'CYBER',
            fidelityScore: 0.85,
            summary: `Covert operation ${opComp.operationType} progress at ${Math.round(newProgress * 100)}%`,
          },
          INTELLIGENCE_SYSTEM_ID,
          opEntity.id,
        );
      }

      // Check if operation is compromised
      if (newExposureRisk > 0.7) {
        eventBus.publish<IIntelOpCompromisedPayload>(
          INTEL_OP_COMPROMISED_EVENT,
          {
            operationEntityId: opEntity.id,
            agencyCountryId: opEntity.id,
            targetCountryId: opComp.targetCountryId,
            exposureRisk: newExposureRisk,
          },
          INTELLIGENCE_SYSTEM_ID,
          opEntity.id,
        );
      }
    }

    // Remove completed operations from world state
    for (const opId of completedOps) {
      state.removeEntity(opId);
    }
  }
}
