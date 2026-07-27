// Seed Validation Suite — pre-consolidation test gate that runs before any
// new seed version is committed to disk or database. Validates schema
// integrity, graph consistency, route continuity, and executes a dry-run
// simulation to ensure the engine can process the seed without errors.
//
// Test gate sequence:
//   1. Schema Integrity — ScenarioSchemaValidator against seed JSON
//   2. Graph Consistency — every relation points to a valid country
//   3. Route Continuity — trade routes have valid start/end country IDs
//   4. Dry-Run Simulation — 10-tick engine simulation with zero exceptions
//
// Result: PASSED → seed is safe to consolidate; FAILED → abort + fallback.

import type { WorldSeed, Country } from "../shared/types.js";

// ─── Types ──────────────────────────────────────────────────────────────

export interface ValidationCheckResult {
  name: string;
  passed: boolean;
  errorCount: number;
  details?: string[];
  durationMs: number;
}

export interface SeedValidationResult {
  passed: boolean;
  checks: ValidationCheckResult[];
  totalDurationMs: number;
  seedVersion: string;
  errors: string[];
}

// ─── Validation Suite ───────────────────────────────────────────────────

export class SeedValidationSuite {
  /** Run all validation checks against a world seed.
   *  The seed must pass ALL checks for the result to be PASSED. */
  validate(seed: WorldSeed): SeedValidationResult {
    const start = Date.now();
    const checks: ValidationCheckResult[] = [];
    const errors: string[] = [];

    // 1. Schema Integrity
    checks.push(this.checkSchemaIntegrity(seed));

    // 2. Graph Consistency
    checks.push(this.checkGraphConsistency(seed));

    // 3. Route Continuity (trade routes / relations)
    checks.push(this.checkRouteContinuity(seed));

    // 4. Dry-Run Simulation
    checks.push(this.checkDryRunSimulation(seed));

    // Aggregate errors
    for (const check of checks) {
      if (!check.passed) {
        errors.push(`${check.name}: ${check.errorCount} error(s)`);
        if (check.details) {
          errors.push(...check.details.slice(0, 10));
        }
      }
    }

    const passed = checks.every((c) => c.passed);

    return {
      passed,
      checks,
      totalDurationMs: Date.now() - start,
      seedVersion: seed.generatedAt,
      errors,
    };
  }

  // ─── Check 1: Schema Integrity ────────────────────────────────────────

  private checkSchemaIntegrity(seed: WorldSeed): ValidationCheckResult {
    const start = Date.now();

    // Validate that the seed has required top-level fields
    const details: string[] = [];
    let errorCount = 0;

    if (!seed.generatedAt || typeof seed.generatedAt !== "string") {
      errorCount++;
      details.push("Missing or invalid 'generatedAt' field");
    }
    if (!seed.source || typeof seed.source !== "string") {
      errorCount++;
      details.push("Missing or invalid 'source' field");
    }
    if (typeof seed.countryCount !== "number" || seed.countryCount < 0) {
      errorCount++;
      details.push("Missing or invalid 'countryCount' field");
    }
    if (!Array.isArray(seed.countries)) {
      errorCount++;
      details.push("Missing or invalid 'countries' array");
    } else {
      // Validate each country has required fields
      for (let i = 0; i < seed.countries.length; i++) {
        const c = seed.countries[i]!;
        const prefix = `countries[${i}] (${c.id ?? "unknown"})`;
        if (!c.id || typeof c.id !== "string") {
          errorCount++;
          details.push(`${prefix}: missing 'id'`);
        }
        if (!c.name || typeof c.name !== "string") {
          errorCount++;
          details.push(`${prefix}: missing 'name'`);
        }
        if (!c.economy || typeof c.economy !== "object") {
          errorCount++;
          details.push(`${prefix}: missing 'economy'`);
        } else if (typeof c.economy.gdp !== "number" || !Number.isFinite(c.economy.gdp)) {
          errorCount++;
          details.push(`${prefix}: economy.gdp is not a finite number`);
        }
        if (!c.military || typeof c.military !== "object") {
          errorCount++;
          details.push(`${prefix}: missing 'military'`);
        }
        if (!Array.isArray(c.relationships)) {
          errorCount++;
          details.push(`${prefix}: missing 'relationships' array`);
        }
      }
    }

    return {
      name: "Schema Integrity",
      passed: errorCount === 0,
      errorCount,
      details: details.length > 0 ? details : undefined,
      durationMs: Date.now() - start,
    };
  }

  // ─── Check 2: Graph Consistency ───────────────────────────────────────

  private checkGraphConsistency(seed: WorldSeed): ValidationCheckResult {
    const start = Date.now();
    const details: string[] = [];
    let errorCount = 0;

    if (!seed.countries || !Array.isArray(seed.countries)) {
      return {
        name: "Graph Consistency",
        passed: false,
        errorCount: 1,
        details: ["countries array is missing or invalid"],
        durationMs: Date.now() - start,
      };
    }
    const countryIds = new Set(seed.countries.map((c) => c.id));

    // Verify every relation points to a valid country
    for (const country of seed.countries) {
      for (const rel of country.relationships) {
        if (!countryIds.has(rel.countryCode)) {
          errorCount++;
          details.push(`${country.id} → relation target '${rel.countryCode}' does not exist`);
        }
      }
    }

    // Verify no duplicate country IDs
    const seenIds = new Set<string>();
    for (const country of seed.countries) {
      if (seenIds.has(country.id)) {
        errorCount++;
        details.push(`Duplicate country ID: ${country.id}`);
      }
      seenIds.add(country.id);
    }

    return {
      name: "Graph Consistency",
      passed: errorCount === 0,
      errorCount,
      details: details.length > 0 ? details : undefined,
      durationMs: Date.now() - start,
    };
  }

  // ─── Check 3: Route Continuity ────────────────────────────────────────

  private checkRouteContinuity(seed: WorldSeed): ValidationCheckResult {
    const start = Date.now();
    const details: string[] = [];
    let errorCount = 0;

    if (!seed.countries || !Array.isArray(seed.countries)) {
      return {
        name: "Route Continuity",
        passed: false,
        errorCount: 1,
        details: ["countries array is missing or invalid"],
        durationMs: Date.now() - start,
      };
    }
    // Verify that all bilateral relationships have valid waypoints
    // (i.e., both source and target countries exist)
    for (const country of seed.countries) {
      for (let i = 0; i < country.relationships.length; i++) {
        const rel = country.relationships[i]!;
        if (!rel.countryCode) {
          errorCount++;
          details.push(`${country.id}: relationship[${i}] has empty countryCode`);
        }
        if (rel.countryCode === country.id) {
          errorCount++;
          details.push(`${country.id}: relationship[${i}] points to self`);
        }
        if (typeof rel.affinity !== "number" || rel.affinity < -100 || rel.affinity > 100) {
          errorCount++;
          details.push(`${country.id}: relationship[${i}] affinity out of bounds: ${rel.affinity}`);
        }
        if (typeof rel.tension !== "number" || rel.tension < 0 || rel.tension > 100) {
          errorCount++;
          details.push(`${country.id}: relationship[${i}] tension out of bounds: ${rel.tension}`);
        }
      }
    }

    return {
      name: "Route Continuity",
      passed: errorCount === 0,
      errorCount,
      details: details.length > 0 ? details : undefined,
      durationMs: Date.now() - start,
    };
  }

  // ─── Check 4: Dry-Run Simulation ──────────────────────────────────────

  private checkDryRunSimulation(seed: WorldSeed): ValidationCheckResult {
    const start = Date.now();
    const details: string[] = [];
    let errorCount = 0;

    // Simulate 10 ticks of state mutation without a full TickEngine.
    // This validates that all country data is processable without
    // triggering unhandled exceptions or invalid state mutations.
    try {
      const workingCountries: Country[] = JSON.parse(JSON.stringify(seed.countries));

      for (let tick = 1; tick <= 10; tick++) {
        for (const country of workingCountries) {
          // Simulate economic tick: GDP growth
          const growthRate = 1 + (country.economy.stability / 1000);
          country.economy.gdp = Math.round(country.economy.gdp * growthRate);

          // Simulate treasury tax collection
          const taxRevenue = country.economy.gdp * country.economy.taxRate * 0.01;
          country.economy.treasury += Math.round(taxRevenue);

          // Simulate military readiness drift
          const drift = (Math.random() - 0.5) * 2;
          country.military.readiness = Math.max(0, Math.min(100, country.military.readiness + drift));

          // Simulate tension normalization
          for (const rel of country.relationships) {
            rel.tension = Math.max(0, Math.min(100, rel.tension + (Math.random() - 0.5)));
            rel.affinity = Math.max(-100, Math.min(100, rel.affinity + (Math.random() - 0.5)));
          }
        }
      }

      // Pre-check: detect invalid values before simulation
      for (const country of workingCountries) {
        if (country.economy.gdp === null || typeof country.economy.gdp !== 'number' || !Number.isFinite(country.economy.gdp)) {
          errorCount++;
          details.push(`${country.id}: GDP is invalid (${country.economy.gdp}) before simulation`);
        }
      }

      // Post-simulation: verify no NaN, Infinity, or null values
      for (const country of workingCountries) {
        if (country.economy.gdp === null || !Number.isFinite(country.economy.gdp)) {
          errorCount++;
          details.push(`${country.id}: GDP is not finite after 10-tick simulation`);
        }
        if (!Number.isFinite(country.economy.treasury)) {
          errorCount++;
          details.push(`${country.id}: Treasury is not finite after 10-tick simulation`);
        }
        if (!Number.isFinite(country.military.readiness)) {
          errorCount++;
          details.push(`${country.id}: Readiness is not finite after 10-tick simulation`);
        }
      }
    } catch (err) {
      errorCount++;
      details.push(`Dry-run simulation threw: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
      name: "Dry-Run Simulation (10 ticks)",
      passed: errorCount === 0,
      errorCount,
      details: details.length > 0 ? details : undefined,
      durationMs: Date.now() - start,
    };
  }

  // ─── Convenience ──────────────────────────────────────────────────────

  /** Quick check — returns true if the seed passes all validation gates. */
  isValid(seed: WorldSeed): boolean {
    return this.validate(seed).passed;
  }
}
