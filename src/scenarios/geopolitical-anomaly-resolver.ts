// Geopolitical Anomaly Resolver — handles unexpected structural shifts in
// the world dataset: new countries appearing, existing countries dissolving,
// and malformed/out-of-bounds metric values. Designed to be non-blocking:
// anomalies produce structured warning logs and fallback to baseline
// definitions rather than crashing the engine.
//
// Log format:
//   [GEO_ANOMALY_NEW_ENTITY] Entity <ISO3> detected. Initialized with default baseline.
//   [GEO_ANOMALY_DELETED_ENTITY] Entity <ISO3> missing. Re-routed to successor entity.
//   [GEO_ANOMALY_CLAMPED] Entity <ISO3> field <field> value <old> clamped to <new>.

import type { WorldSeed, Country, Relationship, CountryEconomy, CountryMilitary } from "../shared/types.js";

// ─── Types ──────────────────────────────────────────────────────────────

export interface AnomalyLogEntry {
  code: "GEO_ANOMALY_NEW_ENTITY" | "GEO_ANOMALY_DELETED_ENTITY" | "GEO_ANOMALY_CLAMPED" | "GEO_ANOMALY_MISSING_RELATION";
  message: string;
  countryCode: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface AnomalyResolutionResult {
  resolvedCountries: Country[];
  logs: AnomalyLogEntry[];
  newEntities: string[];
  removedEntities: string[];
  reroutedRelations: number;
  clampedValues: number;
}

// Country alias mapping for dissolution/merger scenarios.
// Maps a dissolved ISO-3 code to its successor's ISO-3 code.
const COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  // Example: "YUG" → "SRB" (Yugoslavia → Serbia)
  // Add real entries as geopolitical events occur
  "YUG": "SRB",
  "SUN": "RUS", // Soviet Union → Russia (legacy)
  "TCH": "CZE", // Czechoslovakia → Czech Republic (legacy)
  "SSD": "SDN", // South Sudan → Sudan (if合并)
};

// ─── Anomaly Resolver ───────────────────────────────────────────────────

export class GeopoliticalAnomalyResolver {
  private logs: AnomalyLogEntry[] = [];

  // ─── New Country Discovery ────────────────────────────────────────────

  /** Detect ISO-3 codes in the incoming seed that don't exist in the baseline.
   *  Initialize them with default EconomyComponent, MilitaryComponent, and
   *  neutral RelationComponent baseline scores. */
  detectNewCountries(baseline: WorldSeed, incoming: WorldSeed): Country[] {
    const baseIds = new Set(baseline.countries.map((c) => c.id));
    const newCountries: Country[] = [];

    for (const country of incoming.countries) {
      if (!baseIds.has(country.id)) {
        const defaultCountry = this.createDefaultCountry(country.id, country.name);
        this.logs.push({
          code: "GEO_ANOMALY_NEW_ENTITY",
          message: `Entity ${country.id} detected. Initialized with default baseline.`,
          countryCode: country.id,
          timestamp: new Date().toISOString(),
          details: { name: country.name, region: country.region },
        });
        newCountries.push(defaultCountry);
      }
    }

    return newCountries;
  }

  /** Create a country with default baseline components. */
  createDefaultCountry(id: string, name: string): Country {
    return {
      id,
      numericCode: "000",
      name,
      flag: "",
      latlng: [0, 0],
      region: "Unknown",
      subregion: "Unknown",
      population: 1_000_000,
      economy: {
        gdp: 10_000_000_000,
        gdpPerCapita: 10_000,
        treasury: 1_000_000_000,
        taxRate: 0.20,
        stability: 50,
        legislativeSupport: 0.50,
      },
      military: {
        totalPersonnel: 10_000,
        readiness: 50,
        morale: 50,
        forceLimit: 5_000,
        militaryLoyalty: 50,
      },
      posture: "diplomatic",
      relationships: [],
    };
  }

  // ─── Country Dissolution / Merger ─────────────────────────────────────

  /** Detect countries that existed in baseline but are missing from incoming.
   *  Re-route their relationships and trade routes to successor entities
   *  based on the alias mapping table. */
  detectDissolvedCountries(baseline: WorldSeed, incoming: WorldSeed, allCountries: Country[]): { removed: string[]; rerouted: number } {
    const incomingIds = new Set(incoming.countries.map((c) => c.id));
    const removed: string[] = [];
    let rerouted = 0;

    for (const baseCountry of baseline.countries) {
      if (!incomingIds.has(baseCountry.id)) {
        removed.push(baseCountry.id);
        const successor = COUNTRY_ALIASES[baseCountry.id];

        if (successor) {
          // Re-route relations to successor entity
          for (const country of allCountries) {
            if (country.id === successor) {
              // Merge relationships from dissolved country into successor
              for (const rel of baseCountry.relationships) {
                if (rel.countryCode === baseCountry.id) continue;
                const existing = country.relationships.find((r) => r.countryCode === rel.countryCode);
                if (existing) {
                  // Average the affinity and tension
                  existing.affinity = Math.round((existing.affinity + rel.affinity) / 2);
                  existing.tension = Math.round((existing.tension + rel.tension) / 2);
                } else {
                  country.relationships.push({ ...rel });
                }
                rerouted++;
              }
            }
          }

          this.logs.push({
            code: "GEO_ANOMALY_DELETED_ENTITY",
            message: `Entity ${baseCountry.id} missing. Re-routed to successor entity ${successor}.`,
            countryCode: baseCountry.id,
            timestamp: new Date().toISOString(),
            details: { successor, reroutedRelations: baseCountry.relationships.length },
          });
        } else {
          this.logs.push({
            code: "GEO_ANOMALY_DELETED_ENTITY",
            message: `Entity ${baseCountry.id} missing. No successor mapping found — relations dropped.`,
            countryCode: baseCountry.id,
            timestamp: new Date().toISOString(),
            details: { successor: null },
          });
        }
      }
    }

    return { removed, rerouted };
  }

  // ─── Value Clamping ───────────────────────────────────────────────────

  /** Clamp out-of-bounds metric values to valid domain ranges.
   *  e.g., negative GDP → 0, stability > 100 → 100. */
  clampCountryValues(country: Country): Country {
    const clamped = { ...country };
    let clampedCount = 0;

    // Economy clamping
    const economy: CountryEconomy = { ...clamped.economy };
    if (economy.gdp < 0) {
      this.logClamp(country.id, "economy.gdp", economy.gdp, 0);
      economy.gdp = 0;
      clampedCount++;
    }
    if (economy.gdpPerCapita < 0) {
      this.logClamp(country.id, "economy.gdpPerCapita", economy.gdpPerCapita, 0);
      economy.gdpPerCapita = 0;
      clampedCount++;
    }
    if (economy.stability < 0 || economy.stability > 100) {
      const clampedVal = Math.max(0, Math.min(100, economy.stability));
      this.logClamp(country.id, "economy.stability", economy.stability, clampedVal);
      economy.stability = clampedVal;
      clampedCount++;
    }
    if (economy.taxRate < 0 || economy.taxRate > 1) {
      const clampedVal = Math.max(0, Math.min(1, economy.taxRate));
      this.logClamp(country.id, "economy.taxRate", economy.taxRate, clampedVal);
      economy.taxRate = clampedVal;
      clampedCount++;
    }
    if (economy.legislativeSupport < 0 || economy.legislativeSupport > 1) {
      const clampedVal = Math.max(0, Math.min(1, economy.legislativeSupport));
      this.logClamp(country.id, "economy.legislativeSupport", economy.legislativeSupport, clampedVal);
      economy.legislativeSupport = clampedVal;
      clampedCount++;
    }
    clamped.economy = economy;

    // Military clamping
    const military: CountryMilitary = { ...clamped.military };
    if (military.readiness < 0 || military.readiness > 100) {
      const clampedVal = Math.max(0, Math.min(100, military.readiness));
      this.logClamp(country.id, "military.readiness", military.readiness, clampedVal);
      military.readiness = clampedVal;
      clampedCount++;
    }
    if (military.morale < 0 || military.morale > 100) {
      const clampedVal = Math.max(0, Math.min(100, military.morale));
      this.logClamp(country.id, "military.morale", military.morale, clampedVal);
      military.morale = clampedVal;
      clampedCount++;
    }
    if (military.militaryLoyalty < 0 || military.militaryLoyalty > 100) {
      const clampedVal = Math.max(0, Math.min(100, military.militaryLoyalty));
      this.logClamp(country.id, "military.militaryLoyalty", military.militaryLoyalty, clampedVal);
      military.militaryLoyalty = clampedVal;
      clampedCount++;
    }
    if (military.totalPersonnel < 0) {
      this.logClamp(country.id, "military.totalPersonnel", military.totalPersonnel, 0);
      military.totalPersonnel = 0;
      clampedCount++;
    }
    if (military.forceLimit < 0) {
      this.logClamp(country.id, "military.forceLimit", military.forceLimit, 0);
      military.forceLimit = 0;
      clampedCount++;
    }
    clamped.military = military;

    // Population clamping
    if (clamped.population < 0) {
      this.logClamp(country.id, "population", clamped.population, 0);
      clamped.population = 0;
      clampedCount++;
    }

    // Relationship clamping
    const relationships: Relationship[] = clamped.relationships.map((r) => {
      let aff = r.affinity;
      let ten = r.tension;
      if (aff < -100 || aff > 100) {
        const clampedVal = Math.max(-100, Math.min(100, aff));
        this.logClamp(country.id, `relationships[${r.countryCode}].affinity`, aff, clampedVal);
        aff = clampedVal;
        clampedCount++;
      }
      if (ten < 0 || ten > 100) {
        const clampedVal = Math.max(0, Math.min(100, ten));
        this.logClamp(country.id, `relationships[${r.countryCode}].tension`, ten, clampedVal);
        ten = clampedVal;
        clampedCount++;
      }
      return { ...r, affinity: aff, tension: ten };
    });
    clamped.relationships = relationships;

    return clamped;
  }

  private logClamp(countryCode: string, field: string, oldVal: number, newVal: number): void {
    this.logs.push({
      code: "GEO_ANOMALY_CLAMPED",
      message: `Entity ${countryCode} field ${field} value ${oldVal} clamped to ${newVal}.`,
      countryCode,
      timestamp: new Date().toISOString(),
      details: { field, oldVal, newVal },
    });
  }

  // ─── Full Resolution ──────────────────────────────────────────────────

  /** Run all anomaly detection and resolution steps on an incoming seed
   *  relative to a baseline. Returns the merged country list and all logs. */
  resolve(baseline: WorldSeed, incoming: WorldSeed): AnomalyResolutionResult {
    this.logs = [];

    // 1. Detect new countries
    const newCountries = this.detectNewCountries(baseline, incoming);

    // 2. Merge: start with incoming, but REPLACE new entities with defaults
    const merged = [...incoming.countries];
    const newIds = new Set(newCountries.map((c) => c.id));
    for (let i = 0; i < merged.length; i++) {
      if (newIds.has(merged[i]!.id)) {
        merged[i] = newCountries.find((c) => c.id === merged[i]!.id)!;
      }
    }
    // Add new countries that weren't in incoming at all
    const incomingIds = new Set(incoming.countries.map((c) => c.id));
    for (const nc of newCountries) {
      if (!incomingIds.has(nc.id)) {
        merged.push(nc);
      }
    }

    // 3. Detect dissolved countries (and re-route relations)
    const { removed, rerouted } = this.detectDissolvedCountries(baseline, incoming, merged);

    // 4. Clamp all out-of-bounds values
    const clamped = merged.map((c) => this.clampCountryValues(c));

    // 5. Verify relation graph consistency — relations pointing to
    //    non-existent countries are flagged and removed
    const validIds = new Set(clamped.map((c) => c.id));
    for (const country of clamped) {
      const validRels = country.relationships.filter((r) => validIds.has(r.countryCode));
      const dropped = country.relationships.length - validRels.length;
      if (dropped > 0) {
        this.logs.push({
          code: "GEO_ANOMALY_MISSING_RELATION",
          message: `Entity ${country.id} had ${dropped} relation(s) pointing to non-existent countries. Dropped.`,
          countryCode: country.id,
          timestamp: new Date().toISOString(),
          details: { droppedCount: dropped },
        });
      }
      country.relationships = validRels;
    }

    return {
      resolvedCountries: clamped,
      logs: this.logs,
      newEntities: newCountries.map((c) => c.id),
      removedEntities: removed,
      reroutedRelations: rerouted,
      clampedValues: this.logs.filter((l) => l.code === "GEO_ANOMALY_CLAMPED").length,
    };
  }

  /** Get the alias mapping for country succession. */
  static getAliases(): Readonly<Record<string, string>> {
    return COUNTRY_ALIASES;
  }
}
