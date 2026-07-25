import { IComponent } from '../interfaces/component.interface.js';

export interface IDemographicComponent extends IComponent {
  type: 'Demographic';
  populationAbsolute: bigint | number;
  activeWorkforce: bigint | number;
  growthRate: number;
  stabilityIndex: number;
  educationLevel: number;
}
