import { Timeline } from './core/timeline/timeline.js';
import { EventBus } from './core/event-bus/event-bus.js';
import { WorldState } from './core/world-state/world-state.js';
import { TickEngine } from './core/tick-engine/tick-engine.js';
import { APIGatewayRouter } from './gateway/gateway-router.js';
import { TickBroadcaster } from './gateway/broadcaster.js';
import { startHttpServer } from './gateway/http-server.js';
import { attachWsTransport } from './gateway/ws-transport.js';
import { loadConfig, loadSeedFromFile, IEngineConfig } from './config.js';
import { loadWorldSeed } from './domain/seed/seed-loader.js';
import { ITickEngine } from './core/interfaces/tick-engine.interface.js';
import { IWorldSeed } from './core/interfaces/world-seed.interface.js';
import { ScenarioLoader } from './scenarios/scenario.loader.js';
import { DatabasePersistenceProvider, SaveGameSerializer } from './persistence/index.js';

import { EconomySystem } from './domain/economy/systems/economy.system.js';
import { TradeSystem } from './domain/economy/systems/trade.system.js';
import { MarketSystem } from './domain/economy/systems/market.system.js';
import { SanctionSystem } from './domain/economy/systems/sanction.system.js';
import { PoliticsSystem } from './domain/politics/systems/politics.system.js';
import { CoupSystem } from './domain/politics/systems/coup.system.js';
import { DiplomacySystem } from './domain/diplomacy/systems/diplomacy.system.js';
import { WarSystem } from './domain/war/systems/war.system.js';
import { CombatSystem } from './domain/war/systems/combat.system.js';
import { CombinedArmsCombatSystem } from './domain/war/systems/combined-arms-combat.system.js';
import { MovementSystem } from './domain/war/systems/movement.system.js';
import { ProvinceCombatSystem } from './domain/war/systems/province-combat.system.js';
import { OccupationSystem } from './domain/war/systems/occupation.system.js';
import { PeaceSystem } from './domain/war/systems/peace.system.js';
import { IntelligenceSystem } from './domain/intelligence/systems/intelligence.system.js';
import { AgentActionSystem } from './agents/systems/agent-action.system.js';
import { AgentSystem } from './agents/systems/agent.system.js';
import { buildProviderChain } from './agents/llm/provider.factory.js';
import { createSupabaseMemoryStore } from './agents/memory/supabase-memory-store.js';
import { ISystem } from './core/interfaces/system.interface.js';
import { EntityId } from './core/interfaces/entity.interface.js';
import { AchievementManager } from './scenarios/achievement-manager.js';

const achievementManager = new AchievementManager();

const { heuristic: heuristicProvider } = buildProviderChain({
  openaiApiKey: process.env['OPENAI_API_KEY'],
  ollamaEndpoint: process.env['OLLAMA_ENDPOINT'],
});
const agentMemoryStore = createSupabaseMemoryStore();

const DOMAIN_SYSTEMS = [
  new AgentSystem({
    provider: heuristicProvider,
    defaultIntelLevel: 0.7,
    memoryStore: agentMemoryStore,
  }),
  new AgentActionSystem(),
  new SanctionSystem(),
  new TradeSystem(),
  new EconomySystem(),
  new MarketSystem(),
  new PoliticsSystem(),
  new CoupSystem(),
  new DiplomacySystem(),
  new CombatSystem(),
  new CombinedArmsCombatSystem(),
  new ProvinceCombatSystem(),
  new OccupationSystem(),
  new MovementSystem(),
  new PeaceSystem(),
  new WarSystem(),
  new IntelligenceSystem(),
  achievementManager,
] satisfies ISystem[];

function buildEngine(seed: IWorldSeed): {
  engine: TickEngine;
  worldState: WorldState;
  eventBus: EventBus;
  timeline: Timeline;
  systems: ISystem[];
} {
  const timeline = new Timeline();
  const eventBus = new EventBus(timeline);
  const worldState = new WorldState(seed.scenarioId);
  const engine = new TickEngine(worldState, eventBus, timeline);

  loadWorldSeed(worldState, seed);

  const systems: ISystem[] = [...DOMAIN_SYSTEMS];

  for (const sys of systems) {
    engine.registerSystem(sys);
  }

  return { engine, worldState, eventBus, timeline, systems };
}

function buildEngineFromScenario(scenarioPath: string): {
  engine: TickEngine;
  worldState: WorldState;
  eventBus: EventBus;
  timeline: Timeline;
  systems: ISystem[];
} {
  const loader = new ScenarioLoader();
  const result = loader.loadFromFile(scenarioPath, { systems: DOMAIN_SYSTEMS });
  return {
    engine: result.engine,
    worldState: result.worldState,
    eventBus: result.eventBus,
    timeline: result.timeline,
    systems: result.systems,
  };
}

function resolveEngine(config: IEngineConfig): {
  engine: ITickEngine;
  worldState: WorldState;
  eventBus: EventBus;
  timeline: Timeline;
  systems: ISystem[];
} {
  if (config.scenarioPath) {
    return buildEngineFromScenario(config.scenarioPath);
  }
  const seedRaw = loadSeedFromFile(config.seedPath);
  return buildEngine(seedRaw as IWorldSeed);
}

function runHeadless(config: IEngineConfig): void {
  const { engine } = resolveEngine(config);

  const results = engine.runTicks(config.headlessTicks);
  const meta = engine.getWorldState().getMetadata();

  const output = {
    mode: 'headless',
    ticksExecuted: results.length,
    currentTick: meta.currentTick,
    entityCount: meta.entityCount,
    scenarioId: meta.scenarioId,
  };

  console.log(JSON.stringify(output, null, 2));
}

async function runServer(config: IEngineConfig): Promise<void> {
  const dbProvider = new DatabasePersistenceProvider();
  const resolved = resolveEngine(config);
  const systems = resolved.systems;
  let engine = resolved.engine;

  if (dbProvider.hasSave()) {
    try {
      const savePayload = await dbProvider.loadLatestSave();
      if (savePayload) {
        const restored = SaveGameSerializer.rehydrateEngine(savePayload, systems);
        engine = restored.tickEngine;
        console.log(`[Persistence] Restored active world state from savegame (Tick: ${savePayload.tick})`);
      }
    } catch (err) {
      console.warn(`[Persistence] Could not restore save game, starting fresh: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const eventBus = engine.getEventBus();

  const seedRaw = config.scenarioPath ? undefined : (loadSeedFromFile(config.seedPath) as IWorldSeed);
  const router = new APIGatewayRouter({ engine, systems, baseSeed: seedRaw });
  const broadcaster = new TickBroadcaster();
  broadcaster.attach(engine, eventBus);

  const server = await startHttpServer({ host: config.host, port: config.port, router, staticDir: 'dashboard/dist' });

  const wss = attachWsTransport({ server, broadcaster });

  console.log(JSON.stringify({
    mode: 'server',
    status: 'listening',
    host: config.host,
    port: config.port,
    scenarioId: engine.getWorldState().getMetadata().scenarioId,
  }));

  const gracefulShutdown = async () => {
    try {
      await dbProvider.saveWorldState(engine);
    } catch {
      // ignore
    }
    wss.close();
    server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void gracefulShutdown();
  });

  process.on('SIGTERM', () => {
    void gracefulShutdown();
  });
}

async function runRepl(config: IEngineConfig): Promise<void> {
  const { engine, eventBus } = resolveEngine(config);

  console.log('GeoPolis Engine REPL — Type "help" for commands');
  console.log(`Scenario: ${engine.getWorldState().getMetadata().scenarioId}`);

  const readline = (await import('node:readline')).default;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'geopolis> ',
  });

  rl.prompt();

  rl.on('line', async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) { rl.prompt(); return; }

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0]!;
    const args = parts.slice(1);

    switch (cmd) {
      case 'help':
        console.log('Commands:');
        console.log('  tick [n]      Run N ticks (default: 1)');
        console.log('  state         Print world state metadata');
        console.log('  action <type> <actor> [key=val ...]  Publish an action');
        console.log('  save          Save game state as JSON');
        console.log('  exit / quit   Exit REPL');
        break;

      case 'tick': {
        const count = parseInt(args[0] ?? '1', 10);
        const results = engine.runTicks(count);
        console.log(JSON.stringify({ tick: engine.getCurrentTick(), ticksExecuted: results.length }));
        break;
      }

      case 'state': {
        const meta = engine.getWorldState().getMetadata();
        console.log(JSON.stringify(meta, null, 2));
        break;
      }

      case 'action': {
        const actionType = args[0];
        const actorId = args[1];
        if (!actionType || !actorId) {
          console.log('Usage: action <type> <actorId> [key=val ...]');
          break;
        }
        const params: Record<string, unknown> = {};
        for (let i = 2; i < args.length; i++) {
          const eqIdx = args[i]!.indexOf('=');
          if (eqIdx !== -1) {
            params[args[i]!.slice(0, eqIdx)] = args[i]!.slice(eqIdx + 1);
          }
        }
        const eventId = eventBus.publish(actionType, params, 'repl', actorId as EntityId);
        eventBus.flush();
        console.log(JSON.stringify({ eventId, actionType, status: 'processed' }));
        break;
      }

      case 'save': {
        const { SaveGameSerializer } = await import('./persistence/serializer.js');
        const saveData = SaveGameSerializer.createSaveGame(engine);
        console.log(JSON.stringify(saveData, null, 2));
        break;
      }

      case 'exit':
      case 'quit':
        rl.close();
        return;

      default:
        console.log(`Unknown command: ${cmd}. Type "help"`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('Goodbye!');
    process.exit(0);
  });
}

async function main(): Promise<void> {
  const config = loadConfig();

  switch (config.mode) {
    case 'headless':
      runHeadless(config);
      break;
    case 'server':
      await runServer(config);
      break;
    case 'repl':
      await runRepl(config);
      break;
  }
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
