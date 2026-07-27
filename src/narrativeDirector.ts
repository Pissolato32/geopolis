// narrativeDirector — transforms mechanical GameEvents into immersive narrative
// passages addressed to "Senhor Presidente". Each AI nation is classified into
// a personality archetype that colors the prose voice. This layer is purely
// additive: it reads events the simulation already produces and emits
// `narrative.beat` events alongside them. The underlying simulation logic is
// untouched.

import type { Country, GameEvent } from "./shared/types.js";

export type PersonalityArchetype =
  | "hawk"
  | "diplomat"
  | "strongman"
  | "technocrat"
  | "rogue";

interface PersonalityProfile {
  archetype: PersonalityArchetype;
  /** How the nation refers to itself in prose. */
  voice: string;
  /** Adjective describing the leader's demeanor. */
  demeanor: string;
}

const ARCHETYPE_LABEL: Record<PersonalityArchetype, string> = {
  hawk: "Falcão",
  diplomat: "Diplomata",
  strongman: "Autocrata",
  technocrat: "Tecnocrata",
  rogue: "Estado Rogue",
};

/** Deterministic hash so a country's archetype is stable across turns. */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickSeeded<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

/** Classify a nation into a personality archetype from its stats + identity. */
export function classifyPersonality(c: Country): PersonalityProfile {
  const aggressive = c.military.readiness >= 65 && c.military.morale >= 60;
  const unstable = c.economy.stability < 40;
  const militarized = c.military.totalPersonnel >= 200000;
  const wealthy = c.economy.gdp >= 2e12;
  const h = hashStr(c.id);

  if (unstable && militarized) {
    return archetypeProfile("strongman", c, h);
  }
  if (aggressive && militarized) {
    return archetypeProfile("hawk", c, h);
  }
  if (wealthy && c.economy.stability >= 60) {
    return archetypeProfile("technocrat", c, h);
  }
  if (c.economy.stability < 30 || c.military.militaryLoyalty < 40) {
    return archetypeProfile("rogue", c, h);
  }
  return archetypeProfile("diplomat", c, h);
}

function archetypeProfile(
  archetype: PersonalityArchetype,
  c: Country,
  h: number,
): PersonalityProfile {
  const voices: Record<PersonalityArchetype, string[]> = {
    hawk: [
      `O alto-comando de ${c.name}`,
      `O Estado-Maior de ${c.name}`,
      `A liderança militar de ${c.name}`,
    ],
    diplomat: [
      `O Ministério das Relações Exteriores de ${c.name}`,
      `O chanceler de ${c.name}`,
      `A diplomacia de ${c.name}`,
    ],
    strongman: [
      `O regime de ${c.name}`,
      `A junta no poder em ${c.name}`,
      `O líder máximo de ${c.name}`,
    ],
    technocrat: [
      `O conselho econômico de ${c.name}`,
      `O gabinete técnico de ${c.name}`,
      `A cúpula tecnocrática de ${c.name}`,
    ],
    rogue: [
      `O governo isolado de ${c.name}`,
      `A facção no poder em ${c.name}`,
      `O regime paria de ${c.name}`,
    ],
  };
  const demeanors: Record<PersonalityArchetype, string[]> = {
    hawk: ["beligerante", "confrontacional", "inflexível"],
    diplomat: ["conciliador", "comedido", "pragmático"],
    strongman: ["autoritário", "teatral", "belicoso"],
    technocrat: ["metódico", "frio", "calculista"],
    rogue: ["errático", "provocador", "imprevisível"],
  };
  return {
    archetype,
    voice: pickSeeded(voices[archetype], h),
    demeanor: pickSeeded(demeanors[archetype], h >> 3),
  };
}

/** A narrative passage produced for a significant event. */
export interface NarrativeBeat {
  type: "narrative.beat";
  at: string;
  tick: number;
  /** Severity drives styling: "routine" | "notable" | "dramatic" | "critical". */
  severity: "routine" | "notable" | "dramatic" | "critical";
  /** Which minister is commenting, if any. */
  minister?: MinisterRole;
  /** The immersive prose passage. */
  prose: string;
}

export type MinisterRole = "defense" | "foreign" | "economy" | "intelligence";

const MINISTER_NAME: Record<MinisterRole, string> = {
  defense: "Ministro da Defesa",
  foreign: "Ministro das Relações Exteriores",
  economy: "Ministro da Economia",
  intelligence: "Diretor de Inteligência",
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function countryName(countries: Country[], code: string): string {
  return countries.find((x) => x.id === code)?.name ?? code;
}

/** Inspect a single GameEvent and, if significant, produce a narrative beat. */
function narrate(
  evt: GameEvent,
  countries: Country[],
  profiles: Map<string, PersonalityProfile>,
  tick: number,
): NarrativeBeat | null {
  const profileOf = (code: string) => profiles.get(code);

  if (evt.type === "war.declared") {
    const aggressor = countryName(countries, evt.aggressor);
    const target = countryName(countries, evt.target);
    const p = profileOf(evt.aggressor);
    const voice = p?.voice ?? `O alto-comando de ${aggressor}`;
    const openers =
      p?.archetype === "hawk"
        ? [
            `"Senhor Presidente, ${aggressor} cruzou o limiar da guerra." `,
          ]
        : p?.archetype === "strongman"
          ? [`"Senhor Presidente, o regime de ${aggressor} impôs sua vontade pela força." `]
          : [`"Senhor Presidente, ${aggressor} declarou formalmente guerra." `];
    const body = pick([
      `As tropas de ${aggressor} entraram em posição de combate contra ${target}. O pretexto alegado: ${evt.reason}. Nossos radares confirmam movimentação de blindados e alerta máximo nas fronteiras.`,
      `${voice} ordenou a mobilização geral. ${target} foi classificada como "ameaça existencial". O Conselho de Segurança foi convocado em caráter de urgência.`,
    ]);
    return {
      type: "narrative.beat",
      at: evt.at,
      tick,
      severity: "critical",
      minister: "defense",
      prose: pick(openers) + body,
    };
  }

  if (evt.type === "peace.declared") {
    const initiator = countryName(countries, evt.initiator);
    const target = countryName(countries, evt.target);
    return {
      type: "narrative.beat",
      at: evt.at,
      tick,
      severity: "dramatic",
      minister: "foreign",
      prose: pick([
        `Senhor Presidente, ${initiator} solicitou paz a ${target}. Os termos propostos: ${evt.terms}. Uma janela de negociação abre-se, mas a confiança entre as partes está fracturada.`,
        `Após semanas de derramamento de sangue, ${initiator} estende a mão a ${target}. Os termos — ${evt.terms} — serão debatidos em Genebra. O silêncio dos canhões não significa o fim da desconfiança.`,
      ]),
    };
  }

  if (evt.type === "diplomacy.treaty-signed") {
    const a = countryName(countries, evt.parties[0]);
    const b = countryName(countries, evt.parties[1]);
    const kindPhrase =
      evt.kind === "alliance"
        ? "uma aliança militar formal"
        : evt.kind === "trade"
          ? "um acordo de livre-comércio"
          : "um pacto de não-agressão";
    return {
      type: "narrative.beat",
      at: evt.at,
      tick,
      severity: evt.kind === "alliance" ? "dramatic" : "notable",
      minister: "foreign",
      prose: pick([
        `Senhor Presidente, ${a} e ${b} assinaram ${kindPhrase}, válido por ${evt.durationYears} anos. O eixo de poder regional acaba de se reconfigurar.`,
        `Os chanceleres de ${a} e ${b} apertaram as mãos em ${kindPhrase} de ${evt.durationYears} anos. Nossos analistas avaliam as implicações para a nossa posição estratégica.`,
      ]),
    };
  }

  if (evt.type === "ai.decision") {
    const p = profileOf(evt.country);
    if (!p) return null;
    const name = countryName(countries, evt.country);
    return narrateAIDecision(evt, name, p, tick);
  }

  if (evt.type === "war.combat-resolved") {
    const attacker = countryName(countries, evt.attacker);
    const defender = countryName(countries, evt.defender);
    const victor = countryName(countries, evt.victor);
    return {
      type: "narrative.beat",
      at: evt.at,
      tick,
      severity: "notable",
      minister: "defense",
      prose: pick([
        `Senhor Presidente, frente de batalha ativa: forças de ${attacker} enfrentaram ${defender}. ${victor} prevaleceu. Baixas estimadas: ${evt.attackerLosses.toLocaleString()} e ${evt.defenderLosses.toLocaleString()} respectivamente. O combate foi breve mas intenso.`,
      ]),
    };
  }

  if (evt.type === "turn.tension-shift" && Math.abs(evt.delta) >= 15) {
    const a = countryName(countries, evt.countryA);
    const b = countryName(countries, evt.countryB);
    return {
      type: "narrative.beat",
      at: evt.at,
      tick,
      severity: "notable",
      minister: "intelligence",
      prose: pick([
        `Senhor Presidente, nossos serviços detectaram escalada entre ${a} e ${b}. Tensão subiu ${evt.delta} pontos — ${evt.reason}. Recomendamos vigilância redobrada.`,
      ]),
    };
  }

  return null;
}

/** Narrate an ai.decision event, varying prose by archetype. */
function narrateAIDecision(
  evt: Extract<GameEvent, { type: "ai.decision" }>,
  name: string,
  p: PersonalityProfile,
  tick: number,
): NarrativeBeat {
  const action = evt.action.toLowerCase();
  const rationale = evt.rationale;

  const minister: MinisterRole = action.includes("war") || action.includes("mobil")
    ? "defense"
    : action.includes("tax") || action.includes("austerity") || action.includes("trade agreement")
      ? "economy"
      : action.includes("ultimatum") || action.includes("tension")
        ? "intelligence"
        : "foreign";

  const intro = (openers: string[]) => `Senhor Presidente, ${pick(openers)}`;

  const templates: Record<PersonalityArchetype, string[]> = {
    hawk: [
      `${intro([`o Alto-Comando de ${name} não mediu palavras.`])} ${capitalize(rationale)}. A postura ${p.demeanor} de ${name} sugere que negociações serão inúteis no curto prazo. Recomendamos elevar nosso nível de alerta.`,
    ],
    diplomat: [
      `${intro([`a diplomacia de ${name} agiu com discrição.`])} ${capitalize(rationale)}. ${capitalize(p.voice)} optou pela via institucional, ${p.demeanor} em tom, mas firme em substância. Uma janela para diálogo ainda existe.`,
    ],
    strongman: [
      `${intro([`o regime de ${name} exibiu força.`])} ${capitalize(rationale)}. O líder máximo apareceu em uniforme na TV estatal; ${p.demeanor} como sempre. A oposição interna foi calada mais uma vez.`,
    ],
    technocrat: [
      `${intro([`o gabinete de ${name} publicou um comunicado seco.`])} ${capitalize(rationale)}. Decisão tomada por comitê técnico, sem teatro político. ${capitalize(p.voice)} prefere planilhas a discursos.`,
    ],
    rogue: [
      `${intro([`${name} agiu de forma imprevista.`])} ${capitalize(rationale)}. O comportamento ${p.demeanor} do regime desafia previsão. Nossos modelos analíticos perderam acurácia nesta fronteira.`,
    ],
  };

  return {
    type: "narrative.beat",
    at: evt.at,
    tick,
    severity: action.includes("war") || action.includes("mobil")
      ? "dramatic"
      : action.includes("ultimatum")
        ? "dramatic"
        : "routine",
    minister,
    prose: pick(templates[p.archetype]),
  };
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Build personality profiles for all non-player nations. */
export function buildProfiles(countries: Country[]): Map<string, PersonalityProfile> {
  const map = new Map<string, PersonalityProfile>();
  for (const c of countries) {
    map.set(c.id, classifyPersonality(c));
  }
  return map;
}

/** Post-process a batch of GameEvents and emit narrative beats for the
 *  significant ones. Called once per turn by the turn engine. */
export function generateNarrativeBeats(
  events: GameEvent[],
  countries: Country[],
  tick: number,
  profiles?: Map<string, PersonalityProfile>,
): NarrativeBeat[] {
  const p = profiles ?? buildProfiles(countries);
  const beats: NarrativeBeat[] = [];
  for (const evt of events) {
    const beat = narrate(evt, countries, p, tick);
    if (beat) beats.push(beat);
  }
  // Cap narrative density: keep at most 6 beats/turn to avoid flooding.
  if (beats.length > 6) {
    const priority = { critical: 0, dramatic: 1, notable: 2, routine: 3 };
    beats.sort((a, b) => priority[a.severity] - priority[b.severity]);
    return beats.slice(0, 6);
  }
  return beats;
}

export { ARCHETYPE_LABEL, MINISTER_NAME };
