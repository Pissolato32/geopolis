import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ScenarioSchemaValidator } from './scenario.validator.js';
import { ScenarioLoader } from './scenario.loader.js';
import { runBenchmark, runBalanceSimulation, formatBalanceReport, IBenchmarkReport } from './benchmark.runner.js';
import { EconomySystem } from '../domain/economy/systems/economy.system.js';
import { TradeSystem } from '../domain/economy/systems/trade.system.js';
import { MarketSystem } from '../domain/economy/systems/market.system.js';
import { SanctionSystem } from '../domain/economy/systems/sanction.system.js';
import { PoliticsSystem } from '../domain/politics/systems/politics.system.js';
import { CoupSystem } from '../domain/politics/systems/coup.system.js';
import { DiplomacySystem } from '../domain/diplomacy/systems/diplomacy.system.js';

const ALL_SYSTEMS = [
  new SanctionSystem(),
  new TradeSystem(),
  new EconomySystem(),
  new MarketSystem(),
  new PoliticsSystem(),
  new CoupSystem(),
  new DiplomacySystem(),
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PRESETS_DIR = resolve(__dirname, 'presets');

function discoverPresets(): string[] {
  if (!existsSync(PRESETS_DIR)) return [];
  const files = readdirSync(PRESETS_DIR).filter((f) => f.endsWith('.json'));
  return files.map((f) => join(PRESETS_DIR, f));
}

describe('Preset Schema Validation (ADR-003)', () => {
  const validator = new ScenarioSchemaValidator();

  const presetFiles = discoverPresets();
  if (presetFiles.length === 0) {
    it('should have at least one preset file', () => {
      expect(presetFiles.length).toBeGreaterThan(0);
    });
    return;
  }

  for (const filePath of presetFiles) {
    const fileName = filePath.split(/[\\/]/).pop()!;

    it(`should validate preset: ${fileName}`, () => {
      const raw = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      const result = validator.validate(data);
      expect(result.valid, [
        `Preset "${fileName}" failed validation:`,
        ...result.errors.map((e) => `  [${e.path}] ${e.message}`),
      ].join('\n')).toBe(true);
    });

    it(`should load preset without errors: ${fileName}`, () => {
      const raw = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      const loader = new ScenarioLoader();
      const result = loader.loadFromPreset(data, { systems: ALL_SYSTEMS });

      expect(result.loadResult.entityCount).toBeGreaterThan(0);
      expect(result.loadResult.triggerCount).toBeGreaterThanOrEqual(0);
      expect(result.engine.getWorldState().getMetadata().entityCount).toBeGreaterThan(0);
    });
  }
});

describe('Benchmark Stress Test (1000 ticks)', () => {
  const presetFiles = discoverPresets();
  if (presetFiles.length === 0) return;

  for (const filePath of presetFiles) {
    const fileName = filePath.split(/[\\/]/).pop()!;

    it(`should run ${fileName} for 1000 ticks without errors`, () => {
      const raw = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);

      const report: IBenchmarkReport = runBenchmark(data, 1000);

      expect(report.metrics.totalTicks).toBe(1000);
      expect(report.metrics.totalDurationMs).toBeGreaterThan(0);
      expect(report.metrics.avgTickMs).toBeGreaterThan(0);
      expect(report.metrics.ticksPerSecond).toBeGreaterThan(0);

      expect(report.eventBreakdown).toBeDefined();
      expect(report.systemsExecuted).toBeGreaterThan(0);
    });
  }
});

describe('Balance Simulation (100 ticks)', () => {
  const presetFiles = discoverPresets();
  if (presetFiles.length === 0) return;

  for (const filePath of presetFiles) {
    const fileName = filePath.split(/[\\/]/).pop()!;

    it(`should run ${fileName} for 100 ticks without economic collapse`, () => {
      const raw = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);

      const report = runBalanceSimulation(data, 100, 10);

      expect(report.trend.snapshots.length).toBeGreaterThanOrEqual(2);
      expect(report.trend.nanDetected).toBe(false);
      expect(report.trend.infinityDetected).toBe(false);
      expect(report.trend.collapsedEntities).toBe(0);
    });

    it(`should produce stable GDP trend for ${fileName}`, () => {
      const raw = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);

      const report = runBalanceSimulation(data, 100, 10);

      // GDP shouldn't collapse by more than 80%
      expect(report.trend.gdpGrowthRate).toBeGreaterThan(-80);
    });

    it(`should log balance report for ${fileName}`, () => {
      const raw = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);

      const report = runBalanceSimulation(data, 100, 10);
      const formatted = formatBalanceReport(report);

      console.log(formatted);
      expect(formatted).toContain('Balance Simulation Report');
      expect(formatted).toContain('GDP Growth Rate');
    });
  }
});

describe('Escalation Ladder Benchmark — No Early Wars', () => {
  const presetFiles = discoverPresets();
  if (presetFiles.length === 0) return;

  for (const filePath of presetFiles) {
    const fileName = filePath.split(/[\\/]/).pop()!;

    it(`should produce zero war.declared events on ticks 1-5 for ${fileName}`, () => {
      const raw = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);

      const loader = new ScenarioLoader();
      const { engine, eventBus } = loader.loadFromPreset(data, { systems: ALL_SYSTEMS });

      let earlyWarCount = 0;
      eventBus.subscribe('war.declared', () => {
        const tick = engine.getWorldState().getMetadata().currentTick;
        if (tick <= 5) earlyWarCount++;
      });

      for (let tick = 1; tick <= 5; tick++) {
        engine.tick();
        eventBus.flush();
      }

      expect(earlyWarCount).toBe(0);
    });

    it(`should log a clean balance report with no anomalies for ${fileName} (100 ticks)`, () => {
      const raw = readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);

      const report = runBalanceSimulation(data, 100, 10);
      const formatted = formatBalanceReport(report);

      console.log(formatted);

      expect(report.trend.nanDetected).toBe(false);
      expect(report.trend.infinityDetected).toBe(false);
      expect(report.trend.collapsedEntities).toBe(0);
    });
  }
});
