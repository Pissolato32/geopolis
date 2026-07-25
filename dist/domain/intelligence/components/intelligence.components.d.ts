import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
export declare const INTELLIGENCE_AGENCY_TYPE: ComponentType;
export declare const STEALTH_OPERATION_TYPE: ComponentType;
/** Component representing an intelligence agency's discipline capabilities. */
export interface IntelligenceAgencyComponent extends IComponent {
    readonly type: typeof INTELLIGENCE_AGENCY_TYPE;
    readonly sigintCapability: number;
    readonly humintCapability: number;
    readonly osintCapability: number;
    readonly imintCapability: number;
    readonly cyberCapability: number;
}
/**
 * StealthOperationComponent (ADR-001 requirement).
 * Represents an active covert or cyber intelligence operation.
 */
export interface StealthOperationComponent extends IComponent {
    readonly type: typeof STEALTH_OPERATION_TYPE;
    readonly targetCountryId: EntityId;
    readonly operationType: 'espionage' | 'sabotage' | 'cyber-attack' | 'disinformation';
    readonly progress: number;
    readonly exposureRisk: number;
}
//# sourceMappingURL=intelligence.components.d.ts.map