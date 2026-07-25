import { IComponent } from '../interfaces/component.interface.js';

export interface IMilitaryComponent extends IComponent {
  type: 'Military';
  activePersonnel: bigint | number;
  reservePersonnel: bigint | number;
  techLevel: number;
  nuclearArsenal: number;
  readinessIndex: number;
  defenseBudget: bigint | number;
}
