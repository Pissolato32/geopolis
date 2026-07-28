import { IComponent, ComponentType } from '../../../core/interfaces/component.interface.js';

export const DIPLOMATIC_INFAMY_TYPE = 'diplomacy.infamy' as ComponentType;

/**
 * Tracks a country's aggression reputation in the international community.
 * High infamy triggers automatic sanctions, trade embargoes, and coalition
 * formation against the aggressor.
 */
export interface InfamyComponent extends IComponent {
  readonly type: typeof DIPLOMATIC_INFAMY_TYPE;
  /** 0.0 (spotless) to 1.0 (global pariah). */
  readonly infamyScore: number;
  /** Ticks since the last aggressive act; infamy decays after a grace period. */
  readonly ticksSinceAggression: number;
  /** Countries that have joined a retaliatory coalition against this nation. */
  readonly coalitionMembers: ReadonlyArray<string>;
  /** True if this country has been flagged as a global threat by the AI system. */
  readonly isGlobalThreat: boolean;
}
