// Game server — serves the seed data over HTTP, streams simulated game events
// over a WebSocket, and accepts strict intent payloads from the dashboard.
//
// Binds 0.0.0.0 so it is reachable inside Replit's preview iframe. If the seed
// file is missing on boot, the server runs the seeder automatically first.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import http from "node:http";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import type { Country, GameEvent, MarketPrice, Unit, WorldSeed } from "../shared/types.js";
import { StrictIntentParser } from "./intentParser.js";
import { processTurn } from "../turnEngine.js";
import { seedMarketPrices, tickMarketPrices } from "./marketSim.js";

interface ScenarioMeta {
  id: string;
  name: string;
  description: string;
  seedFile: string;
}

const SCENARIOS: ScenarioMeta[] = [
  { id: "world-seed-2026", name: "Modern World 2026", description: "Current geopolitical snapshot with all 246 nations.", seedFile: "data/world-seed-2026.json" },
  { id: "crise-recursos-2030", name: "Resource Crisis 2030", description: "Global resource shortage scenario with elevated tensions.", seedFile: "data/world-seed-2026.json" },
  { id: "guerra-fria-1962", name: "Cold War 1962", description: "Bipolar superpower standoff at the height of the Cuban Missile Crisis.", seedFile: "data/world-seed-2026.json" },
];

const DIST_DIR = resolve(process.cwd(), "dist");
const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT ?? 8080);
const SEED_PATH = resolve(process.cwd(), "data", "world-seed-2026.json");

function ensureSeed(): WorldSeed {
  if (!existsSync(SEED_PATH)) {
    console.log(`[server] seed file missing at ${SEED_PATH}; running seeder...`);
    spawnSync("npx", ["tsx", "src/scripts/seed-modern-world.ts"], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
  }
  if (!existsSync(SEED_PATH)) {
    throw new Error(`seeder did not produce ${SEED_PATH}`);
  }
  const raw = readFileSync(SEED_PATH, "utf8");
  return JSON.parse(raw) as WorldSeed;
}

// ---- periodic simulated events --------------------------------------------

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makeRandomEvent(seed: WorldSeed): GameEvent {
  const roll = Math.random();
  if (roll < 0.4) {
    const a = pickRandom(seed.countries);
    const d = pickRandom(seed.countries.filter((c) => c.id !== a.id));
    const attackerLosses = Math.round(a.military.forceLimit * 0.15);
    const defenderLosses = Math.round(d.military.forceLimit * 0.18);
    const victor = a.military.readiness >= d.military.readiness ? a.id : d.id;
    return {
      type: "war.combat-resolved",
      at: new Date().toISOString(),
      attacker: a.id,
      defender: d.id,
      attackerLosses,
      defenderLosses,
      victor,
    };
  }
  if (roll < 0.7) {
    const a = pickRandom(seed.countries);
    const b = pickRandom(seed.countries.filter((c) => c.id !== a.id));
    return {
      type: "diplomacy.treaty-signed",
      at: new Date().toISOString(),
      parties: [a.id, b.id],
      kind: Math.random() < 0.5 ? "trade" : "non-aggression",
      durationYears: Math.round(2 + Math.random() * 8),
    };
  }
  const c = pickRandom(seed.countries);
  const delta = Math.round((Math.random() - 0.5) * c.economy.gdp * 0.0005);
  return {
    type: "economy.indicator",
    at: new Date().toISOString(),
    country: c.id,
    gdp: c.economy.gdp,
    treasury: c.economy.treasury,
    delta,
  };
}

// ---- bootstrap -------------------------------------------------------------

function main() {
  const seed = ensureSeed();
  const parser = new StrictIntentParser(seed);
  console.log(`[server] seed loaded: ${seed.countryCount} countries`);

  // Mutable live state — the server now owns a running simulation that
  // /api/v1/tick advances and /api/v1/action mutates. Both endpoints echo
  // their events back over the WebSocket as event_emitted envelopes so
  // connected dashboards stay in sync without polling.
  let liveCountries: Country[] = seed.countries.map((c) => ({ ...c }));
  let liveUnits: Unit[] = [];
  let liveTick = 0;
  let liveMarket: MarketPrice[] = seedMarketPrices();
  const clients = new Set<WebSocket>();

  const app = express();
  app.use(express.json());
  app.use((_, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Client-Info, Apikey");
    next();
  });
  app.get("/health", (_req, res) => res.json({ ok: true, countries: seed.countryCount, tick: liveTick }));
  app.get("/api/world", (_req, res) => res.json(seed));
  app.get("/api/v1/scenarios", (_req, res) => res.json({ scenarios: SCENARIOS }));
  app.get("/api/v1/state", (_req, res) => res.json({ tick: liveTick, countries: liveCountries, units: liveUnits, market: liveMarket }));

  // POST /api/v1/action — accept a strict intent, validate + simulate it.
  app.post("/api/v1/action", (req, res) => {
    const result = parser.parse(req.body);
    if (result.ok) {
      for (const evt of result.events) broadcastEnvelope(clients, "event_emitted", evt);
    }
    res.json(result);
  });

  // POST /api/v1/tick — advance the simulation by one turn and stream events.
  app.post("/api/v1/tick", (_req, res) => {
    liveTick += 1;
    const result = processTurn(liveCountries, liveUnits, liveTick);
    liveCountries = result.countries;
    liveUnits = result.units;
    liveMarket = tickMarketPrices(liveMarket);
    for (const evt of result.events) broadcastEnvelope(clients, "event_emitted", evt);
    broadcastEnvelope(clients, "tick_advanced", { tick: liveTick, summary: result.events[0] });
    res.json({ ok: true, tick: liveTick, events: result.events });
  });

  // Serve the built dashboard so a single process powers the whole app on one port.
  if (existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR));
    app.get("/{*splat}", (_req, res) => res.sendFile(resolve(DIST_DIR, "index.html")));
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    clients.add(ws);
    ws.send(JSON.stringify({ type: "hello", at: new Date().toISOString(), countryCount: seed.countryCount }));
    ws.on("message", (data: Buffer) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        ws.send(JSON.stringify({ ok: false, error: "invalid JSON" }));
        return;
      }
      const result = parser.parse(parsed);
      if (result.ok) {
        for (const evt of result.events) broadcastEnvelope(clients, "event_emitted", evt);
      }
      ws.send(JSON.stringify(result));
    });
    ws.on("close", () => clients.delete(ws));
  });

  // periodic ambient events so the left-panel feed is alive on its own
  const ticker = setInterval(() => {
    if (clients.size === 0) return;
    broadcastEnvelope(clients, "event_emitted", makeRandomEvent(seed));
  }, 4000);

  server.listen(PORT, HOST, () => {
    const serving = existsSync(DIST_DIR)
      ? " (+ dashboard at /)"
      : " (run `npm run build` then restart to serve the dashboard)";
    console.log(`[server] listening on http://${HOST}:${PORT}  (ws path /ws)${serving}`);
  });

  const shutdown = () => {
    clearInterval(ticker);
    wss.close();
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function broadcastEnvelope(clients: Set<WebSocket>, kind: string, payload: unknown) {
  const msg = JSON.stringify({ type: kind, payload });
  for (const c of clients) {
    if (c.readyState === c.OPEN) c.send(msg);
  }
}

main();
