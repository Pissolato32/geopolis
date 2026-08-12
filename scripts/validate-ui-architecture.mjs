import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];

const required = [
  "src/components/ui/Button.tsx",
  "src/components/ui/Button.module.css",
  "src/components/ui/Card.tsx",
  "src/components/ui/Card.module.css",
];

for (const file of required) {
  if (!existsSync(join(root, file))) failures.push(`Missing required UI primitive: ${file}`);
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir);
  return entries.flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const sourceFiles = walk(join(root, "src")).filter((file) => /\.(tsx?|jsx?)$/.test(file));
const forbiddenIconPattern = /[↻↺🏆⚔◆]/u;

for (const file of sourceFiles) {
  const content = readFileSync(file, "utf8");
  if (forbiddenIconPattern.test(content)) {
    failures.push(`Unicode icon detected in ${file}; use lucide-react instead.`);
  }
}

if (failures.length) {
  console.error("UI architecture validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("UI architecture validation passed.");
