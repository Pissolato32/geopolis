import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';
import { EntityId } from '../../../core/interfaces/entity.interface.js';
export declare const MILITARY_UNIT_TYPE: ComponentType;
export declare const LOGISTICS_SUPPLY_TYPE: ComponentType;
/** Component representing a military formation or unit. */
export interface MilitaryUnitComponent extends IComponent {
    readonly type: typeof MILITARY_UNIT_TYPE;
    readonly ownerCountryId: EntityId;
    readonly unitName: string;
    readonly personnel: number;
    readonly readiness: number;
    readonly morale: number;
    readonly fuelReserves: number;
    readonly currentProvinceId: string;
    readonly moveTargetProvinceId?: string;
    readonly moveProgress?: number;
}
/** Component representing logistics supply capacity. */
export interface LogisticsSupplyComponent extends IComponent {
    readonly type: typeof LOGISTICS_SUPPLY_TYPE;
    readonly supplyCapacity: number;
    readonly efficiency: number;
}
//# sourceMappingURL=war.components.d.ts.map