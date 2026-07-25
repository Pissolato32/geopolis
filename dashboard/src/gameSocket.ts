// WebSocket client — connects to the game server when available, and falls
// back to an in-browser event simulator when the backend is not reachable.
// Manages global market, live event feed, and active conflict zones (war icons).

import type { ActiveConflict, Country, GameEvent, IntentResponse, MarketPrice, StrictIntent, Unit, WorldSeed } from "./shared/types.js";

type EventListener = (evt: GameEvent) => void;
type IntentListener = (res: IntentResponse) => void;
type ConflictsListener = (conflicts: ActiveConflict[]) => void;

const WS_URL = `ws://${location.host}/ws`;
const BACKEND_PROBE = "/health";

class GameSocket {
  private ws: WebSocket | null = null;
  private eventListeners = new Set<EventListener>();
  private intentListeners = new Set<IntentListener>();
  private conflictsListeners = new Set<ConflictsListener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private mode: "unknown" | "live" | "sim" = "unknown";
  private seed: WorldSeed | null = null;
  private simTimer: ReturnType<typeof setInterval> | null = null;
  private marketTimer: ReturnType<typeof setInterval> | null = null;
  private conflicts: ActiveConflict[] = [];
  private market: MarketPrice[] = [];

  setSeed(seed: WorldSeed): void {
    this.seed = seed;
    if (this.conflicts.length === 0) {
      this.conflicts = generateInitialConflicts(seed);
      this.broadcastConflicts();
    }
    if (this.market.length === 0) this.market = seedMarket();
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

  getConflicts(): ActiveConflict[] {
    return this.conflicts;
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

  onConflicts(l: ConflictsListener): () => void {
    this.conflictsListeners.add(l);
    l(this.conflicts);
    return () => this.conflictsListeners.delete(l);
  }

  private broadcastConflicts(): void {
    for (const l of this.conflictsListeners) l(this.conflicts);
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
      msg = JSON.parse(typeof raw === "string" ? raw : (raw as string));
    } catch {
      return;
    }
    if (typeof msg !== "object" || msg === null) return;
    const m = msg as Record<string, unknown>;
    if (typeof m["ok"] === "boolean") {
      for (const l of this.intentListeners) l(m as unknown as IntentResponse);
    } else {
      const evt = this.normalizeEvent(m);
      if (evt) {
        for (const l of this.eventListeners) l(evt);
        if (evt.type === "war.combat-resolved") {
          this.processCombatEvent(evt);
        }
      }
    }
  }

  private normalizeEvent(m: Record<string, unknown>): GameEvent | null {
    let target = m;
    let timestamp = (m["timestamp"] as string) || (m["at"] as string) || new Date().toISOString();

    if (m["type"] === "event_emitted" && m["payload"] && typeof m["payload"] === "object") {
      target = m["payload"] as Record<string, unknown>;
      if (target["timestamp"]) timestamp = target["timestamp"] as string;
    }

    const type = (target["type"] as string) || (target["eventType"] as string) || "";
    if (!type) return null;

    const cleanCode = (val: unknown): string => {
      if (typeof val !== "string") return "";
      return val.replace(/^country-/i, "").toUpperCase();
    };

    const payloadData = (target["payload"] as Record<string, unknown>) || target;

    if (type === "economy.indicator") {
      const rawCountry = payloadData["country"] || payloadData["countryId"] || target["countryId"] || target["country"];
      const country = cleanCode(rawCountry);
      const gdp = Number(payloadData["gdp"] ?? target["gdp"] ?? 0);
      const treasury = Number(payloadData["treasury"] ?? target["treasury"] ?? 0);
      const delta = Number(payloadData["delta"] ?? target["delta"] ?? 0);
      return { type: "economy.indicator", at: timestamp, country, gdp, treasury, delta };
    }

    return { ...target, at: timestamp } as GameEvent;
  }

  sendIntent(intent: StrictIntent): void {
    console.log("[intent] dispatch payload:", JSON.stringify(intent, null, 2));
    if (this.mode === "live" && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(intent));
      return;
    }
    const res = simulateIntent(intent, this.seed, this.conflicts);
    for (const l of this.intentListeners) l(res);
    if (res.ok) {
      if (res.events.length) {
        setTimeout(() => {
          for (const evt of res.events) {
            this.emit(evt);
            if (evt.type === "war.combat-resolved") {
              this.processCombatEvent(evt);
            }
          }
        }, 250);
      }
    }
  }

  private processCombatEvent(evt: Extract<GameEvent, { type: "war.combat-resolved" }>): void {
    const existing = this.conflicts.find(
      (c) => (c.attackerCode === evt.attacker && c.defenderCode === evt.defender) ||
             (c.attackerCode === evt.defender && c.defenderCode === evt.attacker)
    );

    if (existing) {
      existing.attackerLosses += evt.attackerLosses;
      existing.defenderLosses += evt.defenderLosses;
      existing.intensity = "high";
    } else if (this.seed) {
      const att = this.seed.countries.find((c) => c.id === evt.attacker);
      const def = this.seed.countries.find((c) => c.id === evt.defender);
      if (att && def) {
        const midLat = (att.latlng[0] + def.latlng[0]) / 2;
        const midLng = (att.latlng[1] + def.latlng[1]) / 2;
        this.conflicts.push({
          id: `conflict-${evt.attacker.toLowerCase()}-${evt.defender.toLowerCase()}`,
          title: `Guerra entre ${att.name} e ${def.name}`,
          attackerCode: evt.attacker,
          defenderCode: evt.defender,
          locationName: `Zona de Fronteira ${att.name}-${def.name}`,
          latlng: [midLat, midLng],
          startedAt: evt.at,
          intensity: "high",
          attackerLosses: evt.attackerLosses,
          defenderLosses: evt.defenderLosses,
          attEstimatedStrength: att.military.totalPersonnel,
          defEstimatedStrength: def.military.totalPersonnel,
        });
      }
    }
    this.broadcastConflicts();
  }

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
      const evt = simulateRandomEvent(this.seed);
      this.emit(evt);
      if (evt.type === "war.combat-resolved") {
        this.processCombatEvent(evt);
      }
    }, 4500);
    if (this.marketTimer) clearInterval(this.marketTimer);
    this.marketTimer = setInterval(() => {
      this.market = tickMarket(this.market);
      this.emit({ type: "economy.market-update", at: new Date().toISOString(), prices: this.market });
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
}

export const gameSocket = new GameSocket();

function generateInitialConflicts(seed: WorldSeed): ActiveConflict[] {
  const rus = seed.countries.find((c) => c.id === "RUS");
  const ukr = seed.countries.find((c) => c.id === "UKR");
  const isr = seed.countries.find((c) => c.id === "ISR");
  const pse = seed.countries.find((c) => c.id === "PSE");

  const conflicts: ActiveConflict[] = [];

  if (rus && ukr) {
    conflicts.push({
      id: "conflict-rus-ukr",
      title: "Guerra da Ucrânia / Fronte Leste Europeu",
      attackerCode: "RUS",
      defenderCode: "UKR",
      locationName: "Donbas & Oblast de Kharkiv",
      latlng: [48.37, 37.8],
      startedAt: "2026-02-24T00:00:00Z",
      intensity: "high",
      attackerLosses: 310000,
      defenderLosses: 240000,
      attEstimatedStrength: rus.military.totalPersonnel,
      defEstimatedStrength: ukr.military.totalPersonnel,
    });
  }

  if (isr && pse) {
    conflicts.push({
      id: "conflict-isr-pse",
      title: "Conflito no Oriente Médio",
      attackerCode: "ISR",
      defenderCode: "PSE",
      locationName: "Faixa de Gaza & Levante",
      latlng: [31.5, 34.45],
      startedAt: "2026-10-07T00:00:00Z",
      intensity: "high",
      attackerLosses: 1800,
      defenderLosses: 38000,
      attEstimatedStrength: isr.military.totalPersonnel,
      defEstimatedStrength: 40000,
    });
  }

  return conflicts;
}

function seedMarket(): MarketPrice[] {
  return [
    { resource: "energy", price: 100, delta: 0 },
    { resource: "food", price: 100, delta: 0 },
    { resource: "minerals", price: 100, delta: 0 },
  ];
}

function tickMarket(prev: MarketPrice[]): MarketPrice[] {
  return prev.map((p) => {
    const vol = p.resource === "energy" ? 6 : p.resource === "minerals" ? 4 : 3;
    const delta = Math.round((Math.random() - 0.5) * 2 * vol);
    const next = Math.max(20, Math.min(220, p.price + delta));
    return { resource: p.resource, price: next, delta };
  });
}

function simulateRandomEvent(seed: WorldSeed): GameEvent {
  const roll = Math.random();
  const at = new Date().toISOString();
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

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function simulateIntent(intent: StrictIntent, seed: WorldSeed | null, conflicts: ActiveConflict[]): IntentResponse {
  const at = new Date().toISOString();
  const findC = (code: string): Country | undefined => seed?.countries.find((c) => c.id === code);

  const targetCode = "target" in intent ? intent.target : "";
  const a = findC(intent.from);
  const d = findC(targetCode);
  if (!a || !d) {
    return { ok: false, error: `unknown country in payload (from=${intent.from}, target=${targetCode})` };
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
