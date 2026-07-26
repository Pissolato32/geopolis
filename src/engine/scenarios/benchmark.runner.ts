import { ScenarioLoader } from './scenario.loader.js';
import { EconomySystem } from '../domain/economy/systems/economy.system.js';
import { TradeSystem } from '../domain/economy/systems/trade.system.js';
import { MarketSystem } from '../domain/economy/systems/market.system.js';
import { SanctionSystem } from '../domain/economy/systems/sanction.system.js';
import { PoliticsSystem } from '../domain/politics/systems/politics.system.js';
import { CoupSystem } from '../domain/politics/systems/coup.system.js';
import { DiplomacySystem } from '../domain/diplomacy/systems/diplomacy.system.js';
import { IScenarioPreset } from './scenario.types.js';
import { ISystem } from '../core/interfaces/system.interface.js';
import { IWorldState } from '../core/interfaces/world-state.interface.js';
import {
  ECONOMIC_INDICATOR_TYPE,
  EconomicIndicatorComponent,
} from '../domain/economy/components/economy.components.js';
import {
  GOVERNMENT_STABILITY_TYPE,
  GovernmentStabilityComponent,
} from '../domain/politics/components/politics.components.js';
import {
  MILITARY_FORCES_TYPE,
  MilitaryForcesComponent,
} from '../domain/war/components/military-forces.component.js';
import {
  DIPLOMATIC_RELATION_TYPE,
  RelationComponent,
} from '../domain/diplomacy/components/relation.component.js';
import { transformRawSeed } from '../domain/seed/raw-seed-transformer.js';
import { loadWorldSeed } from '../domain/seed/seed-loader.js';
import { WorldState } from '../core/world-state/world-state.js';
import { EventBus } from '../core/event-bus/event-bus.js';
import { Timeline } from '../core/timeline/timeline.js';
import { TickEngine } from '../core/tick-engine/tick-engine.js';
import type { WorldSeed as RawWorldSeed } from '../../shared/types.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ALL_SYSTEMS: ISystem[] = [
  new SanctionSystem(),
  new TradeSystem(),
  new EconomySystem(),
  new MarketSystem(),
  new PoliticsSystem(),
  new CoupSystem(),
  new DiplomacySystem(),
];

export interface IBenchmarkMetrics {
  scenarioName: string;
  totalTicks: number;
  totalDurationMs: number;
  ticksPerSecond: number;
  avgTickMs: number;
  minTickMs: number;
  maxTickMs: number;
  eventsEmitted: number;
}

export interface IBenchmarkReport {
  metrics: IBenchmarkMetrics;
  eventBreakdown: Record<string, number>;
  systemsExecuted: number;
}

/** A single balance snapshot taken at a sampling interval. */
export interface IBalanceSnapshot {
  tick: number;
  totalGdp: number;
  totalTreasury: number;
  avgStability: number;
  avgApproval: number;
  avgMorale: number;
  avgReadiness: number;
  avgTension: number;
  totalPersonnel: number;
  entityCount: number;
}

/** Trend analysis across all snapshots in a simulation run. */
export interface IBalanceTrend {
  snapshots: IBalanceSnapshot[];
  gdpGrowthRate: number; // percent change from first to last snapshot
  stabilityDelta: number; // change in avg stability
  tensionDelta: number; // change in avg tension
  collapsedEntities: number; // entities with GDP <= 0 at end
  zeroGdpEntities: string[];
  nanDetected: boolean;
  infinityDetected: boolean;
}

export interface IBalanceReport {
  trend: IBalanceTrend;
  anomalies: string[];
}

function sampleBalance(
  worldState: IWorldState,
  tick: number,
): IBalanceSnapshot {
  let totalGdp = 0;
  let totalTreasury = 0;
  let stabilitySum = 0;
  let approvalSum = 0;
  let moraleSum = 0;
  let readinessSum = 0;
  let tensionSum = 0;
  let totalPersonnel = 0;
  let entityCount = 0;
  let relationCount = 0;

  for (const eid of worldState.getEntityIds()) {
    const entity = worldState.getEntity(eid);
    if (!entity) continue;
    entityCount++;

    const econ = entity.getComponent(ECONOMIC_INDICATOR_TYPE) as EconomicIndicatorComponent | undefined;
    if (econ) {
      totalGdp += Number(econ.gdp);
      totalTreasury += Number(econ.treasury);
    }

    const stability = entity.getComponent(GOVERNMENT_STABILITY_TYPE) as GovernmentStabilityComponent | undefined;
    if (stability) {
      stabilitySum += stability.stabilityIndex;
      approvalSum += stability.approvalRating;
    }

    const forces = entity.getComponent(MILITARY_FORCES_TYPE) as MilitaryForcesComponent | undefined;
    if (forces) {
      moraleSum += forces.morale;
      readinessSum += forces.readiness;
      totalPersonnel += forces.totalPersonnel;
    }

    const relation = entity.getComponent(DIPLOMATIC_RELATION_TYPE) as RelationComponent | undefined;
    if (relation) {
      tensionSum += relation.tension;
      relationCount++;
    }
  }

  return {
    tick,
    totalGdp,
    totalTreasury,
    avgStability: entityCount > 0 ? stabilitySum / entityCount : 0,
    avgApproval: entityCount > 0 ? approvalSum / entityCount : 0,
    avgMorale: entityCount > 0 ? moraleSum / entityCount : 0,
    avgReadiness: entityCount > 0 ? readinessSum / entityCount : 0,
    avgTension: relationCount > 0 ? tensionSum / relationCount : 0,
    totalPersonnel,
    entityCount,
  };
}

function analyzeTrend(snapshots: IBalanceSnapshot[], worldState: IWorldState): IBalanceTrend {
  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];

  const gdpGrowthRate = first && last && first.totalGdp > 0
    ? ((last.totalGdp - first.totalGdp) / first.totalGdp) * 100
    : 0;

  const stabilityDelta = (last?.avgStability ?? 0) - (first?.avgStability ?? 0);
  const tensionDelta = (last?.avgTension ?? 0) - (first?.avgTension ?? 0);

  const zeroGdpEntities: string[] = [];
  let nanDetected = false;
  let infinityDetected = false;

  for (const eid of worldState.getEntityIds()) {
    const entity = worldState.getEntity(eid);
    if (!entity) continue;
    const econ = entity.getComponent(ECONOMIC_INDICATOR_TYPE) as EconomicIndicatorComponent | undefined;
    if (econ) {
      const gdp = Number(econ.gdp);
      if (Number.isNaN(gdp)) nanDetected = true;
      if (!Number.isFinite(gdp)) infinityDetected = true;
      if (gdp <= 0) zeroGdpEntities.push(String(eid));
    }
  }

  return {
    snapshots,
    gdpGrowthRate,
    stabilityDelta,
    tensionDelta,
    collapsedEntities: zeroGdpEntities.length,
    zeroGdpEntities,
    nanDetected,
    infinityDetected,
  };
}

function detectAnomalies(trend: IBalanceTrend): string[] {
  const anomalies: string[] = [];

  if (trend.nanDetected) anomalies.push('NaN detected in GDP values');
  if (trend.infinityDetected) anomalies.push('Infinity detected in GDP values');
  if (trend.collapsedEntities > 0) {
    anomalies.push(`${trend.collapsedEntities} entities collapsed to zero or negative GDP: ${trend.zeroGdpEntities.join(', ')}`);
  }
  if (trend.gdpGrowthRate < -50) {
    anomalies.push(`Severe GDP contraction: ${trend.gdpGrowthRate.toFixed(1)}% over simulation`);
  }
  if (Math.abs(trend.stabilityDelta) > 0.5) {
    anomalies.push(`Extreme stability shift: ${trend.stabilityDelta.toFixed(2)} over simulation`);
  }
  if (trend.tensionDelta > 0.3) {
    anomalies.push(`Tension escalated to dangerous levels: +${trend.tensionDelta.toFixed(2)}`);
  }

  return anomalies;
}

export function runBenchmark(
  preset: IScenarioPreset,
  tickCount: number = 1000,
): IBenchmarkReport {
  const loader = new ScenarioLoader();
  const { engine, eventBus } = loader.loadFromPreset(preset, {
    systems: ALL_SYSTEMS,
  });

  const eventCounter: Record<string, number> = {};

  eventBus.subscribe('*', (event) => {
    const type = event.type;
    eventCounter[type] = (eventCounter[type] ?? 0) + 1;
  });

  const tickDurations: number[] = [];
  const startTime = performance.now();

  for (let i = 0; i < tickCount; i++) {
    const tickStart = performance.now();
    engine.tick();
    eventBus.flush();
    const tickEnd = performance.now();

    tickDurations.push(tickEnd - tickStart);
  }

  const totalDuration = performance.now() - startTime;

  const tickDurationsSorted = [...tickDurations].sort((a, b) => a - b);

  const totalEvents = Object.values(eventCounter).reduce((sum, c) => sum + c, 0);

  const metrics: IBenchmarkMetrics = {
    scenarioName: preset.metadata.name,
    totalTicks: tickCount,
    totalDurationMs: Math.round(totalDuration * 100) / 100,
    ticksPerSecond: Math.round((tickCount / totalDuration) * 1000 * 100) / 100,
    avgTickMs: Math.round((totalDuration / tickCount) * 1000) / 1000,
    minTickMs: Math.round(tickDurationsSorted[0]! * 1000) / 1000,
    maxTickMs: Math.round(tickDurationsSorted[tickDurationsSorted.length - 1]! * 1000) / 1000,
    eventsEmitted: totalEvents,
  };

  return {
    metrics,
    eventBreakdown: { ...eventCounter },
    systemsExecuted: tickCount * engine.getRegisteredSystems().length,
  };
}

export function runBalanceSimulation(
  preset: IScenarioPreset,
  tickCount: number = 100,
  sampleInterval: number = 10,
): IBalanceReport {
  const loader = new ScenarioLoader();
  const { engine, eventBus, worldState } = loader.loadFromPreset(preset, {
    systems: ALL_SYSTEMS,
  });

  const snapshots: IBalanceSnapshot[] = [];
  snapshots.push(sampleBalance(worldState, 0));

  for (let i = 1; i <= tickCount; i++) {
    engine.tick();
    eventBus.flush();
    if (i % sampleInterval === 0) {
      snapshots.push(sampleBalance(worldState, i));
    }
  }

  const trend = analyzeTrend(snapshots, worldState);
  const anomalies = detectAnomalies(trend);

  return { trend, anomalies };
}

export function formatBenchmarkReport(report: IBenchmarkReport): string {
  const { metrics, eventBreakdown, systemsExecuted } = report;

  const lines: string[] = [
    '═══════════════════════════════════════════',
    `  Benchmark: ${metrics.scenarioName}`,
    '═══════════════════════════════════════════',
    '',
    `  Ticks executados:    ${metrics.totalTicks}`,
    `  Duração total:       ${metrics.totalDurationMs} ms`,
    `  Ticks/segundo:       ${metrics.ticksPerSecond}`,
    `  Média por tick:      ${metrics.avgTickMs} ms`,
    `  Mínimo por tick:     ${metrics.minTickMs} ms`,
    `  Máximo por tick:     ${metrics.maxTickMs} ms`,
    `  Sistemas executados: ${systemsExecuted}`,
    `  Total de eventos:    ${metrics.eventsEmitted}`,
    '',
    '  ── Eventos por tipo ──',
  ];

  const sorted = Object.entries(eventBreakdown).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sorted) {
    lines.push(`    ${type}: ${count}`);
  }

  lines.push('─────────────────────────────────────────');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Phase 5 — Mass Simulation Balancing & Benchmark Calibration
// ---------------------------------------------------------------------------

/** Path to the 246-nation raw world seed, relative to this module. */
const RAW_SEED_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../../data/world-seed-2026.json');

/** Load the raw 246-nation seed from disk. */
export function loadRawWorldSeed(): RawWorldSeed {
  return JSON.parse(readFileSync(RAW_SEED_PATH, 'utf-8')) as RawWorldSeed;
}

/** Build a fully-initialized ECS WorldState from the 246-nation raw seed,
 *  with all domain systems registered and ready to tick. */
export function buildMassCalibrationEngine(): {
  engine: TickEngine;
  worldState: WorldState;
  eventBus: EventBus;
} {
  const rawSeed = loadRawWorldSeed();
  const worldSeed = transformRawSeed(rawSeed);

  const timeline = new Timeline();
  const eventBus = new EventBus(timeline);
  const worldState = new WorldState('mass-calibration-246');
  const engine = new TickEngine(worldState, eventBus, timeline);

  loadWorldSeed(worldState, worldSeed);

  for (const sys of ALL_SYSTEMS) {
    engine.registerSystem(sys);
  }

  return { engine, worldState, eventBus };
}

/** Enhanced snapshot for mass calibration — tracks additional fields. */
export interface IMassSnapshot extends IBalanceSnapshot {
  avgMilitaryLoyalty: number;
  treasuryDeficitCount: number;
  highTensionPairs: number;
  warEventsThisInterval: number;
}

/** Mass calibration report with full trend and anomaly analysis. */
export interface IMassCalibrationReport {
  nationCount: number;
  totalTicks: number;
  totalDurationMs: number;
  avgTickMs: number;
  snapshots: IMassSnapshot[];
  gdpGrowthRate: number;
  stabilityDelta: number;
  tensionDelta: number;
  militaryLoyaltyDelta: number;
  collapsedEntities: string[];
  nanDetected: boolean;
  infinityDetected: boolean;
  warCascadeDetected: boolean;
  warEventTotal: number;
  anomalies: string[];
}

function sampleMassBalance(worldState: IWorldState, tick: number, warEventsSinceLast: number): IMassSnapshot {
  let totalGdp = 0;
  let totalTreasury = 0;
  let stabilitySum = 0;
  let approvalSum = 0;
  let moraleSum = 0;
  let readinessSum = 0;
  let tensionSum = 0;
  let loyaltySum = 0;
  let totalPersonnel = 0;
  let entityCount = 0;
  let relationCount = 0;
  let treasuryDeficitCount = 0;
  let highTensionPairs = 0;

  for (const eid of worldState.getEntityIds()) {
    const entity = worldState.getEntity(eid);
    if (!entity) continue;
    entityCount++;

    const econ = entity.getComponent(ECONOMIC_INDICATOR_TYPE) as EconomicIndicatorComponent | undefined;
    if (econ) {
      const gdp = Number(econ.gdp);
      const treasury = Number(econ.treasury);
      totalGdp += gdp;
      totalTreasury += treasury;
      if (treasury < 0) treasuryDeficitCount++;
    }

    const stability = entity.getComponent(GOVERNMENT_STABILITY_TYPE) as GovernmentStabilityComponent | undefined;
    if (stability) {
      stabilitySum += stability.stabilityIndex;
      approvalSum += stability.approvalRating;
      loyaltySum += stability.militaryLoyalty;
    }

    const forces = entity.getComponent(MILITARY_FORCES_TYPE) as MilitaryForcesComponent | undefined;
    if (forces) {
      moraleSum += forces.morale;
      readinessSum += forces.readiness;
      totalPersonnel += forces.totalPersonnel;
    }

    const relation = entity.getComponent(DIPLOMATIC_RELATION_TYPE) as RelationComponent | undefined;
    if (relation) {
      tensionSum += relation.tension;
      relationCount++;
      if (relation.tension > 0.7) highTensionPairs++;
    }
  }

  return {
    tick,
    totalGdp,
    totalTreasury,
    avgStability: entityCount > 0 ? stabilitySum / entityCount : 0,
    avgApproval: entityCount > 0 ? approvalSum / entityCount : 0,
    avgMorale: entityCount > 0 ? moraleSum / entityCount : 0,
    avgReadiness: entityCount > 0 ? readinessSum / entityCount : 0,
    avgTension: relationCount > 0 ? tensionSum / relationCount : 0,
    avgMilitaryLoyalty: entityCount > 0 ? loyaltySum / entityCount : 0,
    totalPersonnel,
    entityCount,
    treasuryDeficitCount,
    highTensionPairs,
    warEventsThisInterval: warEventsSinceLast,
  };
}

function checkNumericValidity(worldState: IWorldState): { nan: boolean; infinity: boolean; collapsed: string[] } {
  let nan = false;
  let infinity = false;
  const collapsed: string[] = [];

  for (const eid of worldState.getEntityIds()) {
    const entity = worldState.getEntity(eid);
    if (!entity) continue;
    const econ = entity.getComponent(ECONOMIC_INDICATOR_TYPE) as EconomicIndicatorComponent | undefined;
    if (econ) {
      const gdp = Number(econ.gdp);
      const treasury = Number(econ.treasury);
      if (Number.isNaN(gdp) || Number.isNaN(treasury)) nan = true;
      if (!Number.isFinite(gdp) || !Number.isFinite(treasury)) infinity = true;
      if (gdp <= 0) collapsed.push(String(eid));
    }
    const stability = entity.getComponent(GOVERNMENT_STABILITY_TYPE) as GovernmentStabilityComponent | undefined;
    if (stability) {
      if (Number.isNaN(stability.stabilityIndex) || Number.isNaN(stability.militaryLoyalty)) nan = true;
      if (!Number.isFinite(stability.stabilityIndex) || !Number.isFinite(stability.militaryLoyalty)) infinity = true;
    }
    const forces = entity.getComponent(MILITARY_FORCES_TYPE) as MilitaryForcesComponent | undefined;
    if (forces) {
      if (Number.isNaN(forces.readiness) || Number.isNaN(forces.morale)) nan = true;
      if (!Number.isFinite(forces.readiness) || !Number.isFinite(forces.morale)) infinity = true;
    }
    const relation = entity.getComponent(DIPLOMATIC_RELATION_TYPE) as RelationComponent | undefined;
    if (relation) {
      if (Number.isNaN(relation.tension) || Number.isNaN(relation.affinity)) nan = true;
      if (!Number.isFinite(relation.tension) || !Number.isFinite(relation.affinity)) infinity = true;
    }
  }

  return { nan, infinity, collapsed };
}

/** Threshold for treasury deficit anomaly — flags when >10% of nations are
 *  running negative treasuries at end of simulation. */
const TREASURY_DEFICIT_THRESHOLD = 25;

/** Run a mass calibration simulation across all 246 nations for a given
 *  number of ticks. Samples balance at the given interval and detects
 *  anomalies including GDP collapse, NaN/Infinity propagation, and
 *  premature war cascades. */
export function runMassCalibration(
  tickCount: number = 100,
  sampleInterval: number = 10,
): IMassCalibrationReport {
  const { engine, worldState, eventBus } = buildMassCalibrationEngine();

  let warEventTotal = 0;
  let warEventsSinceLast = 0;
  let warCascadeDetected = false;

  eventBus.subscribe('war.declared', () => {
    warEventTotal++;
    warEventsSinceLast++;
  });

  const snapshots: IMassSnapshot[] = [];
  snapshots.push(sampleMassBalance(worldState, 0, 0));

  const startTime = performance.now();

  for (let i = 1; i <= tickCount; i++) {
    engine.tick();
    eventBus.flush();

    if (i <= 10 && warEventTotal > 5) {
      warCascadeDetected = true;
    }

    if (i % sampleInterval === 0 || i === tickCount) {
      snapshots.push(sampleMassBalance(worldState, i, warEventsSinceLast));
      warEventsSinceLast = 0;
    }
  }

  const totalDuration = performance.now() - startTime;

  const first = snapshots[0]!;
  const last = snapshots[snapshots.length - 1]!;

  const gdpGrowthRate = first.totalGdp > 0
    ? ((last.totalGdp - first.totalGdp) / first.totalGdp) * 100
    : 0;

  const stabilityDelta = last.avgStability - first.avgStability;
  const tensionDelta = last.avgTension - first.avgTension;
  const militaryLoyaltyDelta = last.avgMilitaryLoyalty - first.avgMilitaryLoyalty;

  const validity = checkNumericValidity(worldState);

  const anomalies: string[] = [];
  if (validity.nan) anomalies.push('NaN detected in numeric simulation fields');
  if (validity.infinity) anomalies.push('Infinity detected in numeric simulation fields');
  if (validity.collapsed.length > 0) {
    anomalies.push(`${validity.collapsed.length} nations collapsed to zero/negative GDP: ${validity.collapsed.slice(0, 10).join(', ')}${validity.collapsed.length > 10 ? '...' : ''}`);
  }
  if (gdpGrowthRate < -50) {
    anomalies.push(`Severe global GDP contraction: ${gdpGrowthRate.toFixed(1)}% over ${tickCount} ticks`);
  }
  if (gdpGrowthRate > 200) {
    anomalies.push(`Hyperinflation detected: GDP grew ${gdpGrowthRate.toFixed(1)}% over ${tickCount} ticks`);
  }
  if (Math.abs(stabilityDelta) > 0.4) {
    anomalies.push(`Extreme stability shift: ${stabilityDelta.toFixed(2)} over ${tickCount} ticks`);
  }
  if (tensionDelta > 0.3) {
    anomalies.push(`Global tension escalation: +${tensionDelta.toFixed(2)} over ${tickCount} ticks`);
  }
  if (warCascadeDetected) {
    anomalies.push(`Premature war cascade: ${warEventTotal} wars declared in first 10 ticks`);
  }
  if (last.treasuryDeficitCount > TREASURY_DEFICIT_THRESHOLD) {
    anomalies.push(`${last.treasuryDeficitCount} nations in treasury deficit at tick ${tickCount}`);
  }

  return {
    nationCount: snapshots[0]?.entityCount ?? 0,
    totalTicks: tickCount,
    totalDurationMs: Math.round(totalDuration * 100) / 100,
    avgTickMs: Math.round((totalDuration / tickCount) * 1000) / 1000,
    snapshots,
    gdpGrowthRate,
    stabilityDelta,
    tensionDelta,
    militaryLoyaltyDelta,
    collapsedEntities: validity.collapsed,
    nanDetected: validity.nan,
    infinityDetected: validity.infinity,
    warCascadeDetected,
    warEventTotal,
    anomalies,
  };
}

export function formatMassCalibrationReport(report: IMassCalibrationReport): string {
  const first = report.snapshots[0];
  const last = report.snapshots[report.snapshots.length - 1];

  const lines: string[] = [
    '═══════════════════════════════════════════════════════',
    `  Mass Calibration Report — ${report.nationCount} Nations`,
    '═══════════════════════════════════════════════════════',
    '',
    `  Ticks:                 ${report.totalTicks}`,
    `  Duration:              ${report.totalDurationMs} ms`,
    `  Avg tick:              ${report.avgTickMs} ms`,
    `  Total wars:            ${report.warEventTotal}`,
    '',
    '  ── Trend Summary ──',
    `  GDP (start):           ${first?.totalGdp.toExponential(3)}`,
    `  GDP (end):             ${last?.totalGdp.toExponential(3)}`,
    `  GDP Growth Rate:       ${report.gdpGrowthRate.toFixed(2)}%`,
    `  Stability Delta:       ${report.stabilityDelta.toFixed(4)}`,
    `  Tension Delta:         ${report.tensionDelta.toFixed(4)}`,
    `  MilitaryLoyalty Delta: ${report.militaryLoyaltyDelta.toFixed(4)}`,
    `  Collapsed Entities:    ${report.collapsedEntities.length}`,
    `  NaN Detected:          ${report.nanDetected}`,
    `  Infinity Detected:     ${report.infinityDetected}`,
    `  War Cascade:           ${report.warCascadeDetected}`,
    `  Treasury Deficits:     ${last?.treasuryDeficitCount ?? 0} nations`,
    `  High-Tension Pairs:    ${last?.highTensionPairs ?? 0}`,
    '',
  ];

  if (report.anomalies.length === 0) {
    lines.push('  Anomalies: None detected — simulation is stable');
  } else {
    lines.push('  ── Anomalies Detected ──');
    for (const a of report.anomalies) {
      lines.push(`    ! ${a}`);
    }
  }

  lines.push('');
  lines.push('  ── Snapshots ──');
  for (const s of report.snapshots) {
    lines.push(
      `    tick ${String(s.tick).padStart(4)}: GDP=${s.totalGdp.toExponential(2)} stab=${s.avgStability.toFixed(3)} tens=${s.avgTension.toFixed(3)} loyal=${s.avgMilitaryLoyalty.toFixed(3)} wars=${s.warEventsThisInterval}`,
    );
  }

  lines.push('───────────────────────────────────────────────────────');

  return lines.join('\n');
}

export function formatBalanceReport(report: IBalanceReport): string {
  const { trend, anomalies } = report;
  const first = trend.snapshots[0];
  const last = trend.snapshots[trend.snapshots.length - 1];

  const lines: string[] = [
    '═══════════════════════════════════════════',
    '  Balance Simulation Report',
    '═══════════════════════════════════════════',
    '',
    `  Snapshots:          ${trend.snapshots.length}`,
    `  Total GDP (start):  ${first?.totalGdp.toFixed(2)}`,
    `  Total GDP (end):    ${last?.totalGdp.toFixed(2)}`,
    `  GDP Growth Rate:    ${trend.gdpGrowthRate.toFixed(2)}%`,
    `  Stability Delta:    ${trend.stabilityDelta.toFixed(4)}`,
    `  Tension Delta:      ${trend.tensionDelta.toFixed(4)}`,
    `  Collapsed Entities: ${trend.collapsedEntities}`,
    `  NaN Detected:       ${trend.nanDetected}`,
    `  Infinity Detected:  ${trend.infinityDetected}`,
    '',
  ];

  if (anomalies.length === 0) {
    lines.push('  Anomalies: None detected');
  } else {
    lines.push('  ── Anomalies ──');
    for (const a of anomalies) {
      lines.push(`    ! ${a}`);
    }
  }

  lines.push('─────────────────────────────────────────');

  return lines.join('\n');
}
