import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

interface RestCountry {
  name: { common: string; official: string };
  cca2: string;
  cca3: string;
  latlng: [number, number];
  population: number;
  capitalInfo?: { latlng?: [number, number] };
  region?: string;
  subregion?: string;
}

const FALLBACK_COUNTRIES: Array<{ cca2: string; name: string; lat: number; lng: number; pop: number }> = [
  { cca2: 'US', name: 'United States', lat: 38.0, lng: -97.0, pop: 331000000 },
  { cca2: 'BR', name: 'Brazil', lat: -10.0, lng: -55.0, pop: 214000000 },
  { cca2: 'CN', name: 'China', lat: 35.0, lng: 105.0, pop: 1412000000 },
  { cca2: 'RU', name: 'Russia', lat: 60.0, lng: 100.0, pop: 143000000 },
  { cca2: 'GB', name: 'United Kingdom', lat: 54.0, lng: -2.0, pop: 67000000 },
  { cca2: 'FR', name: 'France', lat: 46.0, lng: 2.0, pop: 68000000 },
  { cca2: 'DE', name: 'Germany', lat: 51.0, lng: 9.0, pop: 83000000 },
  { cca2: 'IN', name: 'India', lat: 20.0, lng: 77.0, pop: 1408000000 },
  { cca2: 'JP', name: 'Japan', lat: 36.0, lng: 138.0, pop: 125000000 },
  { cca2: 'AR', name: 'Argentina', lat: -38.0, lng: -63.0, pop: 45000000 },
  { cca2: 'CU', name: 'Cuba', lat: 21.5, lng: -80.0, pop: 11000000 },
  { cca2: 'UA', name: 'Ukraine', lat: 49.0, lng: 32.0, pop: 41000000 },
  { cca2: 'ZA', name: 'South Africa', lat: -29.0, lng: 24.0, pop: 59000000 },
  { cca2: 'AU', name: 'Australia', lat: -25.0, lng: 133.0, pop: 25600000 },
  { cca2: 'EG', name: 'Egypt', lat: 26.0, lng: 30.0, pop: 104000000 },
  { cca2: 'SA', name: 'Saudi Arabia', lat: 24.0, lng: 45.0, pop: 35000000 },
  { cca2: 'MX', name: 'Mexico', lat: 23.0, lng: -102.0, pop: 128000000 },
  { cca2: 'CA', name: 'Canada', lat: 60.0, lng: -95.0, pop: 38000000 },
  { cca2: 'IT', name: 'Italy', lat: 42.8, lng: 12.8, pop: 59000000 },
  { cca2: 'ES', name: 'Spain', lat: 40.0, lng: -4.0, pop: 47000000 },
  { cca2: 'KR', name: 'South Korea', lat: 36.0, lng: 128.0, pop: 51700000 },
  { cca2: 'ID', name: 'Indonesia', lat: -5.0, lng: 120.0, pop: 273000000 },
  { cca2: 'TR', name: 'Turkey', lat: 39.0, lng: 35.0, pop: 84000000 },
  { cca2: 'PL', name: 'Poland', lat: 52.0, lng: 19.0, pop: 38000000 },
  { cca2: 'SE', name: 'Sweden', lat: 62.0, lng: 15.0, pop: 10400000 },
  { cca2: 'NO', name: 'Norway', lat: 62.0, lng: 10.0, pop: 5400000 },
  { cca2: 'FI', name: 'Finland', lat: 64.0, lng: 26.0, pop: 5500000 },
  { cca2: 'NL', name: 'Netherlands', lat: 52.5, lng: 5.7, pop: 17500000 },
  { cca2: 'CH', name: 'Switzerland', lat: 47.0, lng: 8.0, pop: 8600000 },
  { cca2: 'AT', name: 'Austria', lat: 47.3, lng: 13.3, pop: 8900000 },
  { cca2: 'BE', name: 'Belgium', lat: 50.8, lng: 4.4, pop: 11500000 },
  { cca2: 'PT', name: 'Portugal', lat: 39.5, lng: -8.0, pop: 10300000 },
  { cca2: 'GR', name: 'Greece', lat: 39.0, lng: 22.0, pop: 10700000 },
  { cca2: 'CL', name: 'Chile', lat: -35.0, lng: -71.0, pop: 19000000 },
  { cca2: 'CO', name: 'Colombia', lat: 4.0, lng: -73.0, pop: 51000000 },
  { cca2: 'PE', name: 'Peru', lat: -10.0, lng: -76.0, pop: 33000000 },
  { cca2: 'VE', name: 'Venezuela', lat: 8.0, lng: -66.0, pop: 28000000 },
  { cca2: 'NG', name: 'Nigeria', lat: 10.0, lng: 8.0, pop: 211000000 },
  { cca2: 'KE', name: 'Kenya', lat: 1.0, lng: 38.0, pop: 53000000 },
  { cca2: 'PK', name: 'Pakistan', lat: 30.0, lng: 70.0, pop: 225000000 },
  { cca2: 'BD', name: 'Bangladesh', lat: 24.0, lng: 90.0, pop: 169000000 },
  { cca2: 'VN', name: 'Vietnam', lat: 16.0, lng: 106.0, pop: 97000000 },
  { cca2: 'TH', name: 'Thailand', lat: 15.0, lng: 100.0, pop: 70000000 },
  { cca2: 'PH', name: 'Philippines', lat: 13.0, lng: 122.0, pop: 110000000 },
  { cca2: 'MY', name: 'Malaysia', lat: 2.5, lng: 112.5, pop: 32000000 },
  { cca2: 'SG', name: 'Singapore', lat: 1.35, lng: 103.8, pop: 5700000 },
  { cca2: 'NZ', name: 'New Zealand', lat: -41.0, lng: 174.0, pop: 5100000 },
  { cca2: 'IR', name: 'Iran', lat: 32.0, lng: 53.0, pop: 85000000 },
  { cca2: 'IQ', name: 'Iraq', lat: 33.0, lng: 44.0, pop: 40000000 },
  { cca2: 'IL', name: 'Israel', lat: 31.5, lng: 34.75, pop: 9300000 },
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');

async function fetchRestCountries(): Promise<Array<{ cca2: string; name: string; lat: number; lng: number; pop: number }>> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://restcountries.com/v3.1/all?fields=name,cca2,latlng,population', { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as RestCountry[];

    const countries = data
      .filter((c) => c.cca2 && c.name?.common && Array.isArray(c.latlng) && c.latlng.length >= 2)
      .map((c) => ({
        cca2: c.cca2.toUpperCase(),
        name: c.name.common,
        lat: c.latlng[0]!,
        lng: c.latlng[1]!,
        pop: c.population || 1000000,
      }));

    if (countries.length > 20) return countries;
  } catch (err) {
    console.log(`[Seeder] REST Countries API fetch failed or timed out (${err instanceof Error ? err.message : String(err)}). Using fallback list.`);
  }

  return FALLBACK_COUNTRIES;
}

export async function seedModernWorld(): Promise<void> {
  console.log('[Seeder] Starting Modern World Seeding Script...');
  const countries = await fetchRestCountries();
  console.log(`[Seeder] Loaded ${countries.length} countries.`);

  const initialEntities: unknown[] = [];
  const initialRelations: unknown[] = [];

  for (const c of countries) {
    const eid = `country-${c.cca2.toLowerCase()}`;
    const popMillions = Math.max(1, Math.round(c.pop / 1000000));

    // Realistic economic metrics derived from population
    const gdp = Math.round(popMillions * (c.cca2 === 'US' ? 85 : c.cca2 === 'JP' || c.cca2 === 'DE' ? 50 : c.cca2 === 'BR' || c.cca2 === 'CN' ? 15 : 10) + 50);
    const treasury = Math.round(gdp * 0.12);
    const taxRate = 0.20;

    const energyOutput = Math.round(gdp * 0.02 + 50);
    const foodOutput = Math.round(popMillions * 2.5 + 40);
    const mineralsOutput = Math.round(popMillions * 1.5 + 30);
    const industrialOutput = Math.round(gdp * 0.025 + 30);

    const capitalProvId = `prov-${c.cca2.toLowerCase()}-1`;

    initialEntities.push({
      id: eid,
      name: c.name,
      entityType: 'country',
      position: { lat: c.lat, lng: c.lng },
      components: [
        {
          type: 'economy.indicator',
          gdp,
          inflationRate: 0.03,
          treasury,
          taxRate,
        },
        {
          type: 'economy.production',
          energyOutput,
          foodOutput,
          mineralsOutput,
          industrialOutput,
        },
        {
          type: 'politics.stability',
          stabilityIndex: 0.75,
          approvalRating: 0.55,
          militaryLoyalty: 0.90,
        },
        {
          type: 'geo.province',
          provinces: [
            {
              provinceId: capitalProvId,
              provinceName: `${c.name} Capital Region`,
              lat: c.lat,
              lng: c.lng,
              neighborIds: [],
              resourceRich: popMillions > 50,
              ownerId: eid,
            },
          ],
        },
      ],
    });
  }

  // Major bilateral diplomatic matrix
  const keyRelations = [
    { src: 'country-us', tgt: 'country-br', affinity: 0.65, tension: 0.15 },
    { src: 'country-us', tgt: 'country-cn', affinity: -0.45, tension: 0.65 },
    { src: 'country-us', tgt: 'country-ru', affinity: -0.85, tension: 0.85 },
    { src: 'country-ru', tgt: 'country-ua', affinity: -0.95, tension: 0.95 },
    { src: 'country-us', tgt: 'country-gb', affinity: 0.90, tension: 0.05 },
    { src: 'country-us', tgt: 'country-fr', affinity: 0.85, tension: 0.10 },
    { src: 'country-us', tgt: 'country-de', affinity: 0.88, tension: 0.08 },
    { src: 'country-us', tgt: 'country-jp', affinity: 0.90, tension: 0.05 },
    { src: 'country-cn', tgt: 'country-ru', affinity: 0.65, tension: 0.20 },
    { src: 'country-br', tgt: 'country-ar', affinity: 0.75, tension: 0.10 },
    { src: 'country-us', tgt: 'country-il', affinity: 0.92, tension: 0.05 },
    { src: 'country-us', tgt: 'country-sa', affinity: 0.70, tension: 0.20 },
  ];

  for (const r of keyRelations) {
    initialRelations.push({
      sourceEntityId: r.src,
      targetEntityId: r.tgt,
      affinity: r.affinity,
      tension: r.tension,
      recognition: 'full',
    });
  }

  const seedPayload = {
    scenarioId: 'world-seed-2026',
    startDate: '2026-07-24',
    description: 'GeoPolis 2026 Contemporary World Seed generated dynamically from real-world data.',
    initialEntities,
    initialRelations,
  };

  const dataDir = resolve(PROJECT_ROOT, 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const outputPath = resolve(dataDir, 'world-seed-2026.json');
  writeFileSync(outputPath, JSON.stringify(seedPayload, null, 2), 'utf-8');
  console.log(`[Seeder] Successfully generated ${outputPath} with ${initialEntities.length} sovereign nations!`);
}

// Run if called directly via CLI
if (process.argv[1] && process.argv[1].includes('seed-modern-world')) {
  seedModernWorld().catch((err) => {
    console.error('[Seeder] Fatal error:', err);
    process.exit(1);
  });
}
