import { describe, it, expect, beforeEach } from 'vitest';
import {
  canDeclareWar,
  classifyEscalation,
  accumulateCasusBelli,
  getEscalationAction,
  EscalationLevel,
  MIN_TICK_BEFORE_WAR,
  type IEscalationContext,
} from './escalation-ladder.js';
import { runAIDirector, resetEscalationState, PLAYER_CODE } from '../../../aiDirector.js';
import type { Country } from '../../../shared/types.js';

function makeCountry(overrides: Partial<Country> = {}): Country {
  return {
    id: 'TEST',
    numericCode: '000',
    name: 'Test Nation',
    flag: '',
    latlng: [0, 0],
    region: 'TestRegion',
    subregion: 'TestSubregion',
    population: 1_000_000,
    economy: {
      gdp: 100e9,
      gdpPerCapita: 100_000,
      treasury: 50e9,
      taxRate: 0.25,
      stability: 70,
    },
    military: {
      totalPersonnel: 100_000,
      readiness: 80,
      morale: 70,
      forceLimit: 100_000,
    },
    posture: 'diplomatic',
    relationships: [],
    ...overrides,
  };
}

function makeContext(overrides: Partial<IEscalationContext> = {}): IEscalationContext {
  return {
    tick: 10,
    tension: 96,
    casusBelli: 3,
    ultimatumTick: 7,
    hasSharedBorder: true,
    hasNavalProjection: false,
    ...overrides,
  };
}

describe('Escalation Ladder — canDeclareWar', () => {
  it('blocks war declarations on or before tick 5', () => {
    for (let tick = 1; tick <= MIN_TICK_BEFORE_WAR; tick++) {
      const ctx = makeContext({ tick });
      const result = canDeclareWar(ctx);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blocked before tick');
    }
  });

  it('allows war declarations after tick 5 when all prerequisites are met', () => {
    const ctx = makeContext({ tick: 6 });
    const result = canDeclareWar(ctx);
    expect(result.allowed).toBe(true);
  });

  it('blocks war when tension is below 95', () => {
    const ctx = makeContext({ tick: 10, tension: 80 });
    const result = canDeclareWar(ctx);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('below war threshold');
  });

  it('blocks war when casus belli < 3 and no expired ultimatum', () => {
    const ctx = makeContext({ tick: 10, casusBelli: 1, ultimatumTick: null });
    const result = canDeclareWar(ctx);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('casus belli');
  });

  it('allows war when ultimatum has expired even without casus belli 3+', () => {
    const ctx = makeContext({ tick: 10, casusBelli: 0, ultimatumTick: 7 });
    const result = canDeclareWar(ctx);
    expect(result.allowed).toBe(true);
  });

  it('blocks war when ultimatum has NOT expired yet (less than 3 turns)', () => {
    const ctx = makeContext({ tick: 9, casusBelli: 0, ultimatumTick: 8 });
    const result = canDeclareWar(ctx);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('casus belli');
  });

  it('blocks war when no shared border and no naval projection', () => {
    const ctx = makeContext({ hasSharedBorder: false, hasNavalProjection: false });
    const result = canDeclareWar(ctx);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('No geographic contiguity');
  });

  it('allows war with naval projection even without shared border', () => {
    const ctx = makeContext({ hasSharedBorder: false, hasNavalProjection: true });
    const result = canDeclareWar(ctx);
    expect(result.allowed).toBe(true);
  });
});

describe('Escalation Ladder — classifyEscalation', () => {
  it('classifies tension 0-39 as Normal', () => {
    expect(classifyEscalation(0)).toBe(EscalationLevel.Normal);
    expect(classifyEscalation(39)).toBe(EscalationLevel.Normal);
  });

  it('classifies tension 40-59 as DiplomaticFriction', () => {
    expect(classifyEscalation(40)).toBe(EscalationLevel.DiplomaticFriction);
    expect(classifyEscalation(59)).toBe(EscalationLevel.DiplomaticFriction);
  });

  it('classifies tension 60-79 as BorderTensions', () => {
    expect(classifyEscalation(60)).toBe(EscalationLevel.BorderTensions);
    expect(classifyEscalation(79)).toBe(EscalationLevel.BorderTensions);
  });

  it('classifies tension 80-94 as DiplomaticCrisis', () => {
    expect(classifyEscalation(80)).toBe(EscalationLevel.DiplomaticCrisis);
    expect(classifyEscalation(94)).toBe(EscalationLevel.DiplomaticCrisis);
  });

  it('classifies tension 95+ as War', () => {
    expect(classifyEscalation(95)).toBe(EscalationLevel.War);
    expect(classifyEscalation(100)).toBe(EscalationLevel.War);
  });
});

describe('Escalation Ladder — accumulateCasusBelli', () => {
  it('accumulates casus belli when tension is 80+', () => {
    expect(accumulateCasusBelli(0, 80)).toBe(1);
    expect(accumulateCasusBelli(1, 85)).toBe(2);
    expect(accumulateCasusBelli(2, 95)).toBe(3);
  });

  it('decays casus belli when tension drops below 60', () => {
    expect(accumulateCasusBelli(5, 50)).toBe(4);
    expect(accumulateCasusBelli(1, 30)).toBe(0);
  });

  it('does not decay below zero', () => {
    expect(accumulateCasusBelli(0, 30)).toBe(0);
  });

  it('holds steady when tension is 60-79', () => {
    expect(accumulateCasusBelli(3, 70)).toBe(3);
  });
});

describe('Escalation Ladder — getEscalationAction', () => {
  it('returns null for normal tension', () => {
    expect(getEscalationAction(20, 10)).toBeNull();
  });

  it('returns diplomatic friction actions for tension 40-59', () => {
    const action = getEscalationAction(50, 10);
    expect(action).not.toBeNull();
    expect(action!.actionType).toBe('diplomacy.recall-ambassador');
  });

  it('returns sanction actions for tension 60-79', () => {
    const action = getEscalationAction(70, 10);
    expect(action).not.toBeNull();
    expect(action!.actionType).toBe('economy.impose-sanction');
  });

  it('returns mobilization actions for tension 80-94', () => {
    const action = getEscalationAction(85, 10);
    expect(action).not.toBeNull();
    expect(action!.actionType).toBe('military.mobilize');
  });

  it('returns war declaration action for tension 95+', () => {
    const action = getEscalationAction(96, 10);
    expect(action).not.toBeNull();
    expect(action!.actionType).toBe('war.declared');
  });
});

describe('AI Director — Turn 1-5 War Prevention', () => {
  beforeEach(() => {
    resetEscalationState();
  });

  it('produces zero war.declared events during ticks 1-5', () => {
    const honduras = makeCountry({
      id: 'HND',
      name: 'Honduras',
      region: 'Americas',
      subregion: 'Central America',
      military: { totalPersonnel: 20000, readiness: 50, morale: 60, forceLimit: 20000 },
      relationships: [
        { countryCode: 'ABW', affinity: -80, tension: 99 },
      ],
    });
    const aruba = makeCountry({
      id: 'ABW',
      name: 'Aruba',
      region: 'Americas',
      subregion: 'Caribbean',
      military: { totalPersonnel: 5000, readiness: 40, morale: 50, forceLimit: 5000 },
      relationships: [
        { countryCode: 'HND', affinity: -80, tension: 99 },
      ],
    });
    const usa = makeCountry({ id: PLAYER_CODE, name: 'United States' });
    const countries = [usa, honduras, aruba];

    let warCount = 0;
    for (let tick = 1; tick <= 5; tick++) {
      const { decisions } = runAIDirector(countries, tick);
      for (const d of decisions) {
        warCount += d.events.filter((e) => e.type === 'war.declared').length;
      }
    }

    expect(warCount).toBe(0);
  });

  it('does not produce war.declared events when tension is below 95', () => {
    const aggr = makeCountry({
      id: 'AGGR',
      name: 'Aggressor',
      relationships: [{ countryCode: 'TGT', affinity: -50, tension: 70 }],
    });
    const target = makeCountry({
      id: 'TGT',
      name: 'Target',
      relationships: [{ countryCode: 'AGGR', affinity: -50, tension: 70 }],
    });
    const usa = makeCountry({ id: PLAYER_CODE });
    const countries = [usa, aggr, target];

    let warCount = 0;
    for (let tick = 1; tick <= 20; tick++) {
      const { decisions } = runAIDirector(countries, tick);
      for (const d of decisions) {
        warCount += d.events.filter((e) => e.type === 'war.declared').length;
      }
    }

    expect(warCount).toBe(0);
  });
});

describe('AI Director — Escalation Ladder Integration', () => {
  beforeEach(() => {
    resetEscalationState();
  });

  it('produces escalating actions (not war) at intermediate tension levels', () => {
    const aggr = makeCountry({
      id: 'AGGR3',
      name: 'Aggressor3',
      relationships: [{ countryCode: 'TGT3', affinity: -30, tension: 55 }],
    });
    const target = makeCountry({
      id: 'TGT3',
      name: 'Target3',
      relationships: [{ countryCode: 'AGGR3', affinity: -30, tension: 55 }],
    });
    const usa = makeCountry({ id: PLAYER_CODE });
    const countries = [usa, aggr, target];

    const actionTypes: string[] = [];
    for (let tick = 1; tick <= 10; tick++) {
      const { decisions } = runAIDirector(countries, tick);
      for (const d of decisions) {
        for (const e of d.events) {
          if (e.type === 'ai.decision') {
            actionTypes.push((e as { action: string }).action);
          }
        }
      }
    }

    const warActions = actionTypes.filter((a) => a.includes('declare war'));
    expect(warActions.length).toBe(0);
  });
});
