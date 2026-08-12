import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const failures = [];

const required = [
  "src/components/ui/Button.tsx",
  "src/components/ui/Button.module.css",
  "src/components/ui/Card.tsx",
  "src/components/ui/Card.module.css",
  "src/components/ui/Badge.tsx",
  "src/components/ui/Tabs.tsx",
  "src/components/ui/Metric.tsx",
  "src/components/layout/MainLayout.tsx",
  "src/components/layout/CommandBar.tsx",
  "src/styles/variables.css",
  "src/styles/globals.css",
];

for (const file of required) {
  if (!existsSync(join(root, file))) failures.push(`Missing required UI architecture file: ${file}`);
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

// Only additions in the current PR are checked for Unicode-as-icon regressions.
// Existing narrative/domain glyphs are allowed until they are intentionally migrated.
let addedLines = "";
try {
  addedLines = execSync("git diff --unified=0 origin/main...HEAD -- 'src/**/*.{ts,tsx}'", {
    encoding: "utf8",
  });
} catch {
  // Local invocation without origin/main: validate the working tree instead.
  addedLines = execSync("git diff --unified=0 -- 'src/**/*.{ts,tsx}'", { encoding: "utf8" });
}

const forbiddenIconPattern = /[↻↺🏆⚔◆]/u;
for (const line of addedLines.split("\n")) {
  if (line.startsWith("+") && !line.startsWith("+++ ") && forbiddenIconPattern.test(line)) {
    failures.push(`Unicode icon added in PR: ${line.slice(1).trim()}`);
  }
}

for (const dir of ["src/components/ui", "src/components/layout"]) {
  for (const file of walk(join(root, dir)).filter((path) => /\.(tsx?|jsx?)$/.test(path))) {
    const content = readFileSync(file, "utf8");
    if (/(?:from|import)\s+["'](?:\.\.\/)+(?:engine|domain|server|game)/.test(content)) {
      failures.push(`Presentation component imports domain/runtime code: ${file}`);
    }
  }
}

if (failures.length) {
  console.error("UI architecture validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("UI architecture validation passed.");
