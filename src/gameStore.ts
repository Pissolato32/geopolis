// gameStore — the persistence layer between the seed JSON, the live game
// state, and Supabase. On first load it seeds the entire world (countries,
// relationships, units, market) into the database and creates a game row.
// On subsequent loads it hydrates from the database so the world survives
// reloads. Mutations (unit moves, disbands, economic events) are written
// back so the state persists.

import { createClient } from "@supabase/supabase-js";
import type { Country, DiplomaticPosture, GameEvent, MarketPrice, PlayerPolicy, Relationship, Unit, UnitType, WorldSeed } from "./shared/types.js";
import { reportError, safePersist } from "./errors.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  reportError(new Error("Missing Supabase environment configuration"), {
    category: "persistence",
    severity: "critical",
    source: "gameStore.init",
    userMessage: "The game database is not configured. Progress will not be saved.",
  });
}

export const supabase = createClient(
  SUPABASE_URL ?? "http://localhost:54321",
  SUPABASE_ANON_KEY ?? "dummy-key",
);

const GAME_NAME = "Modern World 2026";

// Row shapes (snake_case from the DB).
interface GameRow {
  id: string;
  name: string;
  current_tick: number;
}
interface CountryRow {
  code: string;
  numeric_code: string;
  name: string;
  flag: string;
  region: string;
  subregion: string;
  lat: number;
  lng: number;
  population: number;
  gdp: number;
  gdp_per_capita: number;
  treasury: number;
  tax_rate: number;
  stability: number;
  total_personnel: number;
  readiness: number;
  morale: number;
  force_limit: number;
  posture: string | null;
}
interface RelationshipRow {
  country_code: string;
  counterpart_code: string;
  affinity: number;
  tension: number;
}
interface UnitRow {
  id: string;
  name: string;
  owner_code: string;
  type: string;
  readiness: number;
  morale: number;
  strength: number;
  lat: number;
  lng: number;
}
interface MarketRow {
  resource: string;
  price: number;
  delta: number;
}

// ---- public API ------------------------------------------------------------

export interface PersistedWorld {
  gameId: string;
  countries: Country[];
  units: Unit[];
  market: MarketPrice[];
  events: GameEvent[];
}

/** Load or create the world for this browser. Returns the full hydrated state. */
export async function loadOrSeedWorld(seed: WorldSeed): Promise<PersistedWorld> {
  const existing = await findGame();
  if (existing) {
    return hydrateWorld(existing);
  }
  return seedWorld(seed);
}

/** Persist a new event to the events table. */
export async function persistEvent(gameId: string, evt: GameEvent): Promise<void> {
  await safePersist(async () => {
    const { error } = await supabase.from("events").insert({
      game_id: gameId,
      type: evt.type,
      at: evt.at,
      payload: evt as unknown as Record<string, unknown>,
    });
    if (error) throw new Error(`persistEvent: ${error.message}`);
  }, "gameStore.persistEvent");
}

/** Update a unit's position (after a move-unit intent). */
export async function persistUnitMove(gameId: string, unitId: string, lat: number, lng: number): Promise<void> {
  await safePersist(async () => {
    const { error } = await supabase
      .from("units")
      .update({ lat, lng })
      .eq("game_id", gameId)
      .eq("id", unitId);
    if (error) throw new Error(`persistUnitMove: ${error.message}`);
  }, "gameStore.persistUnitMove");
}

/** Delete a unit (after a disband-unit intent). */
export async function persistUnitDisband(gameId: string, unitId: string): Promise<void> {
  await safePersist(async () => {
    const { error } = await supabase.from("units").delete().eq("game_id", gameId).eq("id", unitId);
    if (error) throw new Error(`persistUnitDisband: ${error.message}`);
  }, "gameStore.persistUnitDisband");
}

/** Overwrite market prices (after a market tick). Single batched upsert. */
export async function persistMarket(gameId: string, market: MarketPrice[]): Promise<void> {
  if (market.length === 0) return;
  await safePersist(async () => {
    const records = market.map((p) => ({
      game_id: gameId,
      resource: p.resource,
      price: p.price,
      delta: p.delta,
    }));
    const { error } = await supabase
      .from("market_prices")
      .upsert(records, { onConflict: "game_id,resource" });
    if (error) throw new Error(`persistMarket: ${error.message}`);
  }, "gameStore.persistMarket");
}

/** Persist a player policy change (tax rate, readiness, or posture). */
export async function persistPlayerPolicy(
  gameId: string,
  countryCode: string,
  patch: Partial<PlayerPolicy>
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.taxRate !== undefined) update.tax_rate = patch.taxRate;
  if (patch.readiness !== undefined) update.readiness = patch.readiness;
  if (patch.posture !== undefined) update.posture = patch.posture;
  if (Object.keys(update).length === 0) return;
  await safePersist(async () => {
    const { error } = await supabase
      .from("countries")
      .update(update)
      .eq("game_id", gameId)
      .eq("code", countryCode);
    if (error) throw new Error(`persistPlayerPolicy: ${error.message}`);
  }, "gameStore.persistPlayerPolicy");
}

/** Persist the results of a simulation turn: country stats, relationships, surviving units, and the tick counter. */
export async function persistTurnResults(
  gameId: string,
  tick: number,
  countries: Country[],
  units: Unit[]
): Promise<void> {
  await safePersist(async () => {
    // 1. advance the tick counter
    const { error: tickErr } = await supabase.from("games").update({ current_tick: tick }).eq("id", gameId);
    if (tickErr) throw new Error(`persistTurnResults.tick: ${tickErr.message}`);

    // 2. update country economy + military stats (batch upserts)
    const BATCH = 50;
    for (let i = 0; i < countries.length; i += BATCH) {
      const chunk = countries.slice(i, i + BATCH);
      await Promise.all(
        chunk.map(async (c) => {
          const { error } = await supabase
            .from("countries")
            .update({
              gdp: c.economy.gdp,
              treasury: c.economy.treasury,
              stability: c.economy.stability,
              tax_rate: c.economy.taxRate,
              readiness: c.military.readiness,
              morale: c.military.morale,
            })
            .eq("game_id", gameId)
            .eq("code", c.id);
          if (error) throw new Error(`persistTurnResults.country[${c.id}]: ${error.message}`);
        })
      );
    }

    // 3. update relationships — single batched upsert for all modified pairs
    const relRecords: Record<string, unknown>[] = [];
    for (const c of countries) {
      for (const r of c.relationships) {
        relRecords.push({
          game_id: gameId,
          country_code: c.id,
          counterpart_code: r.countryCode,
          affinity: r.affinity,
          tension: r.tension,
        });
      }
    }
    if (relRecords.length > 0) {
      const BATCH = 200;
      for (let i = 0; i < relRecords.length; i += BATCH) {
        const chunk = relRecords.slice(i, i + BATCH);
        const { error } = await supabase
          .from("relationships")
          .upsert(chunk, { onConflict: "game_id,country_code,counterpart_code" });
        if (error) throw new Error(`persistTurnResults.relationships: ${error.message}`);
      }
    }

    // 4. reconcile units: batch delete units no longer in the roster, batch upsert survivors
    const survivorIds = new Set(units.map((u) => u.id));
    const { data: dbUnits, error: dbErr } = await supabase.from("units").select("id").eq("game_id", gameId);
    if (dbErr) throw new Error(`persistTurnResults.fetchUnits: ${dbErr.message}`);
    const staleIds = ((dbUnits as { id: string }[] | null) ?? []).filter((dbU) => !survivorIds.has(dbU.id));
    if (staleIds.length > 0) {
      const { error } = await supabase.from("units").delete().eq("game_id", gameId).in("id", staleIds.map((u) => u.id));
      if (error) throw new Error(`persistTurnResults.deleteUnits: ${error.message}`);
    }
    if (units.length > 0) {
      const unitRecords = units.map((u) => ({
        game_id: gameId,
        id: u.id,
        name: u.name,
        owner_code: u.ownerCode,
        type: u.type,
        readiness: u.readiness,
        morale: u.morale,
        strength: u.strength,
        lat: u.latlng[0],
        lng: u.latlng[1],
      }));
      const BATCH = 200;
      for (let i = 0; i < unitRecords.length; i += BATCH) {
        const chunk = unitRecords.slice(i, i + BATCH);
        const { error } = await supabase.from("units").upsert(chunk, { onConflict: "game_id,id" });
        if (error) throw new Error(`persistTurnResults.upsertUnits: ${error.message}`);
      }
    }
  }, "gameStore.persistTurnResults");
}

/** Fetch recent events for the log (last 200). */
export async function fetchRecentEvents(gameId: string): Promise<GameEvent[]> {
  const { data, error } = await supabase
    .from("events")
    .select("payload")
    .eq("game_id", gameId)
    .order("at", { ascending: false })
    .limit(200);
  if (error) {
    reportError(new Error(`fetchRecentEvents: ${error.message}`), {
      category: "persistence",
      severity: "warning",
      source: "gameStore.fetchRecentEvents",
    });
    return [];
  }
  return ((data as { payload: GameEvent }[] | null) ?? []).map((r) => r.payload).reverse();
}

// ---- internal: seeding -----------------------------------------------------

async function findGame(): Promise<GameRow | null> {
  const { data, error } = await supabase
    .from("games")
    .select("id, name, current_tick")
    .eq("name", GAME_NAME)
    .maybeSingle();
  if (error) {
    reportError(new Error(`findGame: ${error.message}`), {
      category: "persistence",
      severity: "warning",
      source: "gameStore.findGame",
    });
    return null;
  }
  return (data as GameRow | null) ?? null;
}

async function seedWorld(seed: WorldSeed): Promise<PersistedWorld> {
  // 1. create game row
  const { data: gameRow, error: gErr } = await supabase
    .from("games")
    .insert({ name: GAME_NAME, current_tick: 0 })
    .select("id")
    .single();
  if (gErr || !gameRow) throw new Error(`failed to create game: ${gErr?.message ?? "unknown"}`);
  const gameId = (gameRow as { id: string }).id;

  // 2. insert countries (batch)
  const countryRows = seed.countries.map((c) => toCountryRow(c, gameId));
  await batchInsert("countries", countryRows);

  // 3. insert relationships (only non-empty ones)
  const relRows: Record<string, unknown>[] = [];
  for (const c of seed.countries) {
    for (const r of c.relationships) relRows.push(toRelRow(r, c.id, gameId));
  }
  if (relRows.length) await batchInsert("relationships", relRows);

  // 4. generate + insert units
  const units = generateUnits(seed);
  const unitRows = units.map((u) => toUnitRow(u, gameId));
  await batchInsert("units", unitRows);

  // 5. seed market
  const market = seedMarket();
  const marketRows = market.map((m) => ({ game_id: gameId, resource: m.resource, price: m.price, delta: m.delta }));
  await batchInsert("market_prices", marketRows);

  return { gameId, countries: seed.countries, units, market, events: [] };
}

async function hydrateWorld(game: GameRow): Promise<PersistedWorld> {
  const gameId = game.id;

  const [countriesR, unitsR, marketR, eventsR] = await Promise.all([
    supabase.from("countries").select("*").eq("game_id", gameId).limit(300),
    supabase.from("units").select("*").eq("game_id", gameId).limit(500),
    supabase.from("market_prices").select("*").eq("game_id", gameId),
    supabase.from("events").select("payload").eq("game_id", gameId).order("at", { ascending: false }).limit(200),
  ]);

  // relationships can exceed the 1000-row PostgREST default, so paginate
  const rels = await fetchAllRelationships(gameId);

  if (countriesR.error) throw new Error(`hydrate countries: ${countriesR.error.message}`);

  const relsByCountry = new Map<string, Relationship[]>();
  for (const r of rels) {
    const list = relsByCountry.get(r.country_code) ?? [];
    list.push({ countryCode: r.counterpart_code, affinity: r.affinity, tension: r.tension });
    relsByCountry.set(r.country_code, list);
  }

  const countries: Country[] = ((countriesR.data as CountryRow[] | null) ?? []).map((r) => toCountry(r, relsByCountry.get(r.code) ?? []));

  const units: Unit[] = ((unitsR.data as UnitRow[] | null) ?? []).map(toUnit);

  const market: MarketPrice[] = ((marketR.data as MarketRow[] | null) ?? []).map((m) => ({
    resource: m.resource as MarketPrice["resource"],
    price: m.price,
    delta: m.delta,
  }));

  const events: GameEvent[] = ((eventsR.data as { payload: GameEvent }[] | null) ?? []).map((r) => r.payload).reverse();

  return { gameId, countries, units, market, events };
}

/** Fetch all relationships for a game, paginating past the 1000-row PostgREST default. */
async function fetchAllRelationships(gameId: string): Promise<RelationshipRow[]> {
  const PAGE = 1000;
  const all: RelationshipRow[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("relationships")
      .select("*")
      .eq("game_id", gameId)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`hydrate relationships: ${error.message}`);
    const rows = (data as RelationshipRow[] | null) ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

// ---- internal: helpers -----------------------------------------------------

async function batchInsert(table: string, rows: Record<string, unknown>[]): Promise<void> {
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(`batch insert into ${table}: ${error.message}`);
  }
}

function toCountryRow(c: Country, gameId: string): Record<string, unknown> {
  return {
    game_id: gameId,
    code: c.id,
    numeric_code: c.numericCode,
    name: c.name,
    flag: c.flag,
    region: c.region,
    subregion: c.subregion,
    lat: c.latlng[0],
    lng: c.latlng[1],
    population: c.population,
    gdp: c.economy.gdp,
    gdp_per_capita: c.economy.gdpPerCapita,
    treasury: c.economy.treasury,
    tax_rate: c.economy.taxRate,
    stability: c.economy.stability,
    total_personnel: c.military.totalPersonnel,
    readiness: c.military.readiness,
    morale: c.military.morale,
    force_limit: c.military.forceLimit,
  };
}

function toRelRow(r: Relationship, countryCode: string, gameId: string): Record<string, unknown> {
  return {
    game_id: gameId,
    country_code: countryCode,
    counterpart_code: r.countryCode,
    affinity: r.affinity,
    tension: r.tension,
  };
}

function toUnitRow(u: Unit, gameId: string): Record<string, unknown> {
  return {
    game_id: gameId,
    id: u.id,
    name: u.name,
    owner_code: u.ownerCode,
    type: u.type,
    readiness: u.readiness,
    morale: u.morale,
    strength: u.strength,
    lat: u.latlng[0],
    lng: u.latlng[1],
  };
}

function toCountry(r: CountryRow, rels: Relationship[]): Country {
  return {
    id: r.code,
    numericCode: r.numeric_code,
    name: r.name,
    flag: r.flag,
    latlng: [r.lat, r.lng],
    region: r.region,
    subregion: r.subregion,
    population: r.population,
    economy: {
      gdp: r.gdp,
      gdpPerCapita: r.gdp_per_capita,
      treasury: r.treasury,
      taxRate: Number(r.tax_rate),
      stability: r.stability,
      legislativeSupport: 0.55,
    },
    military: {
      totalPersonnel: r.total_personnel,
      readiness: r.readiness,
      morale: r.morale,
      forceLimit: r.force_limit,
      militaryLoyalty: 70,
    },
    posture: (r.posture as DiplomaticPosture | null) ?? "diplomatic",
    relationships: rels,
  };
}

function toUnit(r: UnitRow): Unit {
  return {
    id: r.id,
    name: r.name,
    ownerCode: r.owner_code,
    type: r.type as UnitType,
    readiness: r.readiness,
    morale: r.morale,
    strength: r.strength,
    latlng: [r.lat, r.lng],
  };
}

// ---- unit + market generators (same logic as the simulator) ----------------

const UNIT_TYPES: UnitType[] = ["infantry", "armor", "navy"];
const UNIT_NAMES: Record<UnitType, string[]> = {
  infantry: ["1st Infantry", "3rd Infantry", "5th Infantry", "7th Infantry", "9th Infantry"],
  armor: ["2nd Armor", "4th Armor", "6th Armor", "8th Armor"],
  navy: ["Atlantic Fleet", "Pacific Fleet", "Mediterranean Fleet", "Indian Fleet", "Northern Fleet"],
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function jitter(lat: number, lng: number, deg: number): [number, number] {
  return [lat + (Math.random() - 0.5) * deg, lng + (Math.random() - 0.5) * deg];
}

function generateUnits(seed: WorldSeed): Unit[] {
  const top = [...seed.countries]
    .sort((a, b) => b.military.totalPersonnel - a.military.totalPersonnel)
    .slice(0, 18);
  const units: Unit[] = [];
  let n = 0;
  for (const c of top) {
    const count = 2 + Math.floor(Math.random() * 2);
    const types: UnitType[] = c.military.totalPersonnel > 500000 ? UNIT_TYPES : ["infantry", "armor"];
    for (let i = 0; i < count; i++) {
      n++;
      const t = types[i % types.length];
      const [lat, lng] = jitter(c.latlng[0], c.latlng[1], 4);
      units.push({
        id: `${c.id}-${n}`,
        name: pick(UNIT_NAMES[t]),
        ownerCode: c.id,
        type: t,
        readiness: c.military.readiness,
        morale: c.military.morale,
        latlng: [lat, lng],
        strength: Math.round(c.military.forceLimit * (0.05 + Math.random() * 0.1)),
      });
    }
  }
  return units;
}

function seedMarket(): MarketPrice[] {
  return [
    { resource: "energy", price: 100, delta: 0 },
    { resource: "food", price: 100, delta: 0 },
    { resource: "minerals", price: 100, delta: 0 },
  ];
}
