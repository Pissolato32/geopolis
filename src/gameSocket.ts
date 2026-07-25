// WebSocket client — connects to the game server when available, and falls
// back to an in-browser event simulator when the backend is not reachable
// (e.g. running `npm run dev` without the Express server). Either way the
// dashboard gets a live event feed, a live unit roster, a fluctuating
// global market, and acknowledged responses to all action-button intents.

import type { ConflictZone, Country, GameEvent, IntelLevel, IntentResponse, MarketPrice, PlayerPolicy, StrictIntent, Unit, UnitType, WorldSeed } from "./shared/types.js";
import { loadIntelLevels, persistEvent, persistIntel, persistMarket, persistPlayerPolicy, persistRecruitUnit, persistTurnResults, persistUnitDisband, persistUnitMove, persistTreasuryUpdate, type PersistedWorld } from "./gameStore.js";
import { processTurn } from "./turnEngine.js";

const PLAYER_CODE = "USA";

const UNIT_NAMES: Record<UnitType, string[]> = {
  infantry: ["1st Infantry", "2nd Infantry", "3rd Infantry", "4th Infantry", "5th Infantry"],
  armor: ["1st Armored", "2nd Armored", "3rd Armored", "1st Tank Corps", "2nd Tank Corps"],
  navy: ["Atlantic Fleet", "Pacific Fleet", "1st Naval Group", "2nd Naval Group", "3rd Naval Group"],
};

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
  private intel: Record<string, IntelLevel> = {};
  private currentTick = 0;
  private turnInProgress = false;
  private tickListeners = new Set<TickListener>();
  private intelListeners = new Set<(intel: Record<string, IntelLevel>) => void>();
  private trajectory: { from: [number, number]; to: [number, number]; id: string } | null = null;
  private trajectoryListeners = new Set<(t: { from: [number, number]; to: [number, number]; id: string } | null) => void>();

  /** Hydrate from the persisted world (loaded/seeded via gameStore). */
  async setPersistedWorld(world: PersistedWorld, seed: WorldSeed): Promise<void> {
    this.seed = seed;
    this.gameId = world.gameId;
    this.units = world.units;
    this.market = world.market;
    this.countries = world.countries;
    this.intel = world.intel ?? {};
    // if intel wasn't persisted, try loading from DB
    if (Object.keys(this.intel).length === 0 && this.gameId) {
      this.intel = await loadIntelLevels(this.gameId, PLAYER_CODE);
    }
    this.currentTick = 0;
    this.broadcastUnits();
    this.broadcastTick();
    this.broadcastIntel();
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

  getIntel(): Record<string, IntelLevel> {
    return this.intel;
  }

  onIntel(l: (intel: Record<string, IntelLevel>) => void): () => void {
    this.intelListeners.add(l);
    l(this.intel);
    return () => this.intelListeners.delete(l);
  }

  private broadcastIntel(): void {
    for (const l of this.intelListeners) l(this.intel);
  }

  onTrajectory(l: (t: { from: [number, number]; to: [number, number]; id: string } | null) => void): () => void {
    this.trajectoryListeners.add(l);
    l(this.trajectory);
    return () => this.trajectoryListeners.delete(l);
  }

  private broadcastTrajectory(): void {
    for (const l of this.trajectoryListeners) l(this.trajectory);
  }

  /** Compute conflict zones from the current unit roster, grouping nearby units
   *  into clusters. Used by WorldMap to render fog-of-war markers. */
  getConflictZones(): ConflictZone[] {
    return clusterUnits(this.units, this.countries);
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

  /** Deduct funds from the player's treasury. Returns true if successful. */
  private spendTreasury(amount: number): boolean {
    const idx = this.countries.findIndex((c) => c.id === PLAYER_CODE);
    if (idx < 0) return false;
    if (this.countries[idx].economy.treasury < amount) return false;
    this.countries[idx] = {
      ...this.countries[idx],
      economy: { ...this.countries[idx].economy, treasury: this.countries[idx].economy.treasury - amount },
    };
    return true;
  }

  /** Send financial aid to a foreign nation — reduces tension, increases affinity. */
  private applySendAid(intent: Extract<StrictIntent, { intent: "send-aid" }>): void {
    const player = this.countries.find((c) => c.id === PLAYER_CODE);
    const targetIdx = this.countries.findIndex((c) => c.id === intent.target);
    if (!player || targetIdx < 0) return;
    if (!this.spendTreasury(intent.amount)) {
      for (const l of this.intentListeners) l({ ok: false, error: "Insufficient treasury funds" });
      return;
    }
    const target = this.countries[targetIdx];
    // improve relations: increase affinity by 15, reduce tension by 20
    const rels = target.relationships.map((r) =>
      r.countryCode === PLAYER_CODE
        ? { ...r, affinity: Math.min(100, r.affinity + 15), tension: Math.max(0, r.tension - 20) }
        : r
    );
    // also update player's side of the relationship
    const playerRels = player.relationships.map((r) =>
      r.countryCode === target.id
        ? { ...r, affinity: Math.min(100, r.affinity + 15), tension: Math.max(0, r.tension - 20) }
        : r
    );
    this.countries[targetIdx] = { ...target, relationships: rels };
    const playerIdx = this.countries.findIndex((c) => c.id === PLAYER_CODE);
    this.countries[playerIdx] = { ...player, relationships: playerRels };
    const evt: GameEvent = { type: "aid.sent", at: new Date().toISOString(), from: PLAYER_CODE, target: intent.target, amount: intent.amount, affinityGain: 15 };
    this.emit(evt);
    if (this.gameId) { void persistTreasuryUpdate(this.gameId, PLAYER_CODE, this.countries[playerIdx].economy.treasury); void persistEvent(this.gameId, evt); }
    for (const l of this.intentListeners) l({ ok: true, acknowledged: intent, events: [evt] });
  }

  /** Gather intel on a foreign nation — increases the player's intel level. */
  private applyGatherIntel(intent: Extract<StrictIntent, { intent: "gather-intel" }>): void {
    if (!this.spendTreasury(intent.cost)) {
      for (const l of this.intentListeners) l({ ok: false, error: "Insufficient treasury funds" });
      return;
    }
    // increase intel by 25, capped at 100
    const prev = this.intel[intent.target] ?? 0;
    const newLevel = Math.min(100, prev + 25);
    this.intel = { ...this.intel, [intent.target]: newLevel };
    this.broadcastIntel();
    const evt: GameEvent = { type: "intel.gathered", at: new Date().toISOString(), player: PLAYER_CODE, target: intent.target, intelLevel: newLevel, cost: intent.cost };
    this.emit(evt);
    if (this.gameId) { void persistIntel(this.gameId, PLAYER_CODE, intent.target, newLevel); void persistTreasuryUpdate(this.gameId, PLAYER_CODE, this.countries.find((c) => c.id === PLAYER_CODE)!.economy.treasury); void persistEvent(this.gameId, evt); }
    for (const l of this.intentListeners) l({ ok: true, acknowledged: intent, events: [evt] });
  }

  /** Fund sabotage against a foreign nation — 30% chance of failure. */
  private applyFundSabotage(intent: Extract<StrictIntent, { intent: "fund-sabotage" }>): void {
    if (!this.spendTreasury(intent.cost)) {
      for (const l of this.intentListeners) l({ ok: false, error: "Insufficient treasury funds" });
      return;
    }
    const targetIdx = this.countries.findIndex((c) => c.id === intent.target);
    if (targetIdx < 0) return;
    const at = new Date().toISOString();
    const failed = Math.random() < 0.30;
    if (failed) {
      // failure: max out tension, trigger incident
      const target = this.countries[targetIdx];
      const rels = target.relationships.map((r) =>
        r.countryCode === PLAYER_CODE ? { ...r, tension: 100, affinity: Math.max(-100, r.affinity - 30) } : r
      );
      this.countries[targetIdx] = { ...target, relationships: rels };
      const evt: GameEvent = { type: "sabotage.failed", at, from: PLAYER_CODE, target: intent.target, cost: intent.cost, reason: "Operatives exposed — diplomatic incident triggered" };
      this.emit(evt);
      if (this.gameId) { void persistTreasuryUpdate(this.gameId, PLAYER_CODE, this.countries.find((c) => c.id === PLAYER_CODE)!.economy.treasury); void persistEvent(this.gameId, evt); }
      for (const l of this.intentListeners) l({ ok: true, acknowledged: intent, events: [evt] });
      return;
    }
    // success: reduce target stability and readiness
    const target = this.countries[targetIdx];
    const stabilityHit = Math.round(15 + Math.random() * 10);
    const readinessHit = Math.round(10 + Math.random() * 15);
    this.countries[targetIdx] = {
      ...target,
      economy: { ...target.economy, stability: Math.max(1, target.economy.stability - stabilityHit) },
      military: { ...target.military, readiness: Math.max(10, target.military.readiness - readinessHit) },
    };
    const evt: GameEvent = { type: "sabotage.executed", at, from: PLAYER_CODE, target: intent.target, stabilityHit, readinessHit, cost: intent.cost };
    this.emit(evt);
    if (this.gameId) { void persistTreasuryUpdate(this.gameId, PLAYER_CODE, this.countries.find((c) => c.id === PLAYER_CODE)!.economy.treasury); void persistEvent(this.gameId, evt); }
    for (const l of this.intentListeners) l({ ok: true, acknowledged: intent, events: [evt] });
  }

  /** Recruit a new military unit at the player's capital. */
  private applyRecruitUnit(intent: Extract<StrictIntent, { intent: "recruit-unit" }>): void {
    if (!this.spendTreasury(intent.cost)) {
      for (const l of this.intentListeners) l({ ok: false, error: "Insufficient treasury funds" });
      return;
    }
    const player = this.countries.find((c) => c.id === PLAYER_CODE);
    if (!player) return;
    const nameOpts = UNIT_NAMES[intent.unitType];
    const usedNames = this.units.filter((u) => u.ownerCode === PLAYER_CODE && u.type === intent.unitType).map((u) => u.name);
    const name = nameOpts.find((n) => !usedNames.includes(n)) ?? `${nameOpts[0]} ${usedNames.length + 1}`;
    const unit: Unit = {
      id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      type: intent.unitType,
      ownerCode: PLAYER_CODE,
      latlng: [player.latlng[0], player.latlng[1]] as [number, number],
      strength: intent.unitType === "navy" ? 800 : intent.unitType === "armor" ? 500 : 300,
      readiness: 80,
      morale: 75,
    };
    this.units = [...this.units, unit];
    this.broadcastUnits();
    const evt: GameEvent = { type: "military.recruitment", at: new Date().toISOString(), country: PLAYER_CODE, unitType: intent.unitType, unitId: unit.id, cost: intent.cost };
    this.emit(evt);
    if (this.gameId) { void persistRecruitUnit(this.gameId, unit); void persistTreasuryUpdate(this.gameId, PLAYER_CODE, this.countries.find((c) => c.id === PLAYER_CODE)!.economy.treasury); void persistEvent(this.gameId, evt); }
    for (const l of this.intentListeners) l({ ok: true, acknowledged: intent, events: [evt] });
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
    if (typeof m["ok"] === "boolean") {
      for (const l of this.intentListeners) l(m as unknown as IntentResponse);
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

    // Covert ops and recruitment are handled locally (they spend the player's treasury)
    if (intent.intent === "send-aid") { this.applySendAid(intent); return; }
    if (intent.intent === "gather-intel") { this.applyGatherIntel(intent); return; }
    if (intent.intent === "fund-sabotage") { this.applyFundSabotage(intent); return; }
    if (intent.intent === "recruit-unit") { this.applyRecruitUnit(intent); return; }

    if (this.mode === "live" && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(intent));
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
        // show movement trajectory for player units
        if (intent.intent === "move-unit") {
          const u = this.units.find((x) => x.id === intent.unitId);
          if (u && u.ownerCode === PLAYER_CODE) {
            this.trajectory = { id: u.id, from: [u.latlng[0], u.latlng[1]] as [number, number], to: [intent.to[0], intent.to[1]] as [number, number] };
            this.broadcastTrajectory();
            // clear trajectory after 8 seconds
            setTimeout(() => {
              if (this.trajectory?.id === u.id) {
                this.trajectory = null;
                this.broadcastTrajectory();
              }
            }, 8000);
          }
        }
      }
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

  /** Advance the world by one simulation turn. Processes economy, tensions,
   *  combat, and diplomacy. Emits events and persists the new state. */
  async advanceTurn(): Promise<void> {
    if (this.turnInProgress || this.countries.length === 0) return;
    this.turnInProgress = true;
    try {
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

/** Group nearby units into conflict zones for fog-of-war rendering.
 *  Units within ~8 degrees of each other are clustered together. */
function clusterUnits(units: Unit[], countries: Country[]): ConflictZone[] {
  const visited = new Set<string>();
  const zones: ConflictZone[] = [];
  const CLUSTER_RADIUS = 8; // degrees lat/lng

  for (const u of units) {
    if (visited.has(u.id)) continue;
    const cluster: Unit[] = [u];
    visited.add(u.id);
    for (const u2 of units) {
      if (visited.has(u2.id)) continue;
      const dist = Math.abs(u.latlng[0] - u2.latlng[0]) + Math.abs(u.latlng[1] - u2.latlng[1]);
      if (dist <= CLUSTER_RADIUS) {
        cluster.push(u2);
        visited.add(u2.id);
      }
    }
    const centroid: [number, number] = [
      cluster.reduce((s, x) => s + x.latlng[0], 0) / cluster.length,
      cluster.reduce((s, x) => s + x.latlng[1], 0) / cluster.length,
    ];
    const ownerCodes = [...new Set(cluster.map((x) => x.ownerCode))];
    const typeCounts: Record<string, number> = {};
    for (const x of cluster) typeCounts[x.type] = (typeCounts[x.type] ?? 0) + 1;
    const dominantType = (Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "infantry") as UnitType;
    // hostility: multiple owners → high; single owner with enemy posture → medium
    let hostility = 0;
    if (ownerCodes.length > 1) hostility = 80;
    else {
      const owner = countries.find((c) => c.id === ownerCodes[0]);
      if (owner?.posture === "expansionist" || owner?.posture === "assertive") hostility = 40;
    }
    zones.push({
      id: `z-${centroid[0].toFixed(1)}-${centroid[1].toFixed(1)}`,
      centroid,
      unitCount: cluster.length,
      ownerCodes,
      dominantType,
      hostility,
      units: cluster,
    });
  }
  return zones;
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
