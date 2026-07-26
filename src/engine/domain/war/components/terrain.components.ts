import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';

export const TERRAIN_MODIFIER_TYPE = 'geo.terrain-modifier' as ComponentType;

export type TerrainType = 'plains' | 'mountains' | 'desert' | 'urban' | 'swamp' | 'forest';

export interface ITerrainModifiers {
  readonly movementCostMultiplier: number;
  readonly defenderBonus: number;
  readonly supplyEfficiencyPenalty: number;
  readonly combatWidthMultiplier: number;
}

export const TERRAIN_MODIFIERS: Readonly<Record<TerrainType, ITerrainModifiers>> = {
  plains:   { movementCostMultiplier: 1.0, defenderBonus: 0.0,  supplyEfficiencyPenalty: 0.0,  combatWidthMultiplier: 1.0 },
  mountains:{ movementCostMultiplier: 2.0, defenderBonus: 0.5,  supplyEfficiencyPenalty: 0.3,  combatWidthMultiplier: 0.6 },
  desert:   { movementCostMultiplier: 1.5, defenderBonus: 0.1,  supplyEfficiencyPenalty: 0.4,  combatWidthMultiplier: 0.8 },
  urban:    { movementCostMultiplier: 1.0, defenderBonus: 0.35, supplyEfficiencyPenalty: 0.1,  combatWidthMultiplier: 0.5 },
  swamp:    { movementCostMultiplier: 1.8, defenderBonus: 0.2,  supplyEfficiencyPenalty: 0.35, combatWidthMultiplier: 0.7 },
  forest:   { movementCostMultiplier: 1.3, defenderBonus: 0.25, supplyEfficiencyPenalty: 0.15, combatWidthMultiplier: 0.75 },
};

export function getTerrainModifiers(terrain: TerrainType): ITerrainModifiers {
  return TERRAIN_MODIFIERS[terrain] ?? TERRAIN_MODIFIERS.plains;
}

export interface TerrainModifierComponent extends IComponent {
  readonly type: typeof TERRAIN_MODIFIER_TYPE;
  readonly terrain: TerrainType;
}
