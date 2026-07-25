import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';

export const MILITARY_UNIT_TYPE = 'war.unit' as ComponentType;
export const LOGISTICS_SUPPLY_TYPE = 'war.logistics' as ComponentType;

/** Component representing a military formation or unit. */
export interface MilitaryUnitComponent extends IComponent {
  readonly type: typeof MILITARY_UNIT_TYPE;
  readonly ownerCountryId: EntityId;
  readonly unitName: string;
  readonly personnel: number; // Active troop count
  readonly readiness: number; // 0.0 to 1.0
  readonly morale: number; // 0.0 to 1.0
  readonly fuelReserves: number; // Fuel units
  readonly currentProvinceId: string; // Province where unit is positioned
  readonly moveTargetProvinceId?: string; // Target province for movement
  readonly moveProgress?: number; // 0 to 100 — progress along movement path
}

/** Component representing logistics supply capacity. */
export interface LogisticsSupplyComponent extends IComponent {
  readonly type: typeof LOGISTICS_SUPPLY_TYPE;
  readonly supplyCapacity: number;
  readonly efficiency: number; // 0.0 to 1.0
}
