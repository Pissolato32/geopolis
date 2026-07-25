import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';
export declare const ECONOMIC_INDICATOR_TYPE: ComponentType;
export declare const RESOURCE_PRODUCTION_TYPE: ComponentType;
/** Component representing country macro-economic indicators. */
export interface EconomicIndicatorComponent extends IComponent {
    readonly type: typeof ECONOMIC_INDICATOR_TYPE;
    readonly gdp: bigint | number;
    readonly inflationRate: number;
    readonly treasury: bigint | number;
    readonly taxRate: number;
}
/** Component representing region resource production capacities. */
export interface ResourceProductionComponent extends IComponent {
    readonly type: typeof RESOURCE_PRODUCTION_TYPE;
    readonly energyOutput: number;
    readonly foodOutput: number;
    readonly mineralsOutput: number;
    readonly industrialOutput: number;
}
//# sourceMappingURL=economy.components.d.ts.map