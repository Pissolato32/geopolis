// briefingGenerator — transforms live game state into the IPresidentialBriefing
// data structure so the Briefing Dashboard reflects the actual running simulation
// instead of hardcoded mock data.

import type { Country, GameEvent, MarketPrice, Relationship, Unit } from "../shared/types.js";
import type { IPresidentialBriefing } from "./briefingTypes.js";

interface BriefingInput {
  tick: number;
  playerCode: string;
  countries: Country[];
  units: Unit[];
  market: MarketPrice[];
  events: GameEvent[];
}

const MONTHS_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function tickToDate(tick: number): Date {
  const base = new Date(2026, 0, 1);
  base.setDate(base.getDate() + tick * 7);
  return base;
}

function formatDatePT(d: Date): string {
  return `${d.getDate()} de ${MONTHS_PT[d.getMonth()]} de ${d.getFullYear()}`;
}

function formatPeriodStr(tick: number): string {
  const start = tickToDate(tick);
  const end = tickToDate(tick + 1);
  end.setDate(end.getDate() - 1);
  const startStr = `${start.getDate()} ${MONTHS_PT[start.getMonth()].slice(0, 3)}`;
  const endStr = `${end.getDate()} ${MONTHS_PT[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`;
  return `Semana ${tick} · ${startStr}–${endStr}`;
}

function statusFromValue(val: number, thresholds: [number, number]): "success" | "warning" | "critical" | "neutral" {
  if (val >= thresholds[0]) return "success";
  if (val >= thresholds[1]) return "warning";
  return "critical";
}

function topN<T>(arr: T[], score: (x: T) => number, n: number): T[] {
  return [...arr].sort((a: T, b: T) => score(b) - score(a)).slice(0, n);
}

function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function eventsForTick(events: GameEvent[], tick: number): GameEvent[] {
  return events.filter((e) => {
    if ("tick" in e && typeof e.tick === "number") return e.tick === tick;
    return false;
  });
}

function eventsForPlayer(events: GameEvent[], playerCode: string): GameEvent[] {
  return events.filter((e) => {
    const fields = e as Record<string, unknown>;
    return fields.country === playerCode || fields.from === playerCode || fields.player === playerCode;
  });
}

/** Generate a complete presidential briefing from the current game state. */
export function generateBriefing(input: BriefingInput): IPresidentialBriefing {
  const { tick, playerCode, countries, units, market, events } = input;
  const player = countries.find((c) => c.id === playerCode);
  const date = tickToDate(tick);
  const turnEvents = eventsForTick(events, tick);
  const playerEvents = eventsForPlayer(turnEvents, playerCode);
  const narrativeBeats = turnEvents.filter((e) => e.type === "narrative.beat");

  // ---- Executive Summary ----
  const execSummary = buildExecutiveSummary(player, turnEvents, narrativeBeats, tick);

  // ---- State Metrics ----
  const stateMetrics = buildStateMetrics(player, countries);

  // ---- Domain Results ----
  const domainResults = buildDomainResults(player, turnEvents, units, playerCode);

  // ---- World Developments ----
  const worldDevelopments = buildWorldDevelopments(turnEvents, market, countries);

  // ---- Intelligence Radar ----
  const intelligenceRadar = buildIntelRadar(player, countries, events);

  // ---- Special Reports ----
  const specialReports = buildSpecialReports(player, turnEvents, narrativeBeats);

  // ---- Assessment ----
  const assessment = buildAssessment(player, turnEvents, stateMetrics);

  // ---- Decision Options ----
  const decisionOptions = buildDecisionOptions(player, countries);

  // ---- Reserved Archive ----
  const reservedArchive = buildReservedArchive(playerEvents, events);

  return {
    header: {
      turn: tick,
      date: formatDatePT(date),
      intervalDays: 7,
      periodStr: formatPeriodStr(tick),
    },
    executiveSummary: execSummary,
    specialReports,
    domainResults,
    worldDevelopments,
    intelligenceRadar,
    assessment,
    decisionOptions,
    reservedArchive,
    stateMetrics,
  };
}

function buildExecutiveSummary(
  player: Country | undefined,
  turnEvents: GameEvent[],
  beats: GameEvent[],
  tick: number,
): string {
  if (!player) return "Senhor Presidente, aguardando dados da nação selecionada.";
  const parts: string[] = [];
  parts.push(
    `Senhor Presidente, eis o panorama da semana ${tick}.`,
  );
  // Economy
  const gdp = player.economy.gdp;
  const stability = player.economy.stability;
  parts.push(
    `O PIB de ${player.name} está em ${fmtMoney(gdp)} com estabilidade em ${stability}%.`,
  );
  // Military
  parts.push(
    `Prontidão militar: ${player.military.readiness}%, moral: ${player.military.morale}%.`,
  );
  // Tensions
  const tensions = turnEvents.filter((e) => e.type === "war.declared" || e.type === "turn.tension-shift");
  if (tensions.length > 0) {
    parts.push(`Foram registrados ${tensions.length} evento(s) de tensão ou conflito neste turno.`);
  }
  // Narrative beats
  const critical = beats.filter((b) => b.type === "narrative.beat" && b.severity === "critical");
  const dramatic = beats.filter((b) => b.type === "narrative.beat" && b.severity === "dramatic");
  if (critical.length > 0) {
    parts.push(`Há ${critical.length} situação(ões) crítica(s) que exigem sua atenção imediata.`);
  } else if (dramatic.length > 0) {
    parts.push(`Há ${dramatic.length} desenvolvimento(s) de alta relevância diplomática ou militar.`);
  } else {
    parts.push(`Nenhum evento crítico reportado neste turno. A situação global permanece estável.`);
  }
  return parts.join(" ");
}

function buildStateMetrics(player: Country | undefined, countries: Country[]) {
  if (!player) {
    return {
      escalation: 0, popularity: 0, gdpGrowth: 0, inflation: 0,
      debtToGdp: 0, congressSupport: { senators: 0, deputies: 0 },
      militaryReadiness: { army: 0, navy: 0, airForce: 0 },
      exchangeRate: 0, deficit: 0,
    };
  }
  const globalTension = countries.reduce((sum, c) => {
    const topRel: Relationship[] = topN(c.relationships, (r: Relationship) => r.tension, 3);
    return sum + topRel.reduce((s, r) => s + r.tension, 0) / 3;
  }, 0) / countries.length;
  const escalation = clamp(Math.round(globalTension / 20), 0, 5);
  const popularity = clamp(Math.round(player.economy.stability * 0.8 + player.military.morale * 0.2), 0, 100);
  const gdpGrowth = (player.economy.treasury / player.economy.gdp) * 100;
  const inflation = clamp(8 - player.economy.stability * 0.06, 0, 15);
  const debtToGdp = clamp(90 - player.economy.stability * 0.3, 20, 120);
  const congressSupport = {
    senators: Math.round(player.economy.legislativeSupport * 81),
    deputies: Math.round(player.economy.legislativeSupport * 513),
  };
  const militaryReadiness = {
    army: player.military.readiness,
    navy: clamp(player.military.readiness - 5, 0, 100),
    airForce: clamp(player.military.readiness + 3, 0, 100),
  };
  return {
    escalation,
    popularity,
    gdpGrowth: Math.round(gdpGrowth * 10) / 10,
    inflation: Math.round(inflation * 10) / 10,
    debtToGdp: Math.round(debtToGdp * 10) / 10,
    congressSupport,
    militaryReadiness,
    exchangeRate: clamp(5 + (100 - player.economy.stability) * 0.02, 3, 8),
    deficit: clamp(6 - player.economy.stability * 0.05, 0, 12),
  };
}

function buildDomainResults(
  player: Country | undefined,
  turnEvents: GameEvent[],
  units: Unit[],
  playerCode: string,
): IPresidentialBriefing["domainResults"] {
  if (!player) return [];
  const playerUnits = units.filter((u) => u.ownerCode === playerCode);

  // Military
  const combatEvents = turnEvents.filter((e) => e.type === "war.combat-resolved" || e.type === "war.declared");
  const militaryStatus = player.military.readiness >= 70 ? "success" : player.military.readiness >= 45 ? "warning" : "critical";
  const militaryDetails: string[] = [];
  militaryDetails.push(`Prontidão geral: ${player.military.readiness}% · Moral: ${player.military.morale}%`);
  militaryDetails.push(`Efetivos totais: ${player.military.totalPersonnel.toLocaleString()}`);
  militaryDetails.push(`Limite de força projetável: ${player.military.forceLimit.toLocaleString()}`);
  militaryDetails.push(`Unidades sob seu comando: ${playerUnits.length}`);
  if (combatEvents.length > 0) {
    militaryDetails.push(`${combatEvents.length} evento(s) de combate registrados neste turno`);
  }

  // Intelligence
  const intelEvents = turnEvents.filter((e) => e.type === "intel.gathered" || e.type === "sabotage.executed" || e.type === "sabotage.failed");
  const intelDetails: string[] = [];
  intelDetails.push(`Lealdade militar ao regime: ${player.military.militaryLoyalty}%`);
  intelDetails.push(`Eventos de inteligência no turno: ${intelEvents.length}`);
  if (intelEvents.length > 0) {
    for (const e of intelEvents.slice(0, 3)) {
      if (e.type === "intel.gathered") intelDetails.push(`Intel sobre ${e.target}: nível ${e.intelLevel}%`);
      if (e.type === "sabotage.executed") intelDetails.push(`Sabotagem contra ${e.target}: estabilidade -${Math.abs(e.stabilityHit)}`);
      if (e.type === "sabotage.failed") intelDetails.push(`Sabotagem contra ${e.target} falhou: ${e.reason}`);
    }
  }

  // Diplomatic
  const treatyEvents = turnEvents.filter((e) => e.type === "diplomacy.treaty-signed");
  const tensionEvents = turnEvents.filter((e) => e.type === "turn.tension-shift");
  const topTensions: Relationship[] = topN(player.relationships, (r: Relationship) => r.tension, 3);
  const diploStatus = topTensions[0] && topTensions[0].tension >= 60 ? "critical" : topTensions[0] && topTensions[0].tension >= 30 ? "warning" : "success";
  const diploDetails: string[] = [];
  diploDetails.push(`Postura diplomática: ${player.posture}`);
  if (treatyEvents.length > 0) diploDetails.push(`${treatyEvents.length} tratado(s) assinado(s) no turno`);
  for (const r of topTensions) {
    diploDetails.push(`${r.countryCode}: tensão ${r.tension} · afinidade ${r.affinity > 0 ? "+" : ""}${r.affinity}`);
  }

  // Economic
  const econEvents = turnEvents.filter((e) => e.type === "turn.economy-growth" || e.type === "economy.indicator");
  const econStatus = statusFromValue(player.economy.stability, [60, 35]);
  const econDetails: string[] = [];
  econDetails.push(`PIB: ${fmtMoney(player.economy.gdp)}`);
  econDetails.push(`Tesouro: ${fmtMoney(player.economy.treasury)}`);
  econDetails.push(`Estabilidade econômica: ${player.economy.stability}%`);
  econDetails.push(`Alíquota tributária: ${(player.economy.taxRate * 100).toFixed(1)}%`);
  econDetails.push(`Suporte legislativo: ${(player.economy.legislativeSupport * 100).toFixed(0)}%`);
  if (econEvents.length > 0) econDetails.push(`${econEvents.length} indicador(es) econômicos atualizados`);

  // Projects (derived from stability and treasury)
  const projectExec = clamp(Math.round(player.economy.stability * 0.5 + 20), 0, 100);
  const projDetails: string[] = [];
  projDetails.push(`Execução orçamentária de projetos: ${projectExec}%`);
  projDetails.push(`Tesouro disponível para novos projetos: ${fmtMoney(player.economy.treasury)}`);
  projDetails.push(`Estabilidade para licenciamentos: ${player.economy.stability >= 50 ? "Adequada" : "Comprometida"}`);

  // Communication (derived from stability + popularity proxy)
  const approval = clamp(Math.round(player.economy.stability * 0.85 + 10), 0, 100);
  const commStatus = approval >= 60 ? "success" : approval >= 40 ? "warning" : "critical";
  const commDetails: string[] = [];
  commDetails.push(`Aprovação estimada: ${approval}%`);
  commDetails.push(`Estabilidade institucional: ${player.economy.stability}%`);
  commDetails.push(`Postura pública: ${player.posture}`);

  return [
    {
      domain: "militar",
      label: "Militar / Segurança",
      status: militaryStatus as "success" | "warning" | "critical",
      summary: `${playerUnits.length} unidades ativas. Prontidão ${player.military.readiness}%. ${combatEvents.length} combate(s) no turno.`,
      details: militaryDetails,
    },
    {
      domain: "inteligencia",
      label: "Inteligência / Ciber",
      status: player.military.militaryLoyalty >= 60 ? "success" as const : "warning" as const,
      summary: `Lealdade ${player.military.militaryLoyalty}%. ${intelEvents.length} operação(ões) no turno.`,
      details: intelDetails,
    },
    {
      domain: "diplomatico",
      label: "Diplomático",
      status: diploStatus as "success" | "warning" | "critical",
      summary: `Postura: ${player.posture}. ${treatyEvents.length} tratado(s), ${tensionEvents.length} tensão(ões).`,
      details: diploDetails,
    },
    {
      domain: "politico_economico",
      label: "Político / Econômico",
      status: econStatus,
      summary: `PIB ${fmtMoney(player.economy.gdp)}. Estabilidade ${player.economy.stability}%. Tesouro ${fmtMoney(player.economy.treasury)}.`,
      details: econDetails,
    },
    {
      domain: "projetos",
      label: "Projetos Estratégicos",
      status: projectExec >= 50 ? "success" as const : projectExec >= 30 ? "warning" as const : "neutral" as const,
      summary: `Execução em ${projectExec}%. Tesouro: ${fmtMoney(player.economy.treasury)}.`,
      details: projDetails,
    },
    {
      domain: "comunicacao",
      label: "Comunicação Presidencial",
      status: commStatus,
      summary: `Aprovação estimada ${approval}%. Postura: ${player.posture}.`,
      details: commDetails,
    },
  ];
}

function buildWorldDevelopments(
  turnEvents: GameEvent[],
  market: MarketPrice[],
  countries: Country[],
): IPresidentialBriefing["worldDevelopments"] {
  const dev: IPresidentialBriefing["worldDevelopments"] = [];

  // Market movements
  for (const p of market) {
    if (Math.abs(p.delta) >= 4) {
      dev.push({
        category: "Mercado / Commodities",
        headline: `${p.resource === "energy" ? "Energia" : p.resource === "food" ? "Alimentos" : "Minerais"} ${p.delta > 0 ? "subiu" : "caiu"} ${Math.abs(p.delta)}% para índice ${p.price}`,
        impact: p.delta > 0 ? "Pressão sobre custos de importação" : "Alívio sobre custos de importação",
      });
    }
  }

  // Wars
  for (const e of turnEvents.filter((e) => e.type === "war.declared")) {
    const aggr = countries.find((c) => c.id === e.aggressor);
    const tgt = countries.find((c) => c.id === e.target);
    dev.push({
      category: "Geopolítica",
      headline: `${aggr?.name ?? e.aggressor} declarou guerra a ${tgt?.name ?? e.target}`,
      impact: `Motivo: ${e.reason}. Risco de envolvimento regional.`,
    });
  }

  // Treaties
  for (const e of turnEvents.filter((e) => e.type === "diplomacy.treaty-signed")) {
    const a = countries.find((c) => c.id === e.parties[0])?.name ?? e.parties[0];
    const b = countries.find((c) => c.id === e.parties[1])?.name ?? e.parties[1];
    dev.push({
      category: "Diplomacia",
      headline: `${a} e ${b} assinaram ${e.kind === "alliance" ? "aliança militar" : e.kind === "trade" ? "acordo comercial" : "pacto de não-agressão"} (${e.durationYears} anos)`,
      impact: "Reconfiguração de alianças regionais",
    });
  }

  // AI decisions of note
  const aiDecisions = turnEvents.filter((e) => e.type === "ai.decision").slice(0, 2);
  for (const e of aiDecisions) {
    const c = countries.find((c) => c.id === e.country);
    dev.push({
      category: "Inteligência",
      headline: `${c?.name ?? e.country}: ${e.action}`,
      impact: e.rationale,
    });
  }

  return dev.slice(0, 6);
}

function buildIntelRadar(
  player: Country | undefined,
  countries: Country[],
  events: GameEvent[],
): IPresidentialBriefing["intelligenceRadar"] {
  if (!player) return [];
  const radar: IPresidentialBriefing["intelligenceRadar"] = [];

  // Top tension relationships
  const topTensions: Relationship[] = topN(player.relationships, (r: Relationship) => r.tension, 4);
  for (const r of topTensions) {
    const target = countries.find((c) => c.id === r.countryCode);
    const confidence = r.tension >= 60 ? "CRITICA" as const : r.tension >= 40 ? "ALTA" as const : r.tension >= 20 ? "MEDIA" as const : "BAIXA" as const;
    radar.push({
      target: `${target?.name ?? r.countryCode} — Relação bilateral`,
      confidence,
      update: `Tensão em ${r.tension} pontos, afinidade ${r.affinity > 0 ? "+" : ""}${r.affinity}. Postura de ${target?.posture ?? "indefinida"}.`,
    });
  }

  // Recent intel gathered
  const intelGathered = events.filter((e) => e.type === "intel.gathered").slice(-2);
  for (const e of intelGathered) {
    const target = countries.find((c) => c.id === e.target);
    radar.push({
      target: `${target?.name ?? e.target} — Inteligência ativa`,
      confidence: e.intelLevel >= 70 ? "ALTA" as const : e.intelLevel >= 40 ? "MEDIA" as const : "BAIXA" as const,
      update: `Nível de inteligência: ${e.intelLevel}%. Custo da operação: ${fmtMoney(e.cost)}.`,
    });
  }

  return radar.slice(0, 6);
}

function buildSpecialReports(
  player: Country | undefined,
  turnEvents: GameEvent[],
  beats: GameEvent[],
): IPresidentialBriefing["specialReports"] {
  const reports: IPresidentialBriefing["specialReports"] = [];

  // War report
  const wars = turnEvents.filter((e) => e.type === "war.declared");
  if (wars.length > 0 && player) {
    const sections = wars.slice(0, 3).map((e) => ({
      heading: `${e.aggressor} vs ${e.target}`,
      content: `Motivo declarado: ${e.reason}. O conflito foi iniciado neste turno. Avaliação em andamento.`,
      metrics: { "Agressor": e.aggressor, "Alvo": e.target } as Record<string, string | number>,
    }));
    reports.push({
      id: "war-report",
      title: "Relatório de Conflito Armado",
      subtitle: "Ministério da Defesa · Estado-Maior Conjunto",
      sections,
      recommendation: "Avaliar impacto sobre alianças e rotas comerciais. Manter prontidão elevada.",
    });
  }

  // Narrative critical beats as special report
  const criticalBeats = beats.filter((b) => b.type === "narrative.beat" && (b.severity === "critical" || b.severity === "dramatic"));
  if (criticalBeats.length > 0) {
    const sections = criticalBeats.slice(0, 4).map((b, i) => {
      const beat = b as Extract<GameEvent, { type: "narrative.beat" }>;
      return {
        heading: `Briefing ${i + 1} — ${beat.severity === "critical" ? "Crítico" : "Dramático"}`,
        content: beat.prose,
      };
    });
    reports.push({
      id: "narrative-briefings",
      title: "Briefings de Crise",
      subtitle: "Gabinete de Crise · Conselho de Segurança Nacional",
      sections,
      recommendation: "Priorizar respostas às situações críticas. Consultar ministros responsáveis.",
    });
  }

  // Economic report if stability is low
  if (player && player.economy.stability < 45) {
    reports.push({
      id: "economic-alert",
      title: "Alerta Econômico",
      subtitle: "Ministério da Economia · Banco Central",
      sections: [
        {
          heading: "Instabilidade Econômica",
          content: `A estabilidade econômica de ${player.name} caiu para ${player.economy.stability}%. O tesouro está em ${fmtMoney(player.economy.treasury)}. Medidas de ajuste fiscal podem ser necessárias.`,
          metrics: {
            "Estabilidade": `${player.economy.stability}%`,
            "Tesouro": fmtMoney(player.economy.treasury),
            "PIB": fmtMoney(player.economy.gdp),
          },
        },
        {
          heading: "Recomendação Estratégica",
          content: "Considerar ajuste na alíquota tributária ou busca de acordos comerciais para reforçar o tesouro. A pressão popular tende a aumentar com instabilidade prolongada.",
        },
      ],
      recommendation: "Ajustar política fiscal e buscar tratados comerciais para estabilizar a economia.",
    });
  }

  return reports;
}

function buildAssessment(
  player: Country | undefined,
  turnEvents: GameEvent[],
  metrics: IPresidentialBriefing["stateMetrics"],
): IPresidentialBriefing["assessment"] {
  if (!player) {
    return {
      tacticalResult: "Aguardando dados.",
      rootCause: "Sem nação selecionada.",
      fiscalAndPoliticalCosts: [],
      strategicOutlook: "Selecione uma nação para receber a avaliação estratégica.",
    };
  }
  const warCount = turnEvents.filter((e) => e.type === "war.declared").length;
  const treatyCount = turnEvents.filter((e) => e.type === "diplomacy.treaty-signed").length;
  const combatCount = turnEvents.filter((e) => e.type === "war.combat-resolved").length;

  const tacticalResult = warCount > 0
    ? `Semana marcada por ${warCount} declaração(ões) de guerra e ${combatCount} confronto(s). ${treatyCount} tratado(s) diplomático(s).`
    : treatyCount > 0
      ? `Semana diplomática: ${treatyCount} tratado(s) assinado(s), sem conflitos armados.`
      : "Semana sem eventos de grande escala. Estabilidade mantida.";

  const rootCause = metrics.escalation >= 3
    ? "A escalada global reflete tensões acumuladas entre potências. A posição diplomática da nação precisa de reajuste."
    : player.economy.stability < 40
      ? "A instabilidade econômica é estrutural — refletem desequilíbrio fiscal e pressão sobre o tesouro."
      : "O quadro geral é estável. Tensões pontuais exigem vigilância mas não comprometem a posição estratégica.";

  const costs: Array<{ item: string; cost: string }> = [];
  if (player.military.readiness >= 70) {
    costs.push({ item: "Manutenção de prontidão militar elevada", cost: `${fmtMoney(player.economy.gdp * 0.02)}/semana · desgaste de moral` });
  }
  if (metrics.escalation >= 3) {
    costs.push({ item: "Postura defensiva em escala global", cost: "Capital diplomático · 5% tesouro" });
  }
  costs.push({
    item: `Alíquota tributária atual (${(player.economy.taxRate * 100).toFixed(1)}%)`,
    cost: `Arrecadação: ${fmtMoney(player.economy.gdp * player.economy.taxRate)}`,
  });

  const strategicOutlook = metrics.popularity >= 60
    ? "Senhor Presidente, seu capital político está sólido. Recomenda-se avançar reformas estruturais enquanto a janela parlamentar permanece aberta."
    : metrics.popularity >= 40
      ? "Senhor Presidente, o capital político está sob pressão. Priorize conquistas visíveis e evite gastar capital em frentes secundárias."
      : "Senhor Presidente, a base política está fragilizada. Ação imediata é necessária para restaurar confiança — recomenda-se foco em economia e segurança.";

  return { tacticalResult, rootCause, fiscalAndPoliticalCosts: costs, strategicOutlook };
}

function buildDecisionOptions(
  player: Country | undefined,
  countries: Country[],
): IPresidentialBriefing["decisionOptions"] {
  if (!player) return [];
  const options: IPresidentialBriefing["decisionOptions"] = [];

  // Security decisions
  const topThreat: Relationship | undefined = topN(player.relationships, (r: Relationship) => r.tension, 1)[0];
  if (topThreat && topThreat.tension >= 40) {
    const target = countries.find((c) => c.id === topThreat.countryCode);
    options.push({
      domain: "security",
      domainLabel: "Segurança & Defesa",
      options: [
        {
          id: "sec-a",
          code: "A",
          title: `Aumentar prontidão contra ${target?.name ?? topThreat.countryCode}`,
          description: `Elevar prontidão militar e posicionar unidades defensivas. Tensão bilateral em ${topThreat.tension} pontos exige postura dissuasória.`,
          estimatedCost: `Fiscal: ${fmtMoney(player.economy.gdp * 0.01)} · Moral: -5%`,
          projectedImpact: "Reduz risco de agressão. Pode escalar tensão bilateral.",
        },
        {
          id: "sec-b",
          code: "B",
          title: "Manter postura e buscar canal diplomático",
          description: "Preservar níveis atuais de prontidão e iniciar conversas bilaterais para reduzir tensão.",
          estimatedCost: "Fiscal: mínimo · Político: baixo",
          projectedImpact: "Reduz tensão em 60% dos casos. Risco: adversário pode interpretar como fraqueza.",
        },
      ],
    });
  }

  // Economy decisions
  options.push({
    domain: "economy",
    domainLabel: "Política Econômica",
    options: [
      {
        id: "eco-a",
        code: "A",
        title: `Aumentar alíquota para ${((player.economy.taxRate + 0.02) * 100).toFixed(1)}%`,
        description: "Elevar a arrecadação em 2 pontos percentuais para reforçar o tesouro e investir em projetos estratégicos.",
        estimatedCost: `Arrecadação adicional: ${fmtMoney(player.economy.gdp * 0.02)} · Estabilidade: -3%`,
        projectedImpact: "Tesouro reforçado. Pressão popular e empresarial moderada.",
      },
      {
        id: "eco-b",
        code: "B",
        title: `Manter alíquota em ${(player.economy.taxRate * 100).toFixed(1)}%`,
        description: "Preservar a política fiscal atual. Estabilidade econômica priorizada sobre expansão arrecadatória.",
        estimatedCost: "Nenhum custo adicional",
        projectedImpact: "Estabilidade mantida. Crescimento do tesouro depende do PIB.",
      },
    ],
  });

  // Diplomacy decisions
  const topAlly: Relationship | undefined = topN(player.relationships, (r: Relationship) => r.affinity, 1)[0];
  if (topAlly && topAlly.affinity > 30) {
    const ally = countries.find((c) => c.id === topAlly.countryCode);
    options.push({
      domain: "diplomacy",
      domainLabel: "Diplomacia",
      options: [
        {
          id: "dip-a",
          code: "A",
          title: `Propor tratado comercial a ${ally?.name ?? topAlly.countryCode}`,
          description: `Aproveitar a afinidade positiva (+${topAlly.affinity}) para formalizar um acordo comercial de longo prazo.`,
          estimatedCost: "Fiscal: mínimo · Diplomático: médio",
          projectedImpact: "Aumenta PIB bilateral. Fortalece aliança estratégica.",
        },
        {
          id: "dip-b",
          code: "B",
          title: "Manter relacionamento informal",
          description: "Preservar a relação atual sem formalização. Flexibilidade diplomática retida.",
          estimatedCost: "Nenhum",
          projectedImpact: "Relação estável sem compromissos formais.",
        },
      ],
    });
  }

  return options;
}

function buildReservedArchive(
  _playerEvents: GameEvent[],
  allEvents: GameEvent[],
): IPresidentialBriefing["reservedArchive"] {
  const archive: IPresidentialBriefing["reservedArchive"] = [];

  // Intel operations
  const intelOps = allEvents.filter((e) => e.type === "intel.gathered").slice(-3);
  for (const e of intelOps) {
    archive.push({
      codename: `Operação Vigilância — ${e.target}`,
      status: `ATIVA · Intel ${e.intelLevel}%`,
      details: `Coleta de inteligência sobre ${e.target}. Nível atual: ${e.intelLevel}%. Custo: ${fmtMoney(e.cost)}.`,
    });
  }

  // Sabotage operations
  const sabotageOps = allEvents.filter((e) => e.type === "sabotage.executed" || e.type === "sabotage.failed").slice(-2);
  for (const e of sabotageOps) {
    if (e.type === "sabotage.executed") {
      archive.push({
        codename: `Operação Sombra — ${e.target}`,
        status: "EXECUTADA",
        details: `Sabotagem contra ${e.target}. Estabilidade alvo: ${e.stabilityHit}. Prontidão alvo: ${e.readinessHit}.`,
      });
    } else {
      archive.push({
        codename: `Operação Sombra — ${e.target}`,
        status: "FRACASSADA",
        details: `Tentativa contra ${e.target} falhou: ${e.reason}.`,
      });
    }
  }

  // Aid programs
  const aidOps = allEvents.filter((e) => e.type === "aid.sent").slice(-2);
  for (const e of aidOps) {
    archive.push({
      codename: `Iniciativa Solidária — ${e.target}`,
      status: "CONCLUÍDA",
      details: `Ajuda humanitária/enviada a ${e.target}. Valor: ${fmtMoney(e.amount)}. Ganho de afinidade: +${e.affinityGain}.`,
    });
  }

  if (archive.length === 0) {
    archive.push({
      codename: "Nenhuma operação classificada",
      status: "STANDBY",
      details: "Nenhuma operação de inteligência, sabotagem ou ajuda foi registrada até o momento.",
    });
  }

  return archive.slice(0, 5);
}
