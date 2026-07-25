import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
export declare const DIPLOMATIC_RELATION_TYPE: ComponentType;
/**
 * RelationComponent (ADR-001 requirement).
 * Represents a bilateral relationship edge between a source country and target country.
 */
export interface RelationComponent extends IComponent {
    readonly type: typeof DIPLOMATIC_RELATION_TYPE;
    readonly targetCountryId: EntityId;
    readonly affinity: number;
    readonly tension: number;
    readonly recognition: 'full' | 'partial' | 'unrecognized';
    readonly activeTreaties: ReadonlyArray<string>;
}
//# sourceMappingURL=relation.component.d.ts.map