// StrictIntentParser — validates and acknowledges the JSON intent payloads that
// the dashboard's action buttons emit. Mirrors the backend "strict" contract so
// the frontend can format payloads and trust the server to either accept them
// (with simulated consequences) or reject them with a reason.

import type { Country, GameEvent, IntentResponse, StrictIntent, WorldSeed } from "../shared/types.js";

export class StrictIntentParser {
  constructor(private readonly seed: WorldSeed) {}

  private find(code: string): Country | undefined {
    return this.seed.countries.find((c) => c.id === code);
  }

  private now(): string {
    return new Date().toISOString();
  }

  parse(raw: unknown): IntentResponse {
    if (typeof raw !== "object" || raw === null) {
      return { ok: false, error: "payload must be a JSON object" };
    }
    const intent = raw as Partial<StrictIntent>;
    if (!intent.intent || typeof intent.intent !== "string") {
      return { ok: false, error: 'missing or invalid "intent" field' };
    }

    switch (intent.intent) {
      case "declare-war":
      case "propose-trade":
      case "improve-relations":
      case "send-aid":
      case "gather-intel":
      case "fund-sabotage":
        return this.parseCountryIntent(
          intent as Partial<Extract<StrictIntent, { from: string; target: string; intent: string }>>
        );
      case "move-unit":
      case "disband-unit":
        return this.parseUnitIntent(intent as Partial<Extract<StrictIntent, { unitId: string }>>);
      case "set-tax":
      case "set-readiness":
      case "set-posture":
      case "recruit-unit":
        return this.parsePlayerIntent(intent as Partial<StrictIntent>);
      default:
        return { ok: false, error: `unsupported intent "${intent.intent}"` };
    }
  }

  /** Validate policy, covert-op, and recruitment intents that target the player's own nation. */
  private parsePlayerIntent(intent: Partial<StrictIntent>): IntentResponse {
    const i = intent.intent as "set-tax" | "set-readiness" | "set-posture" | "recruit-unit";
    const from = (intent as Partial<Extract<StrictIntent, { from: string }>>).from;
    if (typeof from !== "string") {
      return { ok: false, error: '"from" must be a string' };
    }
    if (!this.find(from)) {
      return { ok: false, error: `unknown "from" country: ${from}` };
    }

    if (i === "set-tax") {
      const rate = (intent as Extract<StrictIntent, { intent: "set-tax" }>).rate;
      if (typeof rate !== "number" || rate < 0 || rate > 1) {
        return { ok: false, error: '"rate" must be a number between 0 and 1' };
      }
      return { ok: true, acknowledged: intent as Extract<StrictIntent, { intent: "set-tax" }>, events: [] };
    }
    if (i === "set-readiness") {
      const level = (intent as Extract<StrictIntent, { intent: "set-readiness" }>).level;
      if (typeof level !== "number" || level < 0 || level > 100) {
        return { ok: false, error: '"level" must be a number between 0 and 100' };
      }
      return { ok: true, acknowledged: intent as Extract<StrictIntent, { intent: "set-readiness" }>, events: [] };
    }
    if (i === "set-posture") {
      const posture = (intent as Extract<StrictIntent, { intent: "set-posture" }>).posture;
      if (!posture || typeof posture !== "string") {
        return { ok: false, error: '"posture" must be a DiplomaticPosture string' };
      }
      return { ok: true, acknowledged: intent as Extract<StrictIntent, { intent: "set-posture" }>, events: [] };
    }
    // recruit-unit
    const recruit = intent as Extract<StrictIntent, { intent: "recruit-unit" }>;
    if (typeof recruit.unitType !== "string" || !["infantry", "armor", "navy"].includes(recruit.unitType)) {
      return { ok: false, error: '"unitType" must be one of: infantry, armor, navy' };
    }
    if (typeof recruit.cost !== "number" || recruit.cost <= 0) {
      return { ok: false, error: '"cost" must be a positive number' };
    }
    return { ok: true, acknowledged: recruit, events: [] };
  }

  private parseCountryIntent(
    intent: Partial<Extract<StrictIntent, { from: string; target: string; intent: string }>>
  ): IntentResponse {
    if (typeof intent.from !== "string" || typeof intent.target !== "string") {
      return { ok: false, error: '"from" and "target" must be alpha-3 country codes' };
    }
    if (intent.from === intent.target) {
      return { ok: false, error: "a country cannot target itself" };
    }
    if (!this.find(intent.from)) {
      return { ok: false, error: `unknown "from" country: ${intent.from}` };
    }
    if (!this.find(intent.target)) {
      return { ok: false, error: `unknown "target" country: ${intent.target}` };
    }
    switch (intent.intent) {
      case "declare-war":
        return this.handleDeclareWar(intent as Extract<StrictIntent, { intent: "declare-war" }>);
      case "propose-trade":
        return this.handleProposeTrade(intent as Extract<StrictIntent, { intent: "propose-trade" }>);
      case "improve-relations":
        return this.handleImproveRelations(
          intent as Extract<StrictIntent, { intent: "improve-relations" }>
        );
      default:
        return { ok: false, error: "unreachable" };
    }
  }

  private parseUnitIntent(
    intent: Partial<Extract<StrictIntent, { unitId: string; from: string }>>
  ): IntentResponse {
    if (typeof intent.unitId !== "string" || typeof intent.from !== "string") {
      return { ok: false, error: '"unitId" and "from" must be strings' };
    }
    if (!this.find(intent.from)) {
      return { ok: false, error: `unknown "from" country: ${intent.from}` };
    }
    if (intent.intent === "move-unit") {
      const move = intent as Extract<StrictIntent, { intent: "move-unit" }>;
      if (!Array.isArray(move.to) || move.to.length !== 2 || move.to.some((v) => typeof v !== "number")) {
        return { ok: false, error: '"to" must be a [lat, lng] number pair' };
      }
      return { ok: true, acknowledged: move, events: [] };
    }
    const disband = intent as Extract<StrictIntent, { intent: "disband-unit" }>;
    return {
      ok: true,
      acknowledged: disband,
      events: [{ type: "war.unit-destroyed", at: this.now(), unitId: disband.unitId, ownerCode: disband.from, by: disband.from }],
    };
  }

  private handleDeclareWar(
    intent: Extract<StrictIntent, { intent: "declare-war" }>
  ): IntentResponse {
    const attacker = this.find(intent.from)!;
    const defender = this.find(intent.target)!;
    // crude combat resolution from readiness + morale + force
    const aPower = attacker.military.readiness * attacker.military.morale * attacker.military.forceLimit;
    const dPower = defender.military.readiness * defender.military.morale * defender.military.forceLimit;
    const attackerLosses = Math.round(attacker.military.forceLimit * 0.2);
    const defenderLosses = Math.round(defender.military.forceLimit * 0.25);
    const victor = aPower >= dPower ? attacker.id : defender.id;

    const evt: GameEvent = {
      type: "war.combat-resolved",
      at: this.now(),
      attacker: attacker.id,
      defender: defender.id,
      attackerLosses,
      defenderLosses,
      victor,
    };
    return { ok: true, acknowledged: intent, events: [evt] };
  }

  private handleProposeTrade(
    intent: Extract<StrictIntent, { intent: "propose-trade" }>
  ): IntentResponse {
    const a = this.find(intent.from)!;
    const d = this.find(intent.target)!;
    // trade lifts both treasuries slightly and GDP ticks up
    const lift = Math.round(Math.min(a.economy.gdp, d.economy.gdp) * 0.001);
    const evt: GameEvent = {
      type: "diplomacy.treaty-signed",
      at: this.now(),
      parties: [a.id, d.id],
      kind: "trade",
      durationYears: 5,
    };
    const eco: GameEvent = {
      type: "economy.indicator",
      at: this.now(),
      country: a.id,
      gdp: a.economy.gdp + lift,
      treasury: a.economy.treasury + lift,
      delta: lift,
    };
    return { ok: true, acknowledged: intent, events: [evt, eco] };
  }

  private handleImproveRelations(
    intent: Extract<StrictIntent, { intent: "improve-relations" }>
  ): IntentResponse {
    const a = this.find(intent.from)!;
    const d = this.find(intent.target)!;
    const evt: GameEvent = {
      type: "diplomacy.treaty-signed",
      at: this.now(),
      parties: [a.id, d.id],
      kind: "non-aggression",
      durationYears: 10,
    };
    return { ok: true, acknowledged: intent, events: [evt] };
  }
}
