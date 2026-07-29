import { IWorldState } from '../../core/interfaces/world-state.interface.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';
import { IDenseStateDumpOptions } from '../../core/interfaces/state-serializer.interface.js';

export interface IPerceptionFilterConfig {
  readonly includeAllies?: boolean;
  readonly focalRadius?: number;
  readonly includeActiveCrises?: boolean;
  /** Intelligence level 0.0-1.0 — controls distortion amount. */
  readonly intelLevel?: number;
}

/**
 * Filter mechanism enforcing Fog of War constraints on global WorldState.
 * Prevents agents from accessing omniscient global state.
 *
 * Distortion by intelligence level (ADR-001):
 * - 0.8-1.0 (high): accurate perception with minor rounding
 * - 0.3-0.7 (medium): noisy values with ±20% distortion
 * - 0.0-0.2 (low): heavily degraded — values rounded, some fields hidden
 */
export class PerceptionFilter {
  /**
   * Produce a dense, token-optimized YAML perception payload for a given agent country.
   * Applies fog-of-war distortion based on the agent's intelligence level.
   */
  public static generatePerceptionDump(
    worldState: Readonly<IWorldState>,
    countryId: EntityId,
    config: IPerceptionFilterConfig = {},
  ): string {
    const intelLevel = config.intelLevel ?? 1.0;

    const dumpOptions: IDenseStateDumpOptions = {
      perspectiveEntityId: countryId,
      focalRadius: config.focalRadius ?? 2,
      includeActiveCrises: config.includeActiveCrises ?? true,
      formatYaml: true,
      stripMetadata: true,
    };

    const rawDump = worldState.dumpStateForAnalysis(dumpOptions);

    if (intelLevel >= 0.8) {
      return rawDump;
    }

    return PerceptionFilter.distort(rawDump, intelLevel);
  }

  /**
   * Apply fog-of-war distortion to a perception dump based on intel level.
   * Uses a deterministic seeded random so the same agent sees consistent
   * distortion within a tick (avoids wild swings between perceptions).
   */
  public static distort(rawDump: string, intelLevel: number): string {
    if (intelLevel >= 0.8) return rawDump;

    const lines = rawDump.split('\n');
    const distorted: string[] = [];
    const seed = PerceptionFilter.hashString(rawDump);
    let rngState = seed;

    const nextRandom = (): number => {
      rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
      return rngState / 0x7fffffff;
    };

    const noiseAmount = intelLevel < 0.3 ? 0.4 : 0.2;

    for (const line of lines) {
      const numMatch = line.match(/^(\s*[\w-]+:\s*)(-?[\d.]+e?-?\d*)(.*)$/);
      if (numMatch) {
        const prefix = numMatch[1]!;
        const rawValue = parseFloat(numMatch[2]!);
        const suffix = numMatch[3] ?? '';

        if (isNaN(rawValue)) {
          distorted.push(line);
          continue;
        }

        if (intelLevel < 0.2) {
          // Very low intel: redact sensitive numeric fields, classify the rest
          const lowerLine = line.toLowerCase();
          if (lowerLine.includes('treasury') || lowerLine.includes('fuelreserves') || lowerLine.includes('morale')) {
            const key = line.match(/^(\s*[\w-]+:)/)?.[1];
            if (key) {
              distorted.push(`${key} [REDACTED]`);
              continue;
            }
          }
          const classified = PerceptionFilter.classifyValue(line, rawValue);
          distorted.push(`${prefix}${classified}${suffix}`);
        } else {
          // Medium intel: add noise
          const noise = (nextRandom() - 0.5) * 2 * noiseAmount;
          const distortedValue = rawValue * (1 + noise);
          distorted.push(`${prefix}${distortedValue.toFixed(3)}${suffix}`);
        }
      } else if (intelLevel < 0.2) {
        // Hide sensitive fields at very low intel
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('treasury') || lowerLine.includes('fuelreserves') || lowerLine.includes('morale')) {
          const key = line.match(/^(\s*[\w-]+:)/)?.[1];
          if (key) {
            distorted.push(`${key} [REDACTED]`);
            continue;
          }
        }
        distorted.push(line);
      } else {
        distorted.push(line);
      }
    }

    return distorted.join('\n');
  }

  /** Classify a numeric value into a broad range label for low-intel perception. */
  private static classifyValue(line: string, value: number): string {
    const lower = line.toLowerCase();
    if (lower.includes('stability')) {
      if (value > 0.7) return 'STABLE';
      if (value > 0.4) return 'MODERATE';
      return 'UNSTABLE';
    }
    if (lower.includes('tension')) {
      if (value > 0.7) return 'HIGH';
      if (value > 0.3) return 'ELEVATED';
      return 'LOW';
    }
    if (lower.includes('readiness')) {
      if (value > 0.7) return 'HIGH';
      if (value > 0.4) return 'MEDIUM';
      return 'LOW';
    }
    if (lower.includes('affinity')) {
      if (value > 0.3) return 'FRIENDLY';
      if (value > -0.3) return 'NEUTRAL';
      return 'HOSTILE';
    }
    return value > 0 ? 'POSITIVE' : 'NEGATIVE';
  }

  private static hashString(s: string): number {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = ((hash << 5) - hash + s.charCodeAt(i)) & 0x7fffffff;
    }
    return hash || 1;
  }

  /**
   * Probabilistic fog-of-war distortion (M6). Unlike {@link distort}, which is
   * deterministic per line, this redacts and perturbs values at rates driven by
   * the intelligence level: low intel redacts 40% of values, medium 20%, high 5%.
   */
  public static distortPerception(perceptionDump: string, intelligenceLevel: number): string {
    if (intelligenceLevel >= 0.9) return perceptionDump;

    const lines = perceptionDump.split('\n');
    const distorted: string[] = [];

    for (const line of lines) {
      const isStructural =
        /^\s*[A-Za-z_-]+:/.test(line) || line.trim() === '' || line.trim().startsWith('-');
      if (isStructural && !line.includes(': ')) {
        distorted.push(line);
        continue;
      }

      const distortionRoll = Math.random();

      if (intelligenceLevel < 0.3) {
        if (distortionRoll < 0.4) {
          distorted.push(line.replace(/: .+$/, ': [REDACTED]'));
        } else if (distortionRoll < 0.5) {
          distorted.push(PerceptionFilter.perturbNumericValue(line, 0.5));
        } else {
          distorted.push(line);
        }
      } else if (intelligenceLevel < 0.6) {
        if (distortionRoll < 0.2) {
          distorted.push(line.replace(/: .+$/, ': [PARTIAL]'));
        } else if (distortionRoll < 0.35) {
          distorted.push(PerceptionFilter.perturbNumericValue(line, 0.25));
        } else {
          distorted.push(line);
        }
      } else if (distortionRoll < 0.05) {
        distorted.push(PerceptionFilter.perturbNumericValue(line, 0.1));
      } else {
        distorted.push(line);
      }
    }

    return distorted.join('\n');
  }

  /** Perturb a numeric YAML value: large values become approximations, small ones ranges. */
  private static perturbNumericValue(line: string, factor: number): string {
    const match = line.match(/^(\s*[A-Za-z_-]+:\s*)([\d.]+)(.*)$/);
    if (!match) return line;

    const prefix = match[1]!;
    const value = parseFloat(match[2]!);
    const suffix = match[3] ?? '';

    if (isNaN(value)) return line;

    const spread = value * factor;
    const lo = Math.round(value - spread);
    const hi = Math.round(value + spread);

    if (Math.abs(value) > 1000) {
      const noisy = Math.round(value * (1 + (Math.random() - 0.5) * factor * 2));
      return `${prefix}~${noisy}${suffix}`;
    }
    return `${prefix}${lo}-${hi}${suffix}`;
  }

  /** Filter the world state for an agent and apply {@link distortPerception}. */
  public static generateDistortedPerception(
    worldState: Readonly<IWorldState>,
    countryId: EntityId,
    intelligenceLevel: number,
    config: IPerceptionFilterConfig = {},
  ): string {
    const rawDump = PerceptionFilter.generatePerceptionDump(worldState, countryId, config);
    return PerceptionFilter.distortPerception(rawDump, intelligenceLevel);
  }
}
