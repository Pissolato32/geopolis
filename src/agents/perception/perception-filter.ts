import { IWorldState } from '../../core/interfaces/world-state.interface.js';
import { EntityId } from '../../core/interfaces/entity.interface.js';
import { IDenseStateDumpOptions } from '../../core/interfaces/state-serializer.interface.js';

export interface IPerceptionFilterConfig {
  readonly includeAllies?: boolean;
  readonly focalRadius?: number;
  readonly includeActiveCrises?: boolean;
}

/**
 * Filter mechanism enforcing Fog of War constraints on global WorldState.
 * Prevents agents from accessing omniscient global state.
 */
export class PerceptionFilter {
  /**
   * Produce a dense, token-optimized YAML perception payload for a given agent country.
   *
   * @param worldState - The ground-truth WorldState.
   * @param countryId - The agent's focal country EntityId.
   * @param config - Filter options.
   * @returns Filtered dense YAML string payload for LLM prompt context.
   */
  public static generatePerceptionDump(
    worldState: Readonly<IWorldState>,
    countryId: EntityId,
    config: IPerceptionFilterConfig = {},
  ): string {
    const dumpOptions: IDenseStateDumpOptions = {
      perspectiveEntityId: countryId,
      focalRadius: config.focalRadius ?? 2,
      includeActiveCrises: config.includeActiveCrises ?? true,
      formatYaml: true,
      stripMetadata: true,
    };

    return worldState.dumpStateForAnalysis(dumpOptions);
  }

  /**
   * Apply Fog of War distortion to a perception dump based on intelligence level.
   * Higher intelligence levels produce more accurate perception; lower levels
   * introduce noise, redaction, and potential disinformation.
   *
   * @param perceptionDump - The raw dense YAML perception string.
   * @param intelligenceLevel - 0.0 (blind) to 1.0 (perfect intel).
   * @returns Distorted perception string with noise/redaction applied.
   */
  public static distortPerception(
    perceptionDump: string,
    intelligenceLevel: number,
  ): string {
    if (intelligenceLevel >= 0.9) return perceptionDump; // Near-perfect intel

    const lines = perceptionDump.split('\n');
    const distorted: string[] = [];

    for (const line of lines) {
      // Skip YAML structure lines (keys, indentation markers)
      const isStructural = /^\s*[A-Za-z_-]+:/.test(line) || line.trim() === '' || line.trim().startsWith('-');
      if (isStructural && !line.includes(': ')) {
        distorted.push(line);
        continue;
      }

      // Determine distortion level for this line
      const distortionRoll = Math.random();

      if (intelligenceLevel < 0.3) {
        // Low intel: 40% chance to redact values, 10% chance to inject noise
        if (distortionRoll < 0.4) {
          // Redact the value
          distorted.push(line.replace(/: .+$/, ': [REDACTED]'));
        } else if (distortionRoll < 0.5) {
          // Inject noise — perturb numeric values
          distorted.push(PerceptionFilter.perturbNumericValue(line, 0.5));
        } else {
          distorted.push(line);
        }
      } else if (intelligenceLevel < 0.6) {
        // Medium intel: 20% chance to redact, 15% chance to perturb
        if (distortionRoll < 0.2) {
          distorted.push(line.replace(/: .+$/, ': [PARTIAL]'));
        } else if (distortionRoll < 0.35) {
          distorted.push(PerceptionFilter.perturbNumericValue(line, 0.25));
        } else {
          distorted.push(line);
        }
      } else {
        // High intel: 5% chance to slightly perturb
        if (distortionRoll < 0.05) {
          distorted.push(PerceptionFilter.perturbNumericValue(line, 0.1));
        } else {
          distorted.push(line);
        }
      }
    }

    return distorted.join('\n');
  }

  /**
   * Perturb numeric values in a YAML line by a given factor.
   * E.g., "gdp: 500000" with factor 0.3 → "gdp: ~350000-650000 (est.)"
   */
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

    // For small values, show as range; for large values, show as approximate
    if (Math.abs(value) > 1000) {
      const noisy = Math.round(value * (1 + (Math.random() - 0.5) * factor * 2));
      return `${prefix}~${noisy}${suffix}`;
    }
    return `${prefix}${lo}-${hi}${suffix}`;
  }

  /**
   * Generate a distorted perception dump combining filtering and distortion.
   * This is the main entry point for agents with non-perfect intelligence.
   *
   * @param worldState - The ground-truth WorldState.
   * @param countryId - The agent's focal country EntityId.
   * @param intelligenceLevel - 0.0 (blind) to 1.0 (perfect intel).
   * @param config - Filter options.
   * @returns Filtered and distorted YAML perception string.
   */
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
