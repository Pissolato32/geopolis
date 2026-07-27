import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';

export const WAR_EXHAUSTION_TYPE = 'politics.war-exhaustion' as ComponentType;

/**
 * WarExhaustionComponent — tracks a country's war exhaustion (0-100).
 * High exhaustion drains stability and morale via the Politics system.
 */
export interface WarExhaustionComponent extends IComponent {
  readonly type: typeof WAR_EXHAUSTION_TYPE;
  readonly exhaustion: number; // 0 (fresh) to 100 (war-weary collapse)
  readonly accumulatedCasualties: number;
  readonly ticksAtWar: number;
}
