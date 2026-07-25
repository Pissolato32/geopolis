/**
 * @module domain
 * @description Barrel export for all GeoPolis domain components, events, and systems.
 */

// Economy Domain
export * from './economy/components/economy.components.js';
export * from './economy/events/economy.events.js';
export * from './economy.js';

// Politics Domain
export * from './politics/components/politics.components.js';
export * from './politics/events/politics.events.js';
export * from './politics.js';

// Diplomacy Domain
export * from './diplomacy/components/relation.component.js';
export * from './diplomacy/events/diplomacy.events.js';
export * from './diplomacy.js';

// War Domain
export * from './war/components/war.components.js';
export * from './war/events/war.events.js';
export * from './war.js';

// Intelligence Domain
export * from './intelligence/components/intelligence.components.js';
export * from './intelligence/events/intelligence.events.js';
export * from './intelligence.js';

// Seed Loader & BYOD Prompt Generator
export { loadWorldSeed } from './seed/seed-loader.js';
export { SeedPromptGenerator } from './seed/prompt-generator.js';
