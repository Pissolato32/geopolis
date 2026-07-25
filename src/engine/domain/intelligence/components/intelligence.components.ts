import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';

export const INTELLIGENCE_AGENCY_TYPE = 'intel.agency' as ComponentType;
export const STEALTH_OPERATION_TYPE = 'intel.stealth-op' as ComponentType;

/** Component representing an intelligence agency's discipline capabilities. */
export interface IntelligenceAgencyComponent extends IComponent {
  readonly type: typeof INTELLIGENCE_AGENCY_TYPE;
  readonly sigintCapability: number; // 0.0 to 1.0
  readonly humintCapability: number; // 0.0 to 1.0
  readonly osintCapability: number; // 0.0 to 1.0
  readonly imintCapability: number; // 0.0 to 1.0
  readonly cyberCapability: number; // 0.0 to 1.0
}

/**
 * StealthOperationComponent (ADR-001 requirement).
 * Represents an active covert or cyber intelligence operation.
 */
export interface StealthOperationComponent extends IComponent {
  readonly type: typeof STEALTH_OPERATION_TYPE;
  readonly targetCountryId: EntityId;
  readonly operationType: 'espionage' | 'sabotage' | 'cyber-attack' | 'disinformation';
  readonly progress: number; // 0.0 to 1.0
  readonly exposureRisk: number; // 0.0 (undetectable) to 1.0 (compromised)
}
