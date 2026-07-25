import { readdirSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const srcDir = join(root, 'node_modules', 'flag-icons', 'flags', '4x3');
const destDir = join(root, 'public', 'assets', 'flags');

if (!existsSync(srcDir)) {
  console.error('flag-icons source not found at', srcDir);
  process.exit(1);
}

if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true });
}

const files = readdirSync(srcDir).filter(f => f.endsWith('.svg'));
let copied = 0;
for (const file of files) {
  copyFileSync(join(srcDir, file), join(destDir, file));
  copied++;
}

console.log(`Copied ${copied} flag SVGs to ${destDir}`);
