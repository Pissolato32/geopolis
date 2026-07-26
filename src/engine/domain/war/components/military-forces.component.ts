import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';

export const MILITARY_FORCES_TYPE = 'military.forces' as ComponentType;

/** Country-level aggregate military forces (distinct from individual unit entities). */
export interface MilitaryForcesComponent extends IComponent {
  readonly type: typeof MILITARY_FORCES_TYPE;
  readonly ownerCountryId: EntityId;
  readonly totalPersonnel: number;
  readonly forceLimit: number;
  readonly readiness: number; // 0.0 to 1.0
  readonly morale: number; // 0.0 to 1.0
  readonly fuelReserves: number;
}
