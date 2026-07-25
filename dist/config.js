import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
function parseArgv() {
    const args = {};
    for (let i = 2; i < process.argv.length; i++) {
        const arg = process.argv[i];
        if (!arg.startsWith('--'))
            continue;
        const eqIdx = arg.indexOf('=');
        if (eqIdx !== -1) {
            args[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
        }
        else if (i + 1 < process.argv.length && !process.argv[i + 1].startsWith('--')) {
            args[arg.slice(2)] = process.argv[++i];
        }
        else {
            args[arg.slice(2)] = 'true';
        }
    }
    return args;
}
export function loadConfig(overrides) {
    const args = parseArgv();
    const env = process.env;
    return {
        mode: (overrides?.mode ?? args['mode'] ?? env['GEOPOLIS_MODE'] ?? 'headless'),
        host: overrides?.host ?? args['host'] ?? env['GEOPOLIS_HOST'] ?? '0.0.0.0',
        port: overrides?.port ?? Number(args['port'] ?? env['GEOPOLIS_PORT'] ?? '3000'),
        seedPath: overrides?.seedPath ?? args['seed'] ?? env['GEOPOLIS_SEED'] ?? resolve(PROJECT_ROOT, 'data', 'world-seed-2026.json'),
        headlessTicks: overrides?.headlessTicks ?? Number(args['ticks'] ?? env['GEOPOLIS_TICKS'] ?? '10'),
        scenarioPath: overrides?.scenarioPath ?? args['scenario'] ?? env['GEOPOLIS_SCENARIO'] ?? undefined,
    };
}
export function loadSeedFromFile(path) {
    if (!existsSync(path)) {
        throw new Error(`Seed file not found: ${path}`);
    }
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw);
}
//# sourceMappingURL=config.js.map