// turnEngine — processes one simulation turn. Given the current countries
// (with live economy + military state) and units, it advances the world by
// one tick: grows/shrinks every economy, decays or escalates tensions,
// resolves pending combats (units in proximity to hostile nations), and
// generates a stream of GameEvents describing what happened. The caller is
// responsible for persisting the mutated countries/relationships/units back
// to Supabase.

import type { Country, GameEvent, Relationship, TurnSummary, Unit, CabinetCard, ActiveTreaty, InternationalBloc } from "./shared/types.js";
import { runAIDirector } from "./aiDirector.js";
import { generateNarrativeBeats, buildProfiles } from "./narrativeDirector.js";
import { createDefaultCabinet } from "./campaign/advisorTypes.js";
import { createInitialResearchState, advanceResearch } from "./research/researchEngine.js";
import { advanceCovertOps, createInitialCovertOpsState } from "./domain/intelligence/covertOps.js";
import { initializeBlocs, applyBlocEconomicBonuses, triggerCollectiveDefense } from "./domain/diplomacy/multilateralBlocs.js";
import { calculateVictoryProgress } from "./victory/victoryManager.js";

/** Evaluate the player country state and generate 0–3 dynamic cabinet cards. */
function generateCabinetCards(player: Country): CabinetCard[] {
  const cards: CabinetCard[] = [];

  if (player.economy.stability < 40 || player.military.militaryLoyalty < 40) {
    cards.push({
      id: "military-faction-unrest",
      title: "Military Faction Unrest & Coup Warning",
      description: `Military loyalty is at ${player.military.militaryLoyalty.toFixed(0)}% and stability is ${player.economy.stability.toFixed(0)}%. The junta grows restless. Failure to act may trigger a coup d'état.`,
      category: "Internal Politics",
      options: [
        {
          id: "concessions-to-junta",
          label: "Concessions to Junta",
          effects: { militaryLoyaltyDelta: 15, stabilityDelta: -5, treasuryDelta: -500 },
        },
        {
          id: "crackdown",
          label: "Crackdown on Dissent",
          effects: { militaryLoyaltyDelta: -10, stabilityDelta: 10, readinessDelta: 5 },
        },
      ],
    });
  }

  if (player.economy.treasury < 0) {
    cards.push({
      id: "emergency-financial-bailout",
      title: "Emergency Financial Bailout",
      description: `The national treasury is in deficit at ${player.economy.treasury.toLocaleString()}B. Immediate action is required to avoid economic collapse.`,
      category: "Economy",
      options: [
        {
          id: "austerity-cut",
          label: "Austerity Cut",
          effects: { treasuryDelta: 800, stabilityDelta: -10, legislativeSupportDelta: -0.1 },
        },
        {
          id: "international-loan",
          label: "International Loan",
          effects: { treasuryDelta: 1200, stabilityDelta: -3, tensionDelta: 5 },
        },
      ],
    });
  }

  if (player.economy.legislativeSupport < 0.4) {
    cards.push({
      id: "congressional-tax-reform-deadlock",
      title: "Congressional Tax & Reform Deadlock",
      description: `Legislative support has fallen to ${(player.economy.legislativeSupport * 100).toFixed(0)}%. The assembly is blocking key reforms and tax legislation.`,
      category: "Internal Politics",
      options: [
        {
          id: "negotiate-with-oligarchs",
          label: "Negotiate with Oligarchs",
          effects: { legislativeSupportDelta: 0.2, treasuryDelta: -300, stabilityDelta: 3 },
        },
        {
          id: "executive-order",
          label: "Executive Order",
          effects: { legislativeSupportDelta: -0.15, stabilityDelta: 5, tensionDelta: 3 },
        },
      ],
    });
  }

  return cards.slice(0, 3);
}

const at = () => new Date().toISOString();

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** One turn of simulation. Returns mutated state + the events it produced. */
export function processTurn(
  countries: Country[],
  units: Unit[],
  tick: number,
  playerCode?: string,
): { countries: Country[]; units: Unit[]; events: GameEvent[]; cabinetCards: CabinetCard[]; blocs: InternationalBloc[] } {
  const events: GameEvent[] = [];
  const byCode = new Map(countries.map((c) => [c.id, c]));

  // ---- 1. Economy: every nation grows or shrinks based on stability --------
  // Posture modifiers: the player's diplomatic posture shapes their economy
  // and domestic stability. AI nations use 'diplomatic' by default.
  const POSTURE_GROWTH: Record<string, number> = {
    isolationist: -0.003,  // less trade → slower growth
    diplomatic: 0,
    assertive: -0.001,     // military spending drags slightly
    expansionist: 0.002,   // resource acquisition boosts short-term
  };
  const POSTURE_STABILITY: Record<string, number> = {
    isolationist: 0.4,
    diplomatic: 0.2,
    assertive: -0.2,
    expansionist: -0.5,
  };

  let economiesGrown = 0;
  let economiesShrunk = 0;
  let globalGdpDelta = 0;
  const updated = countries.map((c) => {
    const postureGrowthMod = POSTURE_GROWTH[c.posture] ?? 0;
    const postureStabMod = POSTURE_STABILITY[c.posture] ?? 0;
    const growthRate = (c.economy.stability / 100) * 0.02 - 0.01 + postureGrowthMod; // -1%..+1%
    const noise = (Math.random() - 0.5) * 0.008;
    const gdpDelta = Math.round(c.economy.gdp * (growthRate + noise));
    const newGdp = Math.max(0, c.economy.gdp + gdpDelta);
    // treasury collects tax revenue proportional to GDP, stability, and tax rate
    const treasuryDelta = Math.round(c.economy.gdp * c.economy.taxRate * 0.005 * (c.economy.stability / 100));
    const newTreasury = c.economy.treasury + treasuryDelta;
    globalGdpDelta += gdpDelta;
    if (gdpDelta > 0) economiesGrown++;
    else if (gdpDelta < 0) economiesShrunk++;

    // stability drifts toward equilibrium, modified by posture
    const stabDelta = Math.round((Math.random() - 0.45) * 4 + postureStabMod);
    const newStab = clamp(c.economy.stability + stabDelta, 1, 100);
    if (Math.abs(stabDelta) >= 3) {
      events.push({
        type: "turn.stability-shift",
        at: at(),
        tick,
        country: c.id,
        stability: newStab,
        delta: stabDelta,
      });
    }

    // report growth for ~8% of nations each turn (keeps the log readable)
    if (Math.random() < 0.08) {
      events.push({
        type: "turn.economy-growth",
        at: at(),
        tick,
        country: c.id,
        gdpGrowth: gdpDelta,
        treasuryChange: treasuryDelta,
      });
    }

    return {
      ...c,
      economy: { ...c.economy, gdp: newGdp, treasury: newTreasury, stability: newStab },
      // expansionist posture naturally pushes readiness up each turn
      military: c.posture === "assertive" || c.posture === "expansionist"
        ? { ...c.military, readiness: clamp(c.military.readiness + 1, 10, 100) }
        : c.military,
    };
  });
  byCode.clear();
  for (const c of updated) byCode.set(c.id, c);

  // ---- 1b. AI Director: non-player nations make autonomous decisions --------
  const { decisions: aiDecisions, aiDecisionsMade } = runAIDirector(updated, tick);
  for (const d of aiDecisions) {
    events.push(...d.events);
    // apply relationship patches to the acting nation
    // (find the nation that owns each patch by checking which country has a
    // relationship with the patched counterpart — the acting nation is the
    // one whose AI decision events reference it)
    const actorCode = d.events.find((e) => e.type === "ai.decision" || e.type === "war.declared" || e.type === "peace.declared");
    const aggressor = actorCode && (actorCode as { aggressor?: string; initiator?: string; country?: string }).aggressor
      || (actorCode as { initiator?: string }).initiator
      || (actorCode as { country?: string }).country;
    if (aggressor) {
      const idx = updated.findIndex((x) => x.id === aggressor);
      if (idx >= 0) {
        const c = updated[idx];
        const newRels = c.relationships.map((r): Relationship => {
          const patch = d.relPatches.get(r.countryCode);
          if (!patch) return r;
          return {
            ...r,
            tension: patch.tension ?? r.tension,
            affinity: patch.affinity ?? r.affinity,
          };
        });
        const newEco = d.ecoPatch
          ? {
              ...c.economy,
              taxRate: d.ecoPatch.taxRate ?? c.economy.taxRate,
              treasury: c.economy.treasury + (d.ecoPatch.treasuryDelta ?? 0),
              stability: clamp(c.economy.stability + (d.ecoPatch.stabilityDelta ?? 0), 1, 100),
            }
          : c.economy;
        updated[idx] = {
          ...c,
          relationships: newRels,
          economy: newEco,
          military: d.milPatch
            ? {
                ...c.military,
                readiness: d.milPatch.readiness ?? c.military.readiness,
                morale: d.milPatch.morale ?? c.military.morale,
              }
            : c.military,
        };
      }
    }
  }
  byCode.clear();
  for (const c of updated) byCode.set(c.id, c);

  // ---- 2. Tensions: decay toward 0 for most, escalate for a few ----------
  let tensionsResolved = 0;
  for (const c of updated) {
    if (c.relationships.length === 0) continue;
    const rels = c.relationships.map((r): Relationship => {
      // 70% decay, 20% no change, 10% escalate
      const roll = Math.random();
      if (roll < 0.7) {
        const decay = -Math.round(1 + Math.random() * 3);
        const newTension = clamp(r.tension + decay, 0, 100);
        const newAffinity = clamp(r.affinity + Math.round(decay * 0.5), -100, 100);
        if (newTension !== r.tension) tensionsResolved++;
        return { ...r, tension: newTension, affinity: newAffinity };
      }
      if (roll < 0.9) return r;
      const escalate = Math.round(2 + Math.random() * 6);
      const newTension = clamp(r.tension + escalate, 0, 100);
      const newAffinity = clamp(r.affinity - escalate, -100, 100);
      tensionsResolved++;
      // report notable escalations
      if (escalate >= 5 && Math.random() < 0.3) {
        events.push({
          type: "turn.tension-shift",
          at: at(),
          tick,
          countryA: c.id,
          countryB: r.countryCode,
          delta: escalate,
          reason: pick(["border skirmish", "trade dispute", "espionage allegations", "diplomatic incident"]),
        });
      }
      return { ...r, tension: newTension, affinity: newAffinity };
    });
    const idx = updated.findIndex((x) => x.id === c.id);
    updated[idx] = { ...c, relationships: rels };
  }

  // ---- 3. Combat: units near hostile nations may clash --------------------
  let combats = 0;
  const survivingUnits: Unit[] = [];
  const lostUnitIds = new Set<string>();
  for (const u of units) {
    if (lostUnitIds.has(u.id)) continue;
    const owner = byCode.get(u.ownerCode);
    if (!owner) {
      survivingUnits.push(u);
      continue;
    }
    // chance of combat depends on owner's average tension
    const avgTension =
      owner.relationships.length > 0
        ? owner.relationships.reduce((s, r) => s + r.tension, 0) / owner.relationships.length
        : 20;
    const combatChance = Math.max(0, (avgTension - 40) / 600); // 0..~10%
    if (Math.random() < combatChance) {
      // find a hostile unit nearby
      const hostile = units.find((o) => {
        if (o.ownerCode === u.ownerCode || lostUnitIds.has(o.id)) return false;
        const dist = Math.hypot(o.latlng[0] - u.latlng[0], o.latlng[1] - u.latlng[1]);
        if (dist > 15) return false;
        const rel = owner.relationships.find((r) => r.countryCode === o.ownerCode);
        return rel && rel.tension >= 50;
      });
      if (hostile) {
        combats++;
        const uPower = u.readiness * u.morale * u.strength;
        const hPower = hostile.readiness * hostile.morale * hostile.strength;
        const uWins = uPower >= hPower;
        const loser = uWins ? hostile : u;
        const winner = uWins ? u : hostile;
        lostUnitIds.add(loser.id);
        events.push({
          type: "war.unit-destroyed",
          at: at(),
          unitId: loser.id,
          ownerCode: loser.ownerCode,
          by: winner.ownerCode,
        });
        // also a combat-resolved event for the nations
        events.push({
          type: "war.combat-resolved",
          at: at(),
          attacker: winner.ownerCode,
          defender: loser.ownerCode,
          attackerLosses: Math.round(loser.strength * 0.3),
          defenderLosses: Math.round(loser.strength * 0.5),
          victor: winner.ownerCode,
        });
        if (!lostUnitIds.has(u.id)) survivingUnits.push(u);
        continue;
      }
    }
    // small chance of morale/readiness drift
    if (Math.random() < 0.15) {
      survivingUnits.push({
        ...u,
        morale: clamp(u.morale + Math.round((Math.random() - 0.5) * 6), 10, 100),
        readiness: clamp(u.readiness + Math.round((Math.random() - 0.4) * 5), 10, 100),
      });
    } else {
      survivingUnits.push(u);
    }
  }

  // ---- 4. Diplomacy: occasional spontaneous treaties ----------------------
  let treaties = 0;
  const diploCandidates = updated.filter((c) => c.relationships.some((r) => r.affinity >= 40));
  for (let i = 0; i < 3; i++) {
    if (diploCandidates.length === 0) break;
    const a = pick(diploCandidates);
    const friend = a.relationships.find((r) => r.affinity >= 40);
    if (!friend) continue;
    if (Math.random() < 0.4) {
      treaties++;
      const treatyKind = Math.random() < 0.5 ? "trade" : "non-aggression";
      const treatyDur = Math.round(2 + Math.random() * 8);
      events.push({
        type: "diplomacy.treaty-signed",
        at: at(),
        parties: [a.id, friend.countryCode],
        kind: treatyKind,
        durationYears: treatyDur,
      });
      // Track the active treaty on both nations
      const treaty: ActiveTreaty = {
        id: `treaty-${a.id}-${friend.countryCode}-${tick}`,
        parties: [a.id, friend.countryCode],
        kind: treatyKind,
        signedTick: tick,
        durationYears: treatyDur,
      };
      const aIdx = updated.findIndex((x) => x.id === a.id);
      const bIdx = updated.findIndex((x) => x.id === friend.countryCode);
      if (aIdx >= 0) {
        updated[aIdx] = {
          ...updated[aIdx]!,
          activeTreaties: [...(updated[aIdx]!.activeTreaties ?? []), treaty],
        };
      }
      if (bIdx >= 0) {
        updated[bIdx] = {
          ...updated[bIdx]!,
          activeTreaties: [...(updated[bIdx]!.activeTreaties ?? []), treaty],
        };
      }
    }
  }

  // ---- 5. Cabinet cards: evaluate player country state -------------------
  const playerCountry = playerCode ? updated.find((c) => c.id === playerCode) : undefined;

  // Initialize cabinet for any country that doesn't have one yet
  for (let i = 0; i < updated.length; i++) {
    if (!updated[i]!.cabinet) {
      updated[i] = { ...updated[i]!, cabinet: createDefaultCabinet(tick) };
    }
    // Expire old cooldowns
    if (updated[i]!.cooldowns && updated[i]!.cooldowns!.length > 0) {
      const active = updated[i]!.cooldowns!.filter((c) => c.expiresAtTick > tick);
      if (active.length !== updated[i]!.cooldowns!.length) {
        updated[i] = { ...updated[i]!, cooldowns: active };
      }
    }
    // Initialize research state for any country that doesn't have one yet
    if (!updated[i]!.research) {
      updated[i] = { ...updated[i]!, research: createInitialResearchState(updated[i]!.id) };
    }
    // Initialize covert ops state for any country that doesn't have one yet
    if (!updated[i]!.covertOps) {
      updated[i] = { ...updated[i]!, covertOps: createInitialCovertOpsState(updated[i]!.id) };
    }
  }

  // Advance research for all countries
  for (let i = 0; i < updated.length; i++) {
    const result = advanceResearch(updated[i]!, tick);
    if (result.newlyUnlocked.length > 0) {
      updated[i] = { ...updated[i]!, research: result.research };
      for (const techId of result.newlyUnlocked) {
        events.push({
          type: "ai.decision",
          at: at(),
          tick,
          country: updated[i]!.id,
          action: `research breakthrough: ${techId}`,
          rationale: "technology unlocked",
        });
      }
    } else if (result.research !== updated[i]!.research) {
      updated[i] = { ...updated[i]!, research: result.research };
    }
  }

  // Advance covert operations for all countries
  const covertResult = advanceCovertOps(updated, tick);
  for (let i = 0; i < covertResult.countries.length; i++) {
    updated[i] = covertResult.countries[i]!;
  }
  events.push(...covertResult.events);

  // Initialize and apply multilateral blocs
  const blocs = initializeBlocs(updated, tick);
  const blocUpdated = applyBlocEconomicBonuses(updated, blocs);
  for (let i = 0; i < blocUpdated.length; i++) {
    updated[i] = blocUpdated[i]!;
  }

  // Check for collective defense triggers from war declarations this tick
  const warDeclarations = events.filter((e) => e.type === "war.declared");
  for (const warEvent of warDeclarations) {
    const aggressor = (warEvent as { aggressor?: string; country?: string }).aggressor ?? (warEvent as { country?: string }).country;
    const target = (warEvent as { target?: string; defender?: string }).target ?? (warEvent as { defender?: string }).defender;
    if (aggressor && target) {
      const defense = triggerCollectiveDefense(target, aggressor, blocs, tick);
      events.push(...defense.events);
    }
  }

  // Check victory conditions for the player
  if (playerCode) {
    const player = updated.find((c) => c.id === playerCode);
    if (player) {
      const victory = calculateVictoryProgress(player, updated, blocs, tick);
      if (victory.achieved) {
        events.push({
          type: "narrative.beat",
          at: at(),
          tick,
          severity: "critical",
          minister: "intelligence",
          prose: `VICTORY ACHIEVED: ${victory.achieved}`,
        });
      }
    }
  }

  const cabinetCards = playerCountry ? generateCabinetCards(playerCountry) : [];

  // ---- 5b. Narrative beats: transform significant events into prose --------
  const profiles = buildProfiles(updated);
  const narrativeBeats = generateNarrativeBeats(events, updated, tick, profiles);
  events.push(...narrativeBeats);

  // ---- 6. Summary event ---------------------------------------------------
  const summary: TurnSummary = {
    tick,
    countriesProcessed: updated.length,
    tensionsResolved,
    economiesGrown,
    economiesShrunk,
    combats,
    treaties,
    globalGdpDelta,
    aiDecisions: aiDecisionsMade,
    cabinetCards,
  };
  events.unshift({
    type: "turn.advanced",
    at: at(),
    tick,
    summary,
  });

  return { countries: updated, units: survivingUnits, events, cabinetCards, blocs };
}
