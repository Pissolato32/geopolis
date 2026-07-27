import { CountryMilitaryDetailComponent } from '../components/military-detail.component.js';

/**
 * Combined Arms combat math — pure functions, no side effects.
 * Reads the CountryMilitaryDetailComponent of belligerents and calculates
 * combat power using manpower, airpower (force multiplier), and logistics
 * (sustainment multiplier).
 */

export interface ICombatPowerBreakdown {
  readonly manpowerPower: number;
  readonly landPower: number;
  readonly airPower: number;
  readonly navalPower: number;
  readonly logisticsMultiplier: number;
  readonly airMultiplier: number;
  readonly totalPower: number;
}

/**
 * Calculate the combined-arms combat power for a country.
 *
 * Formula:
 *   basePower = (activePersonnel * 1.0) + (reservePersonnel * 0.3)
 *   landPower = tanks*3 + armoredVehicles*1 + artillery*2 + mlrs*2.5
 *   airPower  = fighterAircraft*4 + attackAircraft*3 + attackHelicopters*2
 *   navalPower = submarines*5 + destroyers*4 + frigates*2
 *
 *   airMultiplier = 1.0 + (airPower / (basePower + landPower + 1)) * 0.5
 *   logisticsMultiplier = 0.5 + logisticsScore * 0.5  (0.5 to 1.0)
 *
 *   totalPower = (basePower + landPower + navalPower) * airMultiplier * logisticsMultiplier
 */
export function calculateCombatPower(detail: CountryMilitaryDetailComponent): ICombatPowerBreakdown {
  const basePower = detail.activePersonnel + detail.reservePersonnel * 0.3;
  const landPower =
    detail.tanks * 3 +
    detail.armoredVehicles * 1 +
    (detail.selfPropelledArtillery + detail.towedArtillery) * 2 +
    detail.mlrs * 2.5;

  const airPower =
    detail.fighterAircraft * 4 +
    detail.attackAircraft * 3 +
    detail.attackHelicopters * 2;

  const navalPower =
    detail.submarines * 5 +
    detail.destroyers * 4 +
    detail.frigates * 2;

  const conventionalBase = basePower + landPower + navalPower + 1;
  const airMultiplier = 1.0 + (airPower / conventionalBase) * 0.5;
  const logisticsMultiplier = 0.5 + detail.logisticsScore * 0.5;

  const totalPower = (basePower + landPower + navalPower) * airMultiplier * logisticsMultiplier;

  return {
    manpowerPower: basePower,
    landPower,
    airPower,
    navalPower,
    logisticsMultiplier,
    airMultiplier,
    totalPower,
  };
}

/**
 * Calculate the military parity ratio between two belligerents.
 * Returns a value > 1.0 if attacker has advantage, < 1.0 if defender has advantage.
 */
export function calculateMilitaryParity(
  attacker: CountryMilitaryDetailComponent,
  defender: CountryMilitaryDetailComponent,
): number {
  const attackerPower = calculateCombatPower(attacker).totalPower;
  const defenderPower = calculateCombatPower(defender).totalPower;
  return attackerPower / (defenderPower + 1);
}

/**
 * Resolve a combat engagement between two belligerents.
 * Returns the outcome — who wins, casualty figures, and exhaustion deltas.
 * This is a PURE function — it does not mutate state or emit events.
 */
export interface ICombatOutcome {
  readonly victorId: string;
  readonly loserId: string;
  readonly attackerId: string;
  readonly defenderId: string;
  readonly attackerPower: number;
  readonly defenderPower: number;
  readonly attackerCasualties: number;
  readonly defenderCasualties: number;
  readonly attackerExhaustionDelta: number;
  readonly defenderExhaustionDelta: number;
}

export function resolveCombat(
  attackerId: string,
  defenderId: string,
  attackerDetail: CountryMilitaryDetailComponent,
  defenderDetail: CountryMilitaryDetailComponent,
  randomness: number = Math.random(),
): ICombatOutcome {
  const attackerBreakdown = calculateCombatPower(attackerDetail);
  const defenderBreakdown = calculateCombatPower(defenderDetail);

  const totalPower = attackerBreakdown.totalPower + defenderBreakdown.totalPower;
  if (totalPower === 0) {
    return {
      victorId: attackerId,
      loserId: defenderId,
      attackerId,
      defenderId,
      attackerPower: 0,
      defenderPower: 0,
      attackerCasualties: 0,
      defenderCasualties: 0,
      attackerExhaustionDelta: 0,
      defenderExhaustionDelta: 0,
    };
  }

  const attackerWinChance = attackerBreakdown.totalPower / totalPower;
  const attackerWins = randomness < attackerWinChance;
  const victorId = attackerWins ? attackerId : defenderId;
  const loserId = attackerWins ? defenderId : attackerId;

  // Casualties proportional to enemy power share
  const attackerCasualties = Math.round((defenderBreakdown.totalPower / totalPower) * 500);
  const defenderCasualties = Math.round((attackerBreakdown.totalPower / totalPower) * 500);

  // Exhaustion: loser takes more, scaled by casualty ratio
  const loserCasualties = attackerWins ? defenderCasualties : attackerCasualties;
  const winnerCasualties = attackerWins ? attackerCasualties : defenderCasualties;
  const baseExhaustion = 2;
  const attackerExhaustionDelta = attackerWins
    ? baseExhaustion + winnerCasualties * 0.01
    : baseExhaustion + loserCasualties * 0.02;
  const defenderExhaustionDelta = attackerWins
    ? baseExhaustion + loserCasualties * 0.02
    : baseExhaustion + winnerCasualties * 0.01;

  return {
    victorId,
    loserId,
    attackerId,
    defenderId,
    attackerPower: attackerBreakdown.totalPower,
    defenderPower: defenderBreakdown.totalPower,
    attackerCasualties,
    defenderCasualties,
    attackerExhaustionDelta: Math.round(attackerExhaustionDelta * 10) / 10,
    defenderExhaustionDelta: Math.round(defenderExhaustionDelta * 10) / 10,
  };
}
