// Multilateral Blocs & Collective Defense System — manages international coalitions,
// economic trade bonuses, and military collective defense (Article 5) triggers.

import type {
  Country,
  GameEvent,
  InternationalBloc,
  BlocType,
} from "../../shared/types.js";

/** Predefined bloc templates for common real-world alliances. */
export const BLOC_TEMPLATES: Array<Omit<InternationalBloc, "foundedTick">> = [
  {
    id: "nato",
    name: "NATO",
    type: "military",
    members: ["USA", "GBR", "FRA", "DEU", "ITA", "CAN", "TUR", "POL", "ESP", "NLD"],
    collectiveDefense: true,
    tariffReductionPct: 0,
    tradeBonusPct: 0.02,
  },
  {
    id: "brics",
    name: "BRICS",
    type: "economic",
    members: ["BRA", "RUS", "IND", "CHN", "ZAF"],
    collectiveDefense: false,
    tariffReductionPct: 0.15,
    tradeBonusPct: 0.05,
  },
  {
    id: "mercosur",
    name: "MERCOSUR",
    type: "economic",
    members: ["BRA", "ARG", "URY", "PRY"],
    collectiveDefense: false,
    tariffReductionPct: 0.20,
    tradeBonusPct: 0.04,
  },
  {
    id: "eu",
    name: "European Union",
    type: "economic",
    members: ["DEU", "FRA", "ITA", "ESP", "NLD", "BEL", "AUT", "PRT", "GRC", "IRL", "FIN", "SWE"],
    collectiveDefense: false,
    tariffReductionPct: 0.25,
    tradeBonusPct: 0.06,
  },
];

/** Initialize blocs from templates, filtered to countries that exist in the game. */
export function initializeBlocs(
  countries: Country[],
  tick: number,
): InternationalBloc[] {
  const countryIds = new Set(countries.map((c) => c.id));
  return BLOC_TEMPLATES.map((template) => ({
    ...template,
    members: template.members.filter((m) => countryIds.has(m)),
    foundedTick: tick,
  })).filter((b) => b.members.length >= 2);
}

/** Get all blocs a country belongs to. */
export function getCountryBlocs(countryId: string, blocs: InternationalBloc[]): InternationalBloc[] {
  return blocs.filter((b) => b.members.includes(countryId));
}

/** Check if two countries share a military bloc with collective defense. */
export function sharesCollectiveDefense(
  countryA: string,
  countryB: string,
  blocs: InternationalBloc[],
): boolean {
  return blocs.some(
    (b) =>
      b.collectiveDefense &&
      b.members.includes(countryA) &&
      b.members.includes(countryB),
  );
}

/** Get all allies obligated to defend a country under collective defense. */
export function getCollectiveDefenseAllies(
  attackedCountry: string,
  blocs: InternationalBloc[],
): string[] {
  const allies = new Set<string>();
  for (const bloc of blocs) {
    if (!bloc.collectiveDefense) continue;
    if (bloc.members.includes(attackedCountry)) {
      for (const member of bloc.members) {
        if (member !== attackedCountry) {
          allies.add(member);
        }
      }
    }
  }
  return Array.from(allies);
}

/** Generate war-join events for collective defense triggers.
 *  When a bloc member is attacked, all allies automatically enter defensive war. */
export function triggerCollectiveDefense(
  attackedCountry: string,
  aggressor: string,
  blocs: InternationalBloc[],
  tick: number,
): { events: GameEvent[]; allies: string[] } {
  const allies = getCollectiveDefenseAllies(attackedCountry, blocs);
  const events: GameEvent[] = [];

  for (const ally of allies) {
    if (ally === aggressor) continue;
    events.push({
      type: "war.declared",
      at: new Date().toISOString(),
      tick,
      aggressor: ally,
      target: aggressor,
      reason: `Collective Defense activated: ${ally} joins war against ${aggressor} in defense of ${attackedCountry}`,
    } as never);
  }

  return { events, allies };
}

/** Apply economic bloc trade bonuses to a country's relationships.
 *  Members of the same economic bloc get boosted affinity and trade bonuses. */
export function applyBlocEconomicBonuses(
  countries: Country[],
  blocs: InternationalBloc[],
): Country[] {
  const updated = [...countries];

  for (let i = 0; i < updated.length; i++) {
    const country = updated[i]!;
    const countryEconBlocs = blocs.filter(
      (b) => b.type === "economic" && b.members.includes(country.id),
    );

    if (countryEconBlocs.length === 0) continue;

    let modified = false;
    const updatedRels = country.relationships.map((rel) => {
      const sharesBloc = countryEconBlocs.some((b) => b.members.includes(rel.countryCode));
      if (!sharesBloc) return rel;

      const bonus = countryEconBlocs.reduce((sum, b) => sum + b.tradeBonusPct, 0);
      modified = true;
      return {
        ...rel,
        affinity: Math.min(100, rel.affinity + Math.round(bonus * 20)),
        tension: Math.max(0, rel.tension - Math.round(bonus * 10)),
      };
    });

    if (modified) {
      updated[i] = { ...country, relationships: updatedRels };
    }
  }

  return updated;
}

/** Create a new custom bloc. */
export function createBloc(
  name: string,
  type: BlocType,
  members: string[],
  tick: number,
  options?: { collectiveDefense?: boolean; tariffReductionPct?: number; tradeBonusPct?: number },
): InternationalBloc {
  return {
    id: `bloc-${name.toLowerCase().replace(/\s+/g, "-")}-${tick}`,
    name,
    type,
    members,
    foundedTick: tick,
    collectiveDefense: type === "military" ? (options?.collectiveDefense ?? true) : false,
    tariffReductionPct: options?.tariffReductionPct ?? (type === "economic" ? 0.15 : 0),
    tradeBonusPct: options?.tradeBonusPct ?? (type === "economic" ? 0.03 : 0),
  };
}
