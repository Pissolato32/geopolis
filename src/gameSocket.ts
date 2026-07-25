// WebSocket client — connects to the game server when available, and falls
// back to an in-browser event simulator when the backend is not reachable
// (e.g. running `npm run dev` without the Express server). Either way the
// dashboard gets a live event feed, a live unit roster, a fluctuating
// global market, and acknowledged responses to all action-button intents.

import type { Country, GameEvent, IntentResponse, MarketPrice, PlayerPolicy, StrictIntent, Unit, WorldSeed } from "./shared/types.js";
import { persistEvent, persistMarket, persistPlayerPolicy, persistTurnResults, persistUnitDisband, persistUnitMove, type PersistedWorld } from "./gameStore.js";
import { processTurn } from "./turnEngine.js";

const PLAYER_CODE = "USA";

type EventListener = (evt: GameEvent) => void;
type IntentListener = (res: IntentResponse) => void;
type UnitsListener = (units: Unit[]) => void;
type TickListener = (tick: number) => void;

const WS_URL = `ws://${location.host}/ws`;
const BACKEND_PROBE = "/health";

class GameSocket {
  private ws: WebSocket | null = null;
  private eventListeners = new Set<EventListener>();
  private intentListeners = new Set<IntentListener>();
  private unitsListeners = new Set<UnitsListener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private mode: "unknown" | "live" | "sim" = "unknown";
  private seed: WorldSeed | null = null;
  private gameId: string | null = null;
  private simTimer: ReturnType<typeof setInterval> | null = null;
  private marketTimer: ReturnType<typeof setInterval> | null = null;
  private units: Unit[] = [];
  private market: MarketPrice[] = [];
  private countries: Country[] = [];
  private currentTick = 0;
  private turnInProgress = false;
  private tickListeners = new Set<TickListener>();

  /** Hydrate from the persisted world (loaded/seeded via gameStore). */
  setPersistedWorld(world: PersistedWorld, seed: WorldSeed): void {
    this.seed = seed;
    this.gameId = world.gameId;
    this.units = world.units;
    this.market = world.market;
    this.countries = world.countries;
    this.currentTick = 0;
    this.broadcastUnits();
    this.broadcastTick();
    // replay persisted events into the log so a reload shows history
    for (const evt of world.events) this.emit(evt);
    if (this.mode === "sim") this.ensureSimRunning();
  }

  connect(): void {
    fetch(BACKEND_PROBE)
      .then((r) => {
        if (r.ok) this.openWebSocket();
        else this.startSim();
      })
      .catch(() => this.startSim());
  }

  getUnits(): Unit[] {
    return this.units;
  }

  getMarket(): MarketPrice[] {
    return this.market;
  }

  onEvent(l: EventListener): () => void {
    this.eventListeners.add(l);
    return () => this.eventListeners.delete(l);
  }

  onIntentResponse(l: IntentListener): () => void {
    this.intentListeners.add(l);
    return () => this.intentListeners.delete(l);
  }

  onUnits(l: UnitsListener): () => void {
    this.unitsListeners.add(l);
    l(this.units);
    return () => this.unitsListeners.delete(l);
  }

  onTick(l: TickListener): () => void {
    this.tickListeners.add(l);
    l(this.currentTick);
    return () => this.tickListeners.delete(l);
  }

  getTick(): number {
    return this.currentTick;
  }

  getCountries(): Country[] {
    return this.countries;
  }

  /** Get the player's nation (USA) from the current countries array. */
  getPlayerCountry(): Country | undefined {
    return this.countries.find((c) => c.id === PLAYER_CODE);
  }

  /** Apply a player policy change (tax rate, military readiness, or posture).
   *  Updates the in-memory country state, emits an event, and persists. */
  applyPlayerPolicy(patch: Partial<PlayerPolicy>): void {
    const idx = this.countries.findIndex((c) => c.id === PLAYER_CODE);
    if (idx < 0) return;
    const c = this.countries[idx];
    const at = new Date().toISOString();

    if (patch.taxRate !== undefined) {
      const prev = c.economy.taxRate;
      this.countries[idx] = { ...c, economy: { ...c.economy, taxRate: patch.taxRate } };
      const treasuryImpact = Math.round(c.economy.gdp * (patch.taxRate - prev));
      const evt: GameEvent = { type: "policy.tax-set", at, country: PLAYER_CODE, rate: patch.taxRate, treasuryImpact };
      this.emit(evt);
      if (this.gameId) { void persistPlayerPolicy(this.gameId, PLAYER_CODE, { taxRate: patch.taxRate }); void persistEvent(this.gameId, evt); }
      return;
    }

    if (patch.readiness !== undefined) {
      const prev = c.military.readiness;
      this.countries[idx] = { ...c, military: { ...c.military, readiness: patch.readiness } };
      const moraleImpact = Math.round((patch.readiness - prev) * -0.2);
      this.countries[idx] = { ...this.countries[idx], military: { ...this.countries[idx].military, morale: Math.max(10, Math.min(100, c.military.morale + moraleImpact)) } };
      const evt: GameEvent = { type: "policy.readiness-set", at, country: PLAYER_CODE, level: patch.readiness, moraleImpact };
      this.emit(evt);
      if (this.gameId) { void persistPlayerPolicy(this.gameId, PLAYER_CODE, { readiness: patch.readiness }); void persistEvent(this.gameId, evt); }
      return;
    }

    if (patch.posture !== undefined) {
      this.countries[idx] = { ...c, posture: patch.posture };
      const evt: GameEvent = { type: "policy.posture-set", at, country: PLAYER_CODE, posture: patch.posture };
      this.emit(evt);
      if (this.gameId) { void persistPlayerPolicy(this.gameId, PLAYER_CODE, { posture: patch.posture }); void persistEvent(this.gameId, evt); }
      return;
    }
  }

  private broadcastUnits(): void {
    for (const l of this.unitsListeners) l(this.units);
  }

  private broadcastTick(): void {
    for (const l of this.tickListeners) l(this.currentTick);
  }

  private openWebSocket(): void {
    this.mode = "live";
    this.stopSim();
    try {
      this.ws = new WebSocket(WS_URL);
    } catch {
      this.startSim();
      return;
    }
    this.ws.onopen = () => console.info("[ws] connected to game server (live mode)");
    this.ws.onmessage = (e) => this.handleMessage(e.data);
    this.ws.onclose = () => {
      console.warn("[ws] disconnected; will retry backend");
      this.scheduleReconnect();
    };
    this.ws.onerror = () => this.ws?.close();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  private handleMessage(raw: unknown) {
    let msg: unknown;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : raw as string);
    } catch {
      return;
    }
    if (typeof msg !== "object" || msg === null) return;
    const m = msg as Record<string, unknown>;
    // Server sends typed envelopes: { type: "event_emitted", payload: GameEvent }
    // or { type: "tick_advanced", payload: { tick, summary } }. Legacy bare
    // IntentResponse objects (with an `ok` field) are still supported for
    // the direct WS send/reply path.
    if (typeof m["ok"] === "boolean") {
      for (const l of this.intentListeners) l(m as unknown as IntentResponse);
    } else if (m["type"] === "event_emitted" && m["payload"] && typeof m["payload"] === "object") {
      for (const l of this.eventListeners) l((m["payload"] as Record<string, unknown>) as unknown as GameEvent);
    } else if (m["type"] === "tick_advanced" && m["payload"] && typeof (m["payload"] as Record<string, unknown>)["tick"] === "number") {
      const tick = (m["payload"] as { tick: number }).tick;
      this.currentTick = tick;
      this.broadcastTick();
    } else if (typeof m["type"] === "string") {
      for (const l of this.eventListeners) l(m as unknown as GameEvent);
    }
  }

  sendIntent(intent: StrictIntent): void {
    console.log("[intent] dispatch payload:", JSON.stringify(intent, null, 2));

    // Policy intents are handled locally (they modify the player's own nation)
    if (intent.intent === "set-tax") { this.applyPlayerPolicy({ taxRate: intent.rate }); return; }
    if (intent.intent === "set-readiness") { this.applyPlayerPolicy({ readiness: intent.level }); return; }
    if (intent.intent === "set-posture") { this.applyPlayerPolicy({ posture: intent.posture }); return; }

    // Recruitment creates a unit locally immediately — the server validates
    // but the dashboard adds the marker so the player sees instant feedback.
    if (intent.intent === "recruit-unit") { this.handleRecruitUnit(intent); return; }

    if (this.mode === "live" && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(intent));
      return;
    }
    // HTTP POST fallback when WS is open but unresponsive, or as a direct
    // REST call to /api/v1/action when the dashboard prefers request/response.
    if (this.mode === "live") {
      void this.postAction(intent);
      return;
    }
    const res = simulateIntent(intent, this.seed, this.units);
    for (const l of this.intentListeners) l(res);
    if (res.ok) {
      if (res.events.length) {
        setTimeout(() => {
          for (const evt of res.events) {
            this.emit(evt);
            if (this.gameId) void persistEvent(this.gameId, evt);
          }
        }, 250);
      }
      if (isUnitIntent(intent)) {
        this.units = applyUnitIntent(this.units, intent);
        this.broadcastUnits();
        if (this.gameId) void persistUnitMutation(this.gameId, intent);
      }
    }
  }

  /** POST an intent to /api/v1/action as an HTTP fallback when the
   *  WebSocket is not usable. The server validates and returns an
   *  IntentResponse; we pipe it through the same listener path. */
  private async postAction(intent: StrictIntent): Promise<void> {
    try {
      const r = await fetch("/api/v1/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intent),
      });
      if (!r.ok) return;
      const res = (await r.json()) as IntentResponse;
      for (const l of this.intentListeners) l(res);
      if (res.ok) {
        for (const evt of res.events) {
          this.emit(evt);
          if (this.gameId) void persistEvent(this.gameId, evt);
        }
      }
    } catch {
      // network failed — fall back to local simulation
      const res = simulateIntent(intent, this.seed, this.units);
      for (const l of this.intentListeners) l(res);
    }
  }

  /** POST to /api/v1/tick to advance the live server's simulation by one
   *  turn. Events arrive over the WebSocket as event_emitted envelopes; this
   *  call just triggers the advance. Returns true if the server accepted. */
  async postServerTick(): Promise<boolean> {
    if (this.mode !== "live") return false;
    try {
      const r = await fetch("/api/v1/tick", { method: "POST" });
      return r.ok;
    } catch {
      return false;
    }
  }

  /** Recruit a new military unit. Creates it at the player's capital,
   *  adds it to the roster, emits a recruitment event, and forwards the
   *  intent to the server for validation/persistence. */
  private handleRecruitUnit(intent: Extract<StrictIntent, { intent: "recruit-unit" }>): void {
    const player = this.countries.find((c) => c.id === intent.from);
    if (!player) return;
    const id = `${intent.from}-${Date.now().toString(36)}`;
    const names: Record<string, string> = { infantry: "Infantry", armor: "Armor", navy: "Fleet" };
    const unit: Unit = {
      id,
      name: `${Math.floor(Math.random() * 90 + 10)}th ${names[intent.unitType] ?? "Unit"}`,
      ownerCode: intent.from,
      type: intent.unitType,
      readiness: 80,
      morale: 75,
      latlng: [...player.latlng] as [number, number],
      strength: intent.unitType === "infantry" ? 10000 : intent.unitType === "armor" ? 5000 : 3000,
    };
    this.units = [...this.units, unit];
    this.broadcastUnits();
    const evt: GameEvent = {
      type: "military.recruitment",
      at: new Date().toISOString(),
      country: intent.from,
      unitType: intent.unitType,
      unitId: id,
      cost: intent.cost,
    };
    this.emit(evt);
    if (this.gameId) void persistEvent(this.gameId, evt);
    // forward to server if live
    if (this.mode === "live" && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(intent));
    } else if (this.mode === "live") {
      void this.postAction(intent);
    }
  }

  // ---- simulator ----------------------------------------------------------

  private startSim(): void {
    if (this.mode === "sim") return;
    this.mode = "sim";
    this.ws = null;
    console.info("[ws] backend not reachable — running in-browser simulator");
    this.ensureSimRunning();
  }

  private ensureSimRunning(): void {
    if (this.simTimer) return;
    this.simTimer = setInterval(() => {
      if (!this.seed) return;
      const evt = simulateRandomEvent(this.seed, this.units);
      this.emit(evt);
      if (this.gameId) void persistEvent(this.gameId, evt);
    }, 4500);
    if (this.marketTimer) clearInterval(this.marketTimer);
    this.marketTimer = setInterval(() => {
      this.market = tickMarket(this.market);
      const evt: GameEvent = { type: "economy.market-update", at: new Date().toISOString(), prices: this.market };
      this.emit(evt);
      if (this.gameId) void persistMarket(this.gameId, this.market);
    }, 7000);
  }

  private stopSim(): void {
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
    if (this.marketTimer) {
      clearInterval(this.marketTimer);
      this.marketTimer = null;
    }
  }

  private emit(evt: GameEvent): void {
    for (const l of this.eventListeners) l(evt);
  }

  /** Advance the world by one simulation turn. In live mode, asks the
   *  server to tick. In sim mode, processes the turn locally. */
  async advanceTurn(): Promise<void> {
    if (this.turnInProgress || this.countries.length === 0) return;
    this.turnInProgress = true;
    try {
      if (this.mode === "live") {
        const ok = await this.postServerTick();
        if (ok) return; // events will arrive over WS
      }
      const nextTick = this.currentTick + 1;
      const result = processTurn(this.countries, this.units, nextTick);
      this.countries = result.countries;
      this.units = result.units;
      this.currentTick = nextTick;
      this.broadcastUnits();
      this.broadcastTick();
      // emit events with a small stagger so the log feels alive
      for (let i = 0; i < result.events.length; i++) {
        const evt = result.events[i];
        setTimeout(() => {
          this.emit(evt);
          if (this.gameId) void persistEvent(this.gameId, evt);
        }, i * 60);
      }
      // persist the mutated state
      if (this.gameId) {
        void persistTurnResults(this.gameId, nextTick, result.countries, result.units);
      }
    } finally {
      this.turnInProgress = false;
    }
  }
}

function persistUnitMutation(gameId: string, intent: StrictIntent): Promise<void> {
  if (intent.intent === "disband-unit") {
    return persistUnitDisband(gameId, intent.unitId);
  } else if (intent.intent === "move-unit") {
    return persistUnitMove(gameId, intent.unitId, intent.to[0], intent.to[1]);
  }
  // policy intents are handled by applyPlayerPolicy, not here
  return Promise.resolve();
}

export const gameSocket = new GameSocket();

// ---- unit roster generation (moved to gameStore; only helpers kept) ------

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function isUnitIntent(intent: StrictIntent): boolean {
  return intent.intent === "move-unit" || intent.intent === "disband-unit";
}

function applyUnitIntent(units: Unit[], intent: StrictIntent): Unit[] {
  if (intent.intent === "disband-unit") {
    return units.filter((u) => u.id !== intent.unitId);
  }
  if (intent.intent === "move-unit") {
    return units.map((u) => (u.id === intent.unitId ? { ...u, latlng: intent.to } : u));
  }
  return units;
}

// ---- market ----------------------------------------------------------------

function tickMarket(prev: MarketPrice[]): MarketPrice[] {
  return prev.map((p) => {
    const vol = p.resource === "energy" ? 6 : p.resource === "minerals" ? 4 : 3;
    const delta = Math.round((Math.random() - 0.5) * 2 * vol);
    const next = Math.max(20, Math.min(220, p.price + delta));
    return { resource: p.resource, price: next, delta };
  });
}

// ---- event simulation ------------------------------------------------------

function simulateRandomEvent(seed: WorldSeed, units: Unit[]): GameEvent {
  const roll = Math.random();
  const at = new Date().toISOString();
  if (roll < 0.15 && units.length > 6) {
    const a = pick(units);
    const d = pick(units.filter((u) => u.ownerCode !== a.ownerCode)) ?? a;
    return {
      type: "war.unit-destroyed",
      at,
      unitId: d.id,
      ownerCode: d.ownerCode,
      by: a.ownerCode,
    };
  }
  if (roll < 0.4) {
    const a = pick(seed.countries);
    const d = pick(seed.countries.filter((c) => c.id !== a.id));
    return {
      type: "war.combat-resolved",
      at,
      attacker: a.id,
      defender: d.id,
      attackerLosses: Math.round(a.military.forceLimit * 0.15),
      defenderLosses: Math.round(d.military.forceLimit * 0.18),
      victor: a.military.readiness >= d.military.readiness ? a.id : d.id,
    };
  }
  if (roll < 0.7) {
    const a = pick(seed.countries);
    const b = pick(seed.countries.filter((c) => c.id !== a.id));
    return {
      type: "diplomacy.treaty-signed",
      at,
      parties: [a.id, b.id],
      kind: Math.random() < 0.5 ? "trade" : "non-aggression",
      durationYears: Math.round(2 + Math.random() * 8),
    };
  }
  const c = pick(seed.countries);
  const delta = Math.round((Math.random() - 0.5) * c.economy.gdp * 0.0005);
  return {
    type: "economy.indicator",
    at,
    country: c.id,
    gdp: c.economy.gdp,
    treasury: c.economy.treasury,
    delta,
  };
}

function simulateIntent(intent: StrictIntent, seed: WorldSeed | null, units: Unit[]): IntentResponse {
  const at = new Date().toISOString();
  const findC = (code: string): Country | undefined => seed?.countries.find((c) => c.id === code);

  if (intent.intent === "disband-unit") {
    const u = units.find((x) => x.id === intent.unitId);
    if (!u) return { ok: false, error: `unknown unit ${intent.unitId}` };
    return {
      ok: true,
      acknowledged: intent,
      events: [{ type: "war.unit-destroyed", at, unitId: u.id, ownerCode: u.ownerCode, by: u.ownerCode }],
    };
  }
  if (intent.intent === "move-unit") {
    const u = units.find((x) => x.id === intent.unitId);
    if (!u) return { ok: false, error: `unknown unit ${intent.unitId}` };
    return { ok: true, acknowledged: intent, events: [] };
  }

  // Policy, covert ops, and recruitment intents are handled by the player's
  // local methods in sendIntent, not here. Return early so TypeScript can
  // narrow the remaining union to target-bearing intents.
  if (
    intent.intent === "set-tax" || intent.intent === "set-readiness" || intent.intent === "set-posture" ||
    intent.intent === "send-aid" || intent.intent === "gather-intel" || intent.intent === "fund-sabotage" ||
    intent.intent === "recruit-unit"
  ) {
    return { ok: true, acknowledged: intent, events: [] };
  }

  const a = findC(intent.from);
  const d = findC(intent.target);
  if (!a || !d) {
    return { ok: false, error: `unknown country in payload (from=${intent.from}, target=${intent.target})` };
  }
  if (intent.intent === "declare-war") {
    const aPower = a.military.readiness * a.military.morale * a.military.forceLimit;
    const dPower = d.military.readiness * d.military.morale * d.military.forceLimit;
    return {
      ok: true,
      acknowledged: intent,
      events: [
        {
          type: "war.combat-resolved",
          at,
          attacker: a.id,
          defender: d.id,
          attackerLosses: Math.round(a.military.forceLimit * 0.2),
          defenderLosses: Math.round(d.military.forceLimit * 0.25),
          victor: aPower >= dPower ? a.id : d.id,
        },
      ],
    };
  }
  if (intent.intent === "propose-trade") {
    const lift = Math.round(Math.min(a.economy.gdp, d.economy.gdp) * 0.001);
    return {
      ok: true,
      acknowledged: intent,
      events: [
        { type: "diplomacy.treaty-signed", at, parties: [a.id, d.id], kind: "trade", durationYears: 5 },
        { type: "economy.indicator", at, country: a.id, gdp: a.economy.gdp + lift, treasury: a.economy.treasury + lift, delta: lift },
      ],
    };
  }
  return {
    ok: true,
    acknowledged: intent,
    events: [{ type: "diplomacy.treaty-signed", at, parties: [a.id, d.id], kind: "non-aggression", durationYears: 10 }],
  };
}
