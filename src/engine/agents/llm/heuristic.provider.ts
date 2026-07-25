import { ILlmProvider } from './llm-provider.interface.js';

export interface IHeuristicContext {
  countryId: string;
  metrics: {
    stabilityIndex: number | undefined;
    treasury: number | undefined;
    gdp: number | undefined;
    foodOutput: number | undefined;
    lowestAffinity: number | undefined;
    lowestAffinityTarget: string | undefined;
    highestTension: number | undefined;
    highestTensionTarget: string | undefined;
    highestAffinity: number | undefined;
    highestAffinityTarget: string | undefined;
  };
}

export class HeuristicAgentProvider implements ILlmProvider {
  private context: IHeuristicContext | undefined;

  constructor(context?: IHeuristicContext) {
    if (context) {
      this.context = context;
    }
  }

  setContext(context: IHeuristicContext): void {
    this.context = context;
  }

  clearContext(): void {
    this.context = undefined;
  }

  async evaluate(prompt: string, _systemPrompt?: string): Promise<string> {
    const action = this.decide(prompt);
    return JSON.stringify(action);
  }

  private decide(prompt: string): {
    actionType: string;
    actorEntityId: string;
    parameters: Record<string, unknown>;
    narrativeSummary: string;
  } {
    let countryId: string;
    let stabilityIndex: number | undefined;
    let treasury: number | undefined;
    let foodOutput: number | undefined;
    let lowestAffinity: number | undefined;
    let lowestAffinityTarget: string | undefined;
    let highestTension: number | undefined;
    let highestTensionTarget: string | undefined;
    let highestAffinity: number | undefined;
    let highestAffinityTarget: string | undefined;

    if (this.context) {
      countryId = this.context.countryId;
      stabilityIndex = this.context.metrics.stabilityIndex;
      treasury = this.context.metrics.treasury;
      foodOutput = this.context.metrics.foodOutput;
      lowestAffinity = this.context.metrics.lowestAffinity;
      lowestAffinityTarget = this.context.metrics.lowestAffinityTarget;
      highestTension = this.context.metrics.highestTension;
      highestTensionTarget = this.context.metrics.highestTensionTarget;
      highestAffinity = this.context.metrics.highestAffinity;
      highestAffinityTarget = this.context.metrics.highestAffinityTarget;
    } else {
      const fallback = this.extractFromPrompt(prompt);
      countryId = fallback.countryId;
      stabilityIndex = fallback.stabilityIndex;
      treasury = fallback.treasury;
      foodOutput = fallback.foodOutput;
      lowestAffinity = fallback.lowestAffinity;
      lowestAffinityTarget = fallback.lowestAffinityTarget;
      highestTension = fallback.highestTension;
      highestTensionTarget = fallback.highestTensionTarget;
      highestAffinity = fallback.highestAffinity;
      highestAffinityTarget = fallback.highestAffinityTarget;
    }

    if (stabilityIndex !== undefined && stabilityIndex < 0.6) {
      return {
        actionType: 'politics.maintain-stability',
        actorEntityId: countryId,
        parameters: { priority: 'high' },
        narrativeSummary: 'High priority stability maintenance due to low stability index',
      };
    }

    if (treasury !== undefined && treasury < 200) {
      return {
        actionType: 'economy.invest',
        actorEntityId: countryId,
        parameters: { amount: Math.round(treasury * 0.1) },
        narrativeSummary: 'Economic investment to boost treasury reserves',
      };
    }

    if (
      lowestAffinity !== undefined &&
      lowestAffinity < -0.3 &&
      lowestAffinityTarget &&
      treasury !== undefined &&
      treasury > 500
    ) {
      return {
        actionType: 'economy.impose-sanction',
        actorEntityId: countryId,
        parameters: {
          targetCountryId: lowestAffinityTarget,
          sanctionType: 'trade-embargo',
          severity: 0.7,
        },
        narrativeSummary: `Imposed trade embargo on ${lowestAffinityTarget} due to hostile relations`,
      };
    }

    if (
      highestTension !== undefined &&
      highestTension > 0.7 &&
      highestTensionTarget
    ) {
      return {
        actionType: 'military.deploy-unit',
        actorEntityId: countryId,
        parameters: {
          targetCountryId: highestTensionTarget,
          unitName: 'Border Security Force',
          personnel: 10000,
        },
        narrativeSummary: `Deployed border security force near ${highestTensionTarget} due to rising tensions`,
      };
    }

    if (
      highestAffinity !== undefined &&
      highestAffinity > 0.5 &&
      highestAffinityTarget &&
      foodOutput !== undefined &&
      foodOutput < 200
    ) {
      return {
        actionType: 'economy.establish-trade-route',
        actorEntityId: countryId,
        parameters: {
          targetCountryId: highestAffinityTarget,
          resourceType: 'food',
          volumePerTick: 5,
        },
        narrativeSummary: `Established food trade route with ally ${highestAffinityTarget}`,
      };
    }

    return {
      actionType: 'politics.maintain-stability',
      actorEntityId: countryId,
      parameters: {},
      narrativeSummary: 'Maintained governance stability',
    };
  }

  private extractFromPrompt(prompt: string): {
    countryId: string;
    stabilityIndex: number | undefined;
    treasury: number | undefined;
    foodOutput: number | undefined;
    lowestAffinity: number | undefined;
    lowestAffinityTarget: string | undefined;
    highestTension: number | undefined;
    highestTensionTarget: string | undefined;
    highestAffinity: number | undefined;
    highestAffinityTarget: string | undefined;
  } {
    const countryMatch = prompt.match(/political leader of\s+([\w-]+)/);
    const countryId = countryMatch?.[1] ?? 'unknown';

    const stabilityMatch = prompt.match(/stabilityIndex:\s*"?([\d.]+)"?/);
    const treasuryMatch = prompt.match(/treasury:\s*"?([\d.]+)"?/);
    const foodMatch = prompt.match(/foodOutput:\s*"?([\d.]+)"?/);
    const affinityMatch = prompt.match(/affinity=(-?[\d.]+)/);
    const tensionMatch = prompt.match(/tension=(-?[\d.]+)/);

    const affinity = affinityMatch ? parseFloat(affinityMatch[1]!) : undefined;
    const tension = tensionMatch ? parseFloat(tensionMatch[1]!) : undefined;

    const targetMatch = prompt.match(/\[affinity=/);
    let affinityTarget: string | undefined;
    if (targetMatch) {
      const before = prompt.slice(0, targetMatch.index).trim();
      const lastLine = before.split('\n').pop();
      if (lastLine) {
        const idMatch = lastLine.match(/-\s*id:\s*(\S+)/);
        affinityTarget = idMatch?.[1];
      }
    }

    return {
      countryId,
      stabilityIndex: stabilityMatch ? parseFloat(stabilityMatch[1]!) : undefined,
      treasury: treasuryMatch ? parseFloat(treasuryMatch[1]!) : undefined,
      foodOutput: foodMatch ? parseFloat(foodMatch[1]!) : undefined,
      lowestAffinity: affinity !== undefined ? affinity : undefined,
      lowestAffinityTarget: affinityTarget,
      highestTension: tension !== undefined ? tension : undefined,
      highestTensionTarget: affinityTarget,
      highestAffinity: affinity !== undefined ? affinity : undefined,
      highestAffinityTarget: affinityTarget,
    };
  }
}
