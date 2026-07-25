import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';

export const DIPLOMATIC_RELATION_TYPE = 'diplomacy.relation' as ComponentType;

/**
 * RelationComponent (ADR-001 requirement).
 * Represents a bilateral relationship edge between a source country and target country.
 */
export interface RelationComponent extends IComponent {
  readonly type: typeof DIPLOMATIC_RELATION_TYPE;
  readonly targetCountryId: EntityId;
  readonly affinity: number; // -1.0 (war/enemy) to +1.0 (allied/trust)
  readonly tension: number; // 0.0 (peace) to 1.0 (imminent conflict)
  readonly recognition: 'full' | 'partial' | 'unrecognized';
  readonly activeTreaties: ReadonlyArray<string>; // Array of treaty IDs
}
