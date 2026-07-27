import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';

export const DEMOGRAPHIC_TYPE = 'demographic.population' as ComponentType;

/** Component representing a country's population and demographic characteristics. */
export interface DemographicComponent extends IComponent {
  readonly type: typeof DEMOGRAPHIC_TYPE;
  readonly populationAbsolute: bigint | number;
  readonly activeWorkforce: bigint | number;
  readonly growthRate: number; // annual rate, e.g. 0.01 = +1%/year
  readonly stabilityIndex: number; // 0.0 to 1.0
  readonly educationLevel: number; // 0.0 to 1.0
}
