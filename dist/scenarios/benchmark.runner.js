import { ScenarioLoader } from './scenario.loader.js';
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
export function runBenchmark(preset, tickCount = 1000) {
    const loader = new ScenarioLoader();
    const { engine, eventBus } = loader.loadFromPreset(preset, {
        systems: ALL_SYSTEMS,
    });
    const eventCounter = {};
    eventBus.subscribe('*', (event) => {
        const type = event.type;
        eventCounter[type] = (eventCounter[type] ?? 0) + 1;
    });
    const tickDurations = [];
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
    const metrics = {
        scenarioName: preset.metadata.name,
        totalTicks: tickCount,
        totalDurationMs: Math.round(totalDuration * 100) / 100,
        ticksPerSecond: Math.round((tickCount / totalDuration) * 1000 * 100) / 100,
        avgTickMs: Math.round((totalDuration / tickCount) * 1000) / 1000,
        minTickMs: Math.round(tickDurationsSorted[0] * 1000) / 1000,
        maxTickMs: Math.round(tickDurationsSorted[tickDurationsSorted.length - 1] * 1000) / 1000,
        eventsEmitted: totalEvents,
    };
    return {
        metrics,
        eventBreakdown: { ...eventCounter },
        systemsExecuted: tickCount * engine.getRegisteredSystems().length,
    };
}
export function formatBenchmarkReport(report) {
    const { metrics, eventBreakdown, systemsExecuted } = report;
    const lines = [
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
//# sourceMappingURL=benchmark.runner.js.map