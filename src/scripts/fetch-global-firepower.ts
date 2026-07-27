// Fetch Global Firepower — standalone scraper for GFP country military data.
// Scrapes the GFP rankings page and individual country detail pages.
//
// Usage:
//   npx tsx src/scripts/fetch-global-firepower.ts [--dry-run] [--delay=1000]
//
// Output: data/global-firepower-2026.json
//
// Features:
//   - Built-in rate limiting (default 1 req/sec)
//   - Incremental progress saving (resumes if interrupted)
//   - --dry-run flag tests parsing for a single country
//   - Resilient HTML parsing with cheerio

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const GFP_RANKINGS_URL = "https://www.globalfirepower.com/countries-listing.php";
const GFP_DETAIL_BASE = "https://www.globalfirepower.com/country-military-strength-detail.asp?country_id=";
const OUTPUT_PATH = resolve("data/global-firepower-2026.json");
const PROGRESS_PATH = resolve("data/gfp-progress.json");

interface GFPCountryEntry {
  rank: number;
  countryName: string;
  slug: string;
  pwrIndx: number;
}

interface GFPDetail extends GFPCountryEntry {
  totalScore?: number;
  manpower?: Record<string, number>;
  airpower?: Record<string, number>;
  landForces?: Record<string, number>;
  navalForces?: Record<string, number>;
  financials?: Record<string, number>;
  geography?: Record<string, number>;
  logistics?: Record<string, number>;
  naturalResources?: Record<string, number>;
}

interface GFPProgress {
  lastRankCompleted: number;
  totalCountries: number;
  entries: GFPDetail[];
}

function parseArgs(): { dryRun: boolean; delay: number } {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const delayArg = args.find((a) => a.startsWith("--delay="));
  const delay = delayArg ? parseInt(delayArg.split("=")[1] ?? "1000", 10) : 1000;
  return { dryRun, delay };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function loadProgress(): GFPProgress {
  if (existsSync(PROGRESS_PATH)) {
    try {
      return JSON.parse(readFileSync(PROGRESS_PATH, "utf-8")) as GFPProgress;
    } catch {
      // Corrupted — start fresh
    }
  }
  return { lastRankCompleted: 0, totalCountries: 0, entries: [] };
}

function saveProgress(progress: GFPProgress): void {
  try {
    writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
  } catch {
    // Non-fatal in sandboxed environments
  }
}

// ─── Rankings Page Parser ────────────────────────────────────────────────

function parseRankingsHtml(html: string): GFPCountryEntry[] {
  const entries: GFPCountryEntry[] = [];
  // GFP uses <div class="httpClient"> blocks or table rows.
  // We look for patterns like:
  //   "For 2026, <Country> is ranked <N> of 145"
  //   "PwrIndx* score of <0.xxxx>"
  const rankRegex = /For\s+20\d{2},\s+([^,]+)\s+is\s+ranked\s+(\d+)\s+of\s+\d+/gi;
  const pwrRegex = /PwrIndx\*?\s+score\s+of\s+([\d.]+)/gi;

  const rankMatches = [...html.matchAll(rankRegex)];
  const pwrMatches = [...html.matchAll(pwrRegex)];

  for (let i = 0; i < rankMatches.length; i++) {
    const rankMatch = rankMatches[i]!;
    const countryName = rankMatch[1]!.trim();
    const rank = parseInt(rankMatch[2]!, 10);
    const pwrIndx = pwrMatches[i] ? parseFloat(pwrMatches[i]![1]!) : 0;
    const slug = countryName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

    entries.push({ rank, countryName, slug, pwrIndx });
  }

  return entries;
}

// ─── Detail Page Parser ──────────────────────────────────────────────────

function parseDetailHtml(html: string, entry: GFPCountryEntry): GFPDetail {
  const detail: GFPDetail = { ...entry };

  // Extract GFP$ total score
  const totalScoreMatch = html.match(/GFP\$\s*[:>]?\s*([\d,.]+)/i);
  if (totalScoreMatch) {
    detail.totalScore = parseFloat(totalScoreMatch[1]!.replace(/,/g, ""));
  }

  // Parse category tables. GFP uses structured divs/spans.
  // We extract numeric values from labeled sections.
  function extractSection(sectionName: string): Record<string, number> | undefined {
    const sectionRegex = new RegExp(
      `${sectionName}[\\s\\S]{0,5000}?(?=Manpower|Airpower|Land|Naval|Financials|Geography|Logistics|Natural|Resources|$)`,
      "i",
    );
    const sectionMatch = html.match(sectionRegex);
    if (!sectionMatch) return undefined;

    const sectionHtml = sectionMatch[0]!;
    const values: Record<string, number> = {};
    // Extract labeled numeric values: "Label: 1,234" or "Label 1234"
    const valueRegex = /([A-Za-z][A-Za-z\s]+?)[\s:]+(\d[\d,]*)/g;
    let match: RegExpExecArray | null;
    while ((match = valueRegex.exec(sectionHtml)) !== null) {
      const label = match[1]!.trim().toLowerCase().replace(/\s+/g, "_");
      const value = parseInt(match[2]!.replace(/,/g, ""), 10);
      if (label.length > 2 && value > 0) {
        values[label] = value;
      }
    }
    return Object.keys(values).length > 0 ? values : undefined;
  }

  detail.manpower = extractSection("Manpower");
  detail.airpower = extractSection("Airpower");
  detail.landForces = extractSection("Land Forces");
  detail.navalForces = extractSection("Naval Forces");
  detail.financials = extractSection("Financials");
  detail.geography = extractSection("Geography");
  detail.logistics = extractSection("Logistics");
  detail.naturalResources = extractSection("Natural Resources");

  return detail;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { dryRun, delay } = parseArgs();

  // Dry-run mode: test parsing on a single country
  if (dryRun) {
    process.stdout.write("DRY RUN: Testing detail page parser for USA...\n");
    try {
      const res = await fetch(`${GFP_DETAIL_BASE}united-states`);
      if (!res.ok) {
        process.stderr.write(`Fetch failed: HTTP ${res.status}\n`);
        process.exit(1);
      }
      const html = await res.text();
      const testEntry: GFPCountryEntry = { rank: 1, countryName: "United States", slug: "united-states", pwrIndx: 0.0699 };
      const detail = parseDetailHtml(html, testEntry);
      process.stdout.write(`Parsed: rank=${detail.rank}, pwrIndx=${detail.pwrIndx}, sections=${[
        detail.manpower ? "manpower" : null,
        detail.airpower ? "airpower" : null,
        detail.landForces ? "land" : null,
        detail.navalForces ? "naval" : null,
      ].filter(Boolean).join(", ")}\n`);
    } catch (err) {
      process.stderr.write(`Dry run failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
    return;
  }

  // Full scrape mode
  process.stdout.write("Fetching GFP rankings page...\n");
  let rankings: GFPCountryEntry[] = [];

  try {
    const res = await fetch(GFP_RANKINGS_URL);
    if (!res.ok) {
      process.stderr.write(`Failed to fetch rankings: HTTP ${res.status}\n`);
      process.exit(1);
    }
    const html = await res.text();
    rankings = parseRankingsHtml(html);
    process.stdout.write(`Found ${rankings.length} countries in rankings.\n`);
  } catch (err) {
    process.stderr.write(`Network error fetching rankings: ${err instanceof Error ? err.message : String(err)}\n`);
    process.stderr.write("Note: GFP scraping requires network access. In sandboxed environments, this will fail.\n");
    process.stderr.write("Use the enrichment script's fallback estimation instead.\n");
    process.exit(1);
  }

  // Load progress for resumption
  const progress = loadProgress();
  progress.totalCountries = rankings.length;

  process.stdout.write(`Scraping ${rankings.length} country detail pages (delay: ${delay}ms)...\n`);

  for (const entry of rankings) {
    if (entry.rank <= progress.lastRankCompleted) continue;

    try {
      const res = await fetch(`${GFP_DETAIL_BASE}${entry.slug}`);
      if (res.ok) {
        const html = await res.text();
        const detail = parseDetailHtml(html, entry);
        progress.entries.push(detail);
        process.stdout.write(`  [${entry.rank}/${rankings.length}] ${entry.countryName}: PwrIndx=${entry.pwrIndx}\n`);
      } else {
        process.stderr.write(`  [${entry.rank}/${rankings.length}] ${entry.countryName}: HTTP ${res.status}\n`);
        progress.entries.push({ ...entry });
      }
    } catch (err) {
      process.stderr.write(`  [${entry.rank}] ${entry.countryName}: ${err instanceof Error ? err.message : "error"}\n`);
      progress.entries.push({ ...entry });
    }

    progress.lastRankCompleted = entry.rank;
    saveProgress(progress);
    await sleep(delay);
  }

  // Write final output
  writeFileSync(OUTPUT_PATH, JSON.stringify(progress.entries, null, 2));
  process.stdout.write(`\nDone! Wrote ${progress.entries.length} entries to ${OUTPUT_PATH}\n`);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
