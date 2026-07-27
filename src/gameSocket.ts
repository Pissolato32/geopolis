// WebSocket client — connects to the game server when available, and falls
// back to an in-browser event simulator when the backend is not reachable
// (e.g. running `npm run dev` without the Express server). Either way the
// dashboard gets a live event feed, a live unit roster, a fluctuating
// global market, and acknowledged responses to all action-button intents.

import type { Country, GameEvent, IntentResponse, MarketPrice, PlayerPolicy, StrictIntent, Unit, WorldSeed, CabinetCard } from "./shared/types.js";
import { persistEvent, persistMarket, persistPlayerPolicy, persistTurnResults, persistUnitDisband, persistUnitMove, type PersistedWorld } from "./gameStore.js";
import { processTurn } from "./turnEngine.js";
import { selectOptionForPosture } from "./ministerAI.js";
import { reportError, ApiError, WebSocketError } from "./errors.js";

type EventListener = (evt: GameEvent) => void;
type IntentListener = (res: IntentResponse) => void;
type UnitsListener = (units: Unit[]) => void;
type TickListener = (tick: number) => void;
type PlayerListener = (code: string) => void;
type SimStateListener = (state: SimState) => void;
type CabinetCardsListener = (cards: CabinetCard[]) => void;
export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "offline" | "sim";
type ConnectionListener = (status: ConnectionStatus) => void;

export type SimSpeed = 0 | 1 | 2 | 5;
export interface SimState { paused: boolean; speed: SimSpeed; }

const WS_URL = typeof location !== "undefined" ? `ws://${location.host}/ws` : "ws://localhost/ws";
const BACKEND_PROBE = "/health";
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 1000;

class GameSocket {
  private ws: WebSocket | null = null;
  private eventListeners = new Set<EventListener>();
  private intentListeners = new Set<IntentListener>();
  private unitsListeners = new Set<UnitsListener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private mode: "unknown" | "live" | "sim" = "unknown";
  private connectionStatus: ConnectionStatus = "offline";
  private connectionListeners = new Set<ConnectionListener>();
  private offlineActionQueue: StrictIntent[] = [];
  private seed: WorldSeed | null = null;
  private gameId: string | null = null;
  private simTimer: ReturnType<typeof setInterval> | null = null;
  private marketTimer: ReturnType<typeof setInterval> | null = null;
  private autoTickTimer: ReturnType<typeof setInterval> | null = null;
  private units: Unit[] = [];
  private market: MarketPrice[] = [];
  private countries: Country[] = [];
  private currentTick = 0;
  private turnInProgress = false;
  private tickListeners = new Set<TickListener>();
  private playerCode = "USA";
  private playerListeners = new Set<PlayerListener>();
  private simState: SimState = { paused: true, speed: 0 };
  private simStateListeners = new Set<SimStateListener>();
  private cabinetCardsListeners = new Set<CabinetCardsListener>();
  private pendingCabinetCards: CabinetCard[] = [];
  private intelMap = new Map<string, number>();
  private intelListeners = new Set<(target: string, level: number) => void>();

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

  /** Get the current connection status for UI indicators. */
  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /** Subscribe to connection status changes. */
  onConnectionChange(l: ConnectionListener): () => void {
    this.connectionListeners.add(l);
    l(this.connectionStatus);
    return () => this.connectionListeners.delete(l);
  }

  private setConnectionStatus(status: ConnectionStatus): void {
    if (this.connectionStatus === status) return;
    this.connectionStatus = status;
    for (const l of this.connectionListeners) l(status);
  }

  /** Flush queued actions when back online. */
  private flushOfflineQueue(): void {
    if (this.offlineActionQueue.length === 0) return;
    const queued = this.offlineActionQueue.splice(0);
    for (const intent of queued) {
      this.sendIntent(intent);
    }
  }

  connect(): void {
    this.setConnectionStatus("connecting");
    fetch(BACKEND_PROBE)
      .then(async (r) => {
        // Vite's SPA fallback returns 200 + text/html for any GET, including
        // /health. A real backend health endpoint returns JSON. Check the
        // content-type to distinguish a genuine backend from SPA fallback.
        const ct = r.headers.get("content-type") ?? "";
        if (r.ok && ct.includes("application/json")) {
          this.openWebSocket();
        } else {
          this.startSim();
        }
      })
      .catch(() => {
        reportError(new Error("Backend unreachable"), {
          category: "network",
          source: "gameSocket.connect",
        });
        this.startSim();
      });
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
    return this.countries.find((c) => c.id === this.playerCode);
  }

  getPlayerCode(): string {
    return this.playerCode;
  }

  /** Dump the current world state as a JSON-serializable snapshot for the
   *  BYOD directive analyzer. */
  dumpStateForAnalysis(): unknown {
    return {
      tick: this.currentTick,
      playerCode: this.playerCode,
      countries: this.countries.map((c) => ({
        id: c.id,
        name: c.name,
        gdp: c.economy.gdp,
        gdpGrowth: c.economy.stability,
        tension: c.relationships.length > 0 ? Math.max(...c.relationships.map((r) => r.tension)) : 0,
        readiness: c.military.readiness,
        relationships: c.relationships.map((r) => ({ countryCode: r.countryCode, tension: r.tension, affinity: r.affinity })),
      })),
      market: this.market,
      units: this.units.map((u) => ({ ownerCode: u.ownerCode, type: u.type, readiness: u.readiness, latlng: u.latlng })),
    };
  }

  setPlayerCountry(code: string): void {
    const c = this.countries.find((x) => x.id === code);
    if (!c) return;
    this.playerCode = code;
    for (const l of this.playerListeners) l(code);
  }

  onPlayerChange(l: PlayerListener): () => void {
    this.playerListeners.add(l);
    l(this.playerCode);
    return () => this.playerListeners.delete(l);
  }

  getSimState(): SimState { return this.simState; }

  onSimStateChange(l: SimStateListener): () => void {
    this.simStateListeners.add(l);
    l(this.simState);
    return () => this.simStateListeners.delete(l);
  }

  onCabinetCards(l: CabinetCardsListener): () => void {
    this.cabinetCardsListeners.add(l);
    l(this.pendingCabinetCards);
    return () => this.cabinetCardsListeners.delete(l);
  }

  getCabinetCards(): CabinetCard[] {
    return this.pendingCabinetCards;
  }

  private broadcastCabinetCards(): void {
    for (const l of this.cabinetCardsListeners) l(this.pendingCabinetCards);
  }

  setPaused(paused: boolean): void {
    if (this.simState.paused === paused) return;
    this.simState = { ...this.simState, paused };
    this.broadcastSimState();
    this.sendSimControl();
    if (paused) this.stopAutoTick(); else this.startAutoTick();
  }

  setSpeed(speed: SimSpeed): void {
    if (speed === 0) { this.setPaused(true); return; }
    this.simState = { paused: false, speed };
    this.broadcastSimState();
    this.sendSimControl();
    this.startAutoTick();
  }

  private broadcastSimState(): void {
    for (const l of this.simStateListeners) l(this.simState);
  }

  /** Notify the live server of pause/speed changes so its ambient event
   *  generator freezes immediately when the player pauses. */
  private sendSimControl(): void {
    if (this.mode === "live" && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "set_simulation_speed",
        paused: this.simState.paused,
        speed: this.simState.speed,
      }));
    }
  }

  private startAutoTick(): void {
    this.stopAutoTick();
    if (this.simState.paused || this.simState.speed === 0) return;
    const interval = this.simState.speed === 1 ? 4000 : this.simState.speed === 2 ? 2000 : 800;
    this.autoTickTimer = setInterval(() => { void this.advanceTurn(); }, interval);
  }

  private stopAutoTick(): void {
    if (this.autoTickTimer) { clearInterval(this.autoTickTimer); this.autoTickTimer = null; }
  }

  getIntel(target: string): number {
    return this.intelMap.get(target) ?? 0;
  }

  onIntelChange(l: (target: string, level: number) => void): () => void {
    this.intelListeners.add(l);
    return () => this.intelListeners.delete(l);
  }

  private setIntel(target: string, level: number): void {
    const clamped = Math.max(0, Math.min(100, level));
    this.intelMap.set(target, clamped);
    for (const l of this.intelListeners) l(target, clamped);
  }

  /** Apply a player policy change (tax rate, military readiness, or posture).
   *  Updates the in-memory country state, emits an event, and persists. */
  applyPlayerPolicy(patch: Partial<PlayerPolicy>): void {
    const idx = this.countries.findIndex((c) => c.id === this.playerCode);
    if (idx < 0) return;
    const c = this.countries[idx];
    const at = new Date().toISOString();
    const pc = this.playerCode;

    if (patch.taxRate !== undefined) {
      const prev = c.economy.taxRate;
      this.countries[idx] = { ...c, economy: { ...c.economy, taxRate: patch.taxRate } };
      const treasuryImpact = Math.round(c.economy.gdp * (patch.taxRate - prev));
      const evt: GameEvent = { type: "policy.tax-set", at, country: pc, rate: patch.taxRate, treasuryImpact };
      this.emit(evt);
      if (this.gameId) { void persistPlayerPolicy(this.gameId, pc, { taxRate: patch.taxRate }); void persistEvent(this.gameId, evt); }
      return;
    }

    if (patch.readiness !== undefined) {
      const prev = c.military.readiness;
      this.countries[idx] = { ...c, military: { ...c.military, readiness: patch.readiness } };
      const moraleImpact = Math.round((patch.readiness - prev) * -0.2);
      this.countries[idx] = { ...this.countries[idx], military: { ...this.countries[idx].military, morale: Math.max(10, Math.min(100, c.military.morale + moraleImpact)) } };
      const evt: GameEvent = { type: "policy.readiness-set", at, country: pc, level: patch.readiness, moraleImpact };
      this.emit(evt);
      if (this.gameId) { void persistPlayerPolicy(this.gameId, pc, { readiness: patch.readiness }); void persistEvent(this.gameId, evt); }
      return;
    }

    if (patch.posture !== undefined) {
      this.countries[idx] = { ...c, posture: patch.posture };
      const evt: GameEvent = { type: "policy.posture-set", at, country: pc, posture: patch.posture };
      this.emit(evt);
      if (this.gameId) { void persistPlayerPolicy(this.gameId, pc, { posture: patch.posture }); void persistEvent(this.gameId, evt); }
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
    this.setConnectionStatus("connecting");
    try {
      this.ws = new WebSocket(WS_URL);
    } catch (err) {
      reportError(err, { category: "websocket", source: "gameSocket.openWebSocket" });
      this.startSim();
      return;
    }
    this.ws.onopen = () => {
      console.info("[ws] connected to game server (live mode)");
      this.reconnectAttempts = 0;
      this.setConnectionStatus("live");
      this.flushOfflineQueue();
    };
    this.ws.onmessage = (e) => this.handleMessage(e.data);
    this.ws.onclose = (ev) => {
      const reason = ev.code !== 1000 ? `code ${ev.code}` : "normal";
      console.warn(`[ws] disconnected (${reason}); will retry backend`);
      if (ev.code !== 1000) {
        reportError(new WebSocketError(`WebSocket closed: ${reason}`), {
          source: "gameSocket.onclose",
        });
      }
      this.setConnectionStatus("reconnecting");
      this.scheduleReconnect();
    };
    this.ws.onerror = () => {
      reportError(new WebSocketError("WebSocket error"), {
        source: "gameSocket.onerror",
      });
      this.ws?.close();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn(`[ws] max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached — switching to simulator`);
      reportError(new Error("Max reconnection attempts reached"), {
        category: "websocket",
        severity: "warning",
        source: "gameSocket.scheduleReconnect",
        userMessage: "Could not reconnect to the game server after several attempts. Running in offline mode.",
      });
      this.startSim();
      return;
    }
    const attempt = this.reconnectAttempts;
    const delay = Math.min(
      BASE_RECONNECT_DELAY * Math.pow(2, attempt) + Math.random() * 500,
      30000,
    );
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private handleMessage(raw: unknown) {
    let msg: unknown;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : raw as string);
    } catch {
      reportError(new Error("Received unparseable WebSocket message"), {
        category: "websocket",
        severity: "warning",
        source: "gameSocket.handleMessage",
      });
      return;
    }
    if (typeof msg !== "object" || msg === null) return;
    const m = msg as Record<string, unknown>;
    // Server sends typed envelopes: { type: "event_emitted", payload: GameEvent }
    // or { type: "tick_advanced", payload: { tick, summary } }. Legacy bare
    // IntentResponse objects (with an `ok` field) are still supported for
    // the direct WS send/reply path.
    if (typeof m["ok"] === "boolean" && m["type"] === "set_simulation_speed") {
      return;
    } else if (m["type"] === "hello" && typeof m["paused"] === "boolean") {
      this.simState = { ...this.simState, paused: m["paused"] as boolean };
      this.broadcastSimState();
    } else if (typeof m["ok"] === "boolean") {
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
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.offlineActionQueue.push(intent);
      reportError(new Error("Action queued while offline"), {
        category: "offline",
        severity: "info",
        source: "gameSocket.sendIntent",
        userMessage: "You're offline. Your action will be sent when you reconnect.",
      });
      return;
    }

    console.log("[intent] dispatch payload:", JSON.stringify(intent, null, 2));

    // Policy intents are handled locally (they modify the player's own nation)
    if (intent.intent === "set-tax") { this.applyPlayerPolicy({ taxRate: intent.rate }); return; }
    if (intent.intent === "set-readiness") { this.applyPlayerPolicy({ readiness: intent.level }); return; }
    if (intent.intent === "set-posture") { this.applyPlayerPolicy({ posture: intent.posture }); return; }

    // Recruitment creates a unit locally immediately
    if (intent.intent === "recruit-unit") { this.handleRecruitUnit(intent); return; }

    if (intent.intent === "resolve-cabinet-card") { this.handleResolveCabinetCard(intent); return; }

    // Covert ops in sim mode: generate events locally
    if (intent.intent === "send-aid" || intent.intent === "gather-intel" || intent.intent === "fund-sabotage" || intent.intent === "conduct-recon") {
      if (this.mode === "sim") { this.handleCovertOpSim(intent); return; }
    }

    // BYOD directive intents in sim mode: generate events locally
    if (intent.intent === "adjust-tariffs" || intent.intent === "impose-sanction" || intent.intent === "propose-trade") {
      if (this.mode === "sim") { this.handleByodSim(intent); return; }
    }

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
      if (!r.ok) {
        console.warn("[gameSocket] Server action endpoint returned non-200, invoking local simulation fallback.");
        reportError(new ApiError(`Action rejected: ${r.status}`, r.status, "/api/v1/action"), {
          source: "gameSocket.postAction",
          userMessage: "Server rejected the action. Processing locally instead.",
        });
        const res = simulateIntent(intent, this.seed, this.units);
        for (const l of this.intentListeners) l(res);
        if (res.ok) {
          for (const evt of res.events) { this.emit(evt); if (this.gameId) void persistEvent(this.gameId, evt); }
          if (isUnitIntent(intent)) {
            this.units = applyUnitIntent(this.units, intent);
            this.broadcastUnits();
            if (this.gameId) void persistUnitMutation(this.gameId, intent);
          }
        }
        return;
      }
      const res = (await r.json()) as IntentResponse;
      for (const l of this.intentListeners) l(res);
      if (res.ok) {
        for (const evt of res.events) {
          this.emit(evt);
          if (this.gameId) void persistEvent(this.gameId, evt);
        }
      } else if (res.error) {
        reportError(new Error(res.error), {
          category: "api",
          severity: "warning",
          source: "gameSocket.postAction",
          userMessage: res.error,
        });
      }
    } catch (err) {
      console.warn("[gameSocket] Network request failed, falling back to local simulation:", err);
      reportError(err, {
        category: "network",
        source: "gameSocket.postAction",
        userMessage: "Could not send your action to the server. Processing locally instead.",
      });
      const res = simulateIntent(intent, this.seed, this.units);
      for (const l of this.intentListeners) l(res);
      if (res.ok) {
        for (const evt of res.events) { this.emit(evt); if (this.gameId) void persistEvent(this.gameId, evt); }
        if (isUnitIntent(intent)) {
          this.units = applyUnitIntent(this.units, intent);
          this.broadcastUnits();
          if (this.gameId) void persistUnitMutation(this.gameId, intent);
        }
      }
    }
  }

  /** POST to /api/v1/tick to advance the live server's simulation by one
   *  turn. Events arrive over the WebSocket as event_emitted envelopes; this
   *  call just triggers the advance. Returns true if the server accepted. */
  async postServerTick(): Promise<boolean> {
    if (this.mode !== "live") return false;
    try {
      const r = await fetch("/api/v1/tick", { method: "POST" });
      if (!r.ok) {
        reportError(new ApiError(`Tick failed: ${r.status}`, r.status, "/api/v1/tick"), {
          source: "gameSocket.postServerTick",
        });
        // Backend gone or misconfigured — fall back to in-browser sim so the
        // game keeps running instead of repeatedly hitting a dead endpoint.
        if (r.status === 404 || r.status >= 500) {
          console.warn("[ws] backend tick endpoint unavailable — falling back to simulator");
          this.startSim();
        }
      }
      return r.ok;
    } catch (err) {
      reportError(err, {
        category: "network",
        source: "gameSocket.postServerTick",
      });
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

  /** Handle covert ops (send-aid, gather-intel, fund-sabotage) in sim mode.
   *  Generates the appropriate events locally and updates intel state. */
  private handleCovertOpSim(intent: Extract<StrictIntent, { intent: "send-aid" | "gather-intel" | "fund-sabotage" | "conduct-recon" }>): void {
    const at = new Date().toISOString();
    const pc = this.playerCode;
    const res: IntentResponse = { ok: true, acknowledged: intent, events: [] };
    for (const l of this.intentListeners) l(res);

    if (intent.intent === "send-aid") {
      const evt: GameEvent = { type: "aid.sent", at, from: pc, target: intent.target, amount: intent.amount, affinityGain: 15 };
      this.emit(evt);
      if (this.gameId) void persistEvent(this.gameId, evt);
    } else if (intent.intent === "gather-intel") {
      const current = this.intelMap.get(intent.target) ?? 0;
      const newLevel = Math.min(100, current + 25);
      const evt: GameEvent = { type: "intel.gathered", at, player: pc, target: intent.target, intelLevel: newLevel, cost: intent.cost };
      this.emit(evt);
      if (this.gameId) void persistEvent(this.gameId, evt);
    } else if (intent.intent === "conduct-recon") {
      const current = this.intelMap.get(intent.target) ?? 0;
      const newLevel = Math.min(100, current + 20);
      const evt: GameEvent = { type: "intel.gathered", at, player: pc, target: intent.target, intelLevel: newLevel, cost: intent.cost };
      this.emit(evt);
      if (this.gameId) void persistEvent(this.gameId, evt);
    } else if (intent.intent === "fund-sabotage") {
      if (Math.random() < 0.3) {
        const evt: GameEvent = { type: "sabotage.failed", at, from: pc, target: intent.target, cost: intent.cost, reason: "Operatives detected and neutralized" };
        this.emit(evt);
        if (this.gameId) void persistEvent(this.gameId, evt);
      } else {
        const stabilityHit = -(15 + Math.floor(Math.random() * 11));
        const readinessHit = -(15 + Math.floor(Math.random() * 11));
        const evt: GameEvent = { type: "sabotage.executed", at, from: pc, target: intent.target, stabilityHit, readinessHit, cost: intent.cost };
        this.emit(evt);
        if (this.gameId) void persistEvent(this.gameId, evt);
      }
    }
  }

  /** Resolve a cabinet card: apply the chosen option's effects to the
   *  player country, or delegate to the minister AI for automatic selection. */
  /** Handle BYOD directive intents (adjust-tariffs, impose-sanction, propose-trade) in sim mode. */
  private handleByodSim(intent: Extract<StrictIntent, { intent: "adjust-tariffs" | "impose-sanction" | "propose-trade" }>): void {
    const at = new Date().toISOString();
    const pc = this.playerCode;
    const res: IntentResponse = { ok: true, acknowledged: intent, events: [] };
    for (const l of this.intentListeners) l(res);

    if (intent.intent === "adjust-tariffs") {
      const evt: GameEvent = { type: "economy.market-update", at, prices: this.market } as unknown as GameEvent;
      this.emit({ type: "economy.indicator", at, country: pc, gdp: 0, treasury: 0, delta: 0 } as unknown as GameEvent);
      this.emit(evt);
      if (this.gameId) { void persistEvent(this.gameId, evt); void persistPlayerPolicy(this.gameId, pc, {}); }
    } else if (intent.intent === "impose-sanction") {
      const target = this.countries.find((c) => c.id === intent.target);
      const tensionHit = intent.kind === "military" ? 25 : intent.kind === "economic" ? 15 : 10;
      const evt: GameEvent = { type: "diplomacy.treaty-signed", at, parties: [pc, intent.target], kind: "sanction", durationYears: 0 } as unknown as GameEvent;
      this.emit(evt);
      if (target && this.gameId) void persistEvent(this.gameId, evt);
      // Apply tension to relationships
      if (target) {
        const idx = this.countries.findIndex((c) => c.id === pc);
        if (idx >= 0) {
          const updated = { ...this.countries[idx]!, relationships: this.countries[idx]!.relationships.map((r) => r.countryCode === intent.target ? { ...r, tension: Math.min(100, r.tension + tensionHit), affinity: Math.max(0, r.affinity - tensionHit * 0.5) } : r) };
          this.countries = this.countries.map((c, i) => i === idx ? updated : c);
        }
      }
    } else if (intent.intent === "propose-trade") {
      const player = this.countries.find((c) => c.id === pc);
      const target = this.countries.find((c) => c.id === intent.target);
      if (player && target) {
        const lift = Math.round(Math.min(player.economy.gdp, target.economy.gdp) * 0.001);
        const idx = this.countries.findIndex((c) => c.id === pc);
        if (idx >= 0) {
          const updated: Country = { ...this.countries[idx]!, economy: { ...this.countries[idx]!.economy, gdp: this.countries[idx]!.economy.gdp + lift, treasury: this.countries[idx]!.economy.treasury + lift }, relationships: this.countries[idx]!.relationships.map((r) => r.countryCode === intent.target ? { ...r, tension: Math.max(0, r.tension - 10), affinity: Math.min(100, r.affinity + 10) } : r) };
          this.countries = this.countries.map((c, i) => i === idx ? updated : c);
        }
      }
      const evt: GameEvent = { type: "diplomacy.treaty-signed", at, parties: [pc, intent.target], kind: "trade", durationYears: 5 };
      this.emit(evt);
      if (this.gameId) void persistEvent(this.gameId, evt);
    }
  }

  private handleResolveCabinetCard(intent: Extract<StrictIntent, { intent: "resolve-cabinet-card" }>): void {
    const card = this.pendingCabinetCards.find((c) => c.id === intent.cardId);
    if (!card) return;

    const playerIdx = this.countries.findIndex((c) => c.id === intent.from);
    if (playerIdx < 0) return;
    const player = this.countries[playerIdx]!;

    let chosenOption = card.options.find((o) => o.id === intent.optionId);
    let delegated = intent.delegated;

    if (delegated || !chosenOption) {
      chosenOption = selectOptionForPosture(card, player.posture);
      delegated = true;
    }

    if (!chosenOption) return;
    const eff = chosenOption.effects;
    const clamped = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

    const updated: Country = {
      ...player,
      economy: {
        ...player.economy,
        treasury: player.economy.treasury + (eff.treasuryDelta ?? 0),
        stability: clamped(player.economy.stability + (eff.stabilityDelta ?? 0), 0, 100),
        legislativeSupport: clamped(player.economy.legislativeSupport + (eff.legislativeSupportDelta ?? 0), 0, 1),
      },
      military: {
        ...player.military,
        readiness: clamped(player.military.readiness + (eff.readinessDelta ?? 0), 0, 100),
        militaryLoyalty: clamped(player.military.militaryLoyalty + (eff.militaryLoyaltyDelta ?? 0), 0, 100),
      },
    };

    this.countries = this.countries.map((c, i) => (i === playerIdx ? updated : c));

    // remove resolved card from queue
    this.pendingCabinetCards = this.pendingCabinetCards.filter((c) => c.id !== intent.cardId);
    this.broadcastCabinetCards();

    const evt: GameEvent = {
      type: "politics.cabinet-resolved",
      at: new Date().toISOString(),
      country: intent.from,
      cardTitle: card.title,
      optionLabel: chosenOption.label,
      delegated,
    } as unknown as GameEvent;
    this.emit(evt);
    if (this.gameId) void persistEvent(this.gameId, evt);
  }

  // ---- simulator ----------------------------------------------------------

  private startSim(): void {
    if (this.mode === "sim") return;
    this.mode = "sim";
    this.ws = null;
    console.info("[ws] backend not reachable — running in-browser simulator");
    this.setConnectionStatus("sim");
    this.ensureSimRunning();
  }

  private ensureSimRunning(): void {
    if (this.simTimer) return;
    this.simTimer = setInterval(() => {
      if (this.simState.paused) return;
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
    // Track intel changes from gathered events
    if (evt.type === "intel.gathered") {
      this.setIntel(evt.target, evt.intelLevel);
    }
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
        if (ok) return;
      }
      const nextTick = this.currentTick + 1;
      const result = processTurn(this.countries, this.units, nextTick, this.playerCode);
      this.countries = result.countries;
      this.units = result.units;
      this.currentTick = nextTick;
      this.broadcastUnits();
      this.broadcastTick();
      this.pendingCabinetCards = result.cabinetCards;
      this.broadcastCabinetCards();
      for (let i = 0; i < result.events.length; i++) {
        const evt = result.events[i];
        setTimeout(() => {
          this.emit(evt);
          if (this.gameId) void persistEvent(this.gameId, evt);
        }, i * 60);
      }
      if (this.gameId) {
        void persistTurnResults(this.gameId, nextTick, result.countries, result.units);
      }
    } catch (err) {
      reportError(err, {
        category: "api",
        severity: "critical",
        source: "gameSocket.advanceTurn",
        userMessage: "The simulation turn could not be completed. Your world state is intact.",
      });
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

export function simulateIntent(intent: StrictIntent, seed: WorldSeed | null, units: Unit[]): IntentResponse {
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
    intent.intent === "conduct-recon" || intent.intent === "adjust-tariffs" || intent.intent === "impose-sanction" ||
    intent.intent === "recruit-unit" || intent.intent === "resolve-cabinet-card"
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
