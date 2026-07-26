// escalation-ladder — enforces a realistic 5-level geopolitical escalation
// ladder. Wars cannot be declared on Turn 1; nations must accumulate tension
// and a casus belli over consecutive turns before escalating to war.

export const MIN_TICK_BEFORE_WAR = 5;

export enum EscalationLevel {
  Normal = 0,
  DiplomaticFriction = 1,
  BorderTensions = 2,
  DiplomaticCrisis = 3,
  War = 4,
}

export interface IEscalationContext {
  tick: number;
  tension: number;
  casusBelli: number;
  ultimatumTick: number | null;
  hasSharedBorder: boolean;
  hasNavalProjection: boolean;
}

/** Classify a tension value (0-100) into an escalation level. */
export function classifyEscalation(tension: number): EscalationLevel {
  if (tension >= 95) return EscalationLevel.War;
  if (tension >= 80) return EscalationLevel.DiplomaticCrisis;
  if (tension >= 60) return EscalationLevel.BorderTensions;
  if (tension >= 40) return EscalationLevel.DiplomaticFriction;
  return EscalationLevel.Normal;
}

/** Determine whether a war declaration is permitted under the escalation ladder. */
export function canDeclareWar(ctx: IEscalationContext): { allowed: boolean; reason: string } {
  if (ctx.tick <= MIN_TICK_BEFORE_WAR) {
    return {
      allowed: false,
      reason: `War declarations blocked before tick ${MIN_TICK_BEFORE_WAR + 1} (current: ${ctx.tick})`,
    };
  }

  if (ctx.tension < 95) {
    return {
      allowed: false,
      reason: `Tension ${ctx.tension.toFixed(1)} below war threshold (95+)`,
    };
  }

  const hasCasusBelli = ctx.casusBelli >= 3;
  const ultimatumExpired = ctx.ultimatumTick !== null && ctx.tick >= ctx.ultimatumTick + 3;

  if (!hasCasusBelli && !ultimatumExpired) {
    return {
      allowed: false,
      reason: `No active casus belli (need 3+ turns of high tension or expired ultimatum)`,
    };
  }

  if (!ctx.hasSharedBorder && !ctx.hasNavalProjection) {
    return {
      allowed: false,
      reason: `No geographic contiguity or naval projection capability`,
    };
  }

  return { allowed: true, reason: 'All escalation prerequisites met' };
}

/** Track casus belli accumulation. Tension 80+ for consecutive turns builds casus belli. */
export function accumulateCasusBelli(
  currentCasusBelli: number,
  tension: number,
): number {
  if (tension >= 80) {
    return currentCasusBelli + 1;
  }
  if (tension < 60) {
    return Math.max(0, currentCasusBelli - 1);
  }
  return currentCasusBelli;
}

/** Determine the appropriate escalation action for a nation given its tension level. */
export function getEscalationAction(
  tension: number,
  tick: number,
): { actionType: string; description: string } | null {
  const level = classifyEscalation(tension);

  switch (level) {
    case EscalationLevel.Normal:
      return null;
    case EscalationLevel.DiplomaticFriction:
      return {
        actionType: 'diplomacy.recall-ambassador',
        description: 'diplomatic friction — verbal warnings, tariff threats',
      };
    case EscalationLevel.BorderTensions:
      return {
        actionType: 'economy.impose-sanction',
        description: 'border tensions — sanctions, covert operations, troop posturing',
      };
    case EscalationLevel.DiplomaticCrisis:
      return {
        actionType: 'military.mobilize',
        description: `diplomatic crisis — mobilization, ultimatum issued at tick ${tick}`,
      };
    case EscalationLevel.War:
      return {
        actionType: 'war.declared',
        description: 'war declaration — all prerequisites met',
      };
    default:
      return null;
  }
}
