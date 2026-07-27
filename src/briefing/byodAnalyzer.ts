// BYOD Directive Analyzer — parses freeform strategic directive text and
// generates structured option cards with predicted impacts and intent
// payloads. Uses keyword heuristics to map natural language to game
// mechanics (set-tax, adjust-tariffs, set-readiness, impose-sanction,
// propose-trade, conduct-recon).

import type { AnalysisSnapshot, DirectiveAnalysisResult, DirectiveImpact, DirectiveOption } from "./byodTypes.js";
import type { StrictIntent } from "../shared/types.js";
import { round2 } from "./format.js";

const KEYWORD_MAP: Array<{
  pattern: RegExp;
  intentType: string;
  label: string;
}> = [
  { pattern: /tarif|custom|import.*(barrier|tax|restrict)/i, intentType: "adjust-tariffs", label: "Tariff Adjustment" },
  { pattern: /sanction|embargo|blockade|restrict.*(trade|economy)/i, intentType: "impose-sanction", label: "Economic Sanction" },
  { pattern: /trade.*(deal|agree|pact|boost|improve)|free.?trade|commerce/i, intentType: "propose-trade", label: "Trade Agreement" },
  { pattern: /recon|spy|intel|surveill|infiltrat|gather.*(info|intel)/i, intentType: "conduct-recon", label: "Reconnaissance Op" },
  { pattern: /tax|revenu|fiscal/i, intentType: "set-tax", label: "Tax Policy" },
  { pattern: /readiness|alert|defcon|mobil|prepared|deploy/i, intentType: "set-readiness", label: "Military Readiness" },
];

function detectIntentTypes(text: string): string[] {
  const found: string[] = [];
  for (const { pattern, intentType: _it } of KEYWORD_MAP) {
    if (pattern.test(text) && !found.includes(_it)) {
      found.push(_it);
    }
  }
  if (found.length === 0) found.push("set-tax");
  return found;
}

function detectTarget(text: string, snapshot: AnalysisSnapshot): string | undefined {
  for (const c of snapshot.countries) {
    if (c.id === snapshot.playerCode) continue;
    const nameLower = c.name.toLowerCase();
    if (text.toLowerCase().includes(nameLower)) return c.id;
    if (text.toUpperCase().includes(c.id)) return c.id;
  }
  return undefined;
}

function buildImpacts(
  tensionDelta: number,
  popularityDelta: number,
  gdpDelta: number,
): DirectiveImpact[] {
  const impacts: DirectiveImpact[] = [];
  if (tensionDelta !== 0) {
    impacts.push({ label: "Tension", value: round2(tensionDelta), suffix: "", direction: tensionDelta >= 0 ? "up" : "down" });
  }
  if (popularityDelta !== 0) {
    impacts.push({ label: "Popularity", value: round2(popularityDelta), suffix: "%", direction: popularityDelta >= 0 ? "up" : "down" });
  }
  if (gdpDelta !== 0) {
    impacts.push({ label: "GDP", value: round2(gdpDelta), suffix: "%", direction: gdpDelta >= 0 ? "up" : "down" });
  }
  return impacts;
}

function buildOption(
  id: string,
  title: string,
  description: string,
  intent: StrictIntent,
  tensionDelta: number,
  popularityDelta: number,
  gdpDelta: number,
): DirectiveOption {
  return {
    id,
    title,
    description,
    impacts: buildImpacts(tensionDelta, popularityDelta, gdpDelta),
    intent,
  };
}

function generateOptions(
  text: string,
  intentTypes: string[],
  snapshot: AnalysisSnapshot,
): DirectiveOption[] {
  const player = snapshot.countries.find((c) => c.id === snapshot.playerCode);
  if (!player) return [];
  const target = detectTarget(text, snapshot);
  const hasTarget = !!target;
  const aggressive = /secret|covert|sabotag|undermin|destabili/i.test(text);
  const options: DirectiveOption[] = [];

  for (const intentType of intentTypes) {
    if (intentType === "set-tax") {
      const isCut = /cut|reduc|lower|slash/i.test(text);
      const rate = isCut ? Math.max(0.05, round2(player.gdpGrowth > 2 ? 0.15 : 0.18)) : 0.25;
      const gdpDelta = isCut ? 0.3 : -0.2;
      const popDelta = isCut ? 4.0 : -3.0;
      const intent: StrictIntent = { intent: "set-tax", from: snapshot.playerCode, rate };
      options.push(
        buildOption(
          `byod-${options.length + 1}`,
          isCut ? "Tax Reduction Stimulus" : "Fiscal Consolidation",
          isCut
            ? "Lower the income tax rate to stimulate consumer spending and boost approval."
            : "Raise the tax rate to shore up treasury reserves at the cost of short-term growth.",
          intent,
          0,
          popDelta,
          gdpDelta,
        ),
      );
    }

    if (intentType === "adjust-tariffs" && hasTarget && target) {
      const isProtective = /protect|barrier|restrict|punish/i.test(text);
      const rate = isProtective ? 0.25 : 0.05;
      const gdpDelta = isProtective ? -0.2 : 0.15;
      const tensionDelta = isProtective ? 0.15 : -0.05;
      const intent: StrictIntent = { intent: "adjust-tariffs", from: snapshot.playerCode, target, rate };
      options.push(
        buildOption(
          `byod-${options.length + 1}`,
          isProtective ? `Protective Tariffs on ${target}` : `Tariff Reduction with ${target}`,
          isProtective
            ? `Impose steep tariffs on ${target} imports to shield domestic industry, risking retaliation.`
            : `Lower tariffs with ${target} to boost bilateral trade and ease tensions.`,
          intent,
          tensionDelta,
          isProtective ? 1.5 : 0.5,
          gdpDelta,
        ),
      );
    }

    if (intentType === "set-readiness") {
      const isSurge = /surge|maximum|high|alert|elevat/i.test(text);
      const level = isSurge ? 90 : 50;
      const intent: StrictIntent = { intent: "set-readiness", from: snapshot.playerCode, level };
      options.push(
        buildOption(
          `byod-${options.length + 1}`,
          isSurge ? "Maximum Readiness Surge" : "Standing Readiness Adjustment",
          isSurge
            ? "Elevate all military branches to maximum readiness. Projects strength but strains morale."
            : "Adjust military readiness to a balanced standing level.",
          intent,
          isSurge ? 0.1 : 0,
          isSurge ? -2.0 : 0,
          isSurge ? -0.1 : 0,
        ),
      );
    }

    if (intentType === "impose-sanction" && hasTarget && target) {
      const kind = /milit/i.test(text) ? "military" : /diplomat/i.test(text) ? "diplomatic" : "economic";
      const intent: StrictIntent = { intent: "impose-sanction", from: snapshot.playerCode, target, kind };
      options.push(
        buildOption(
          `byod-${options.length + 1}`,
          `${kind.charAt(0).toUpperCase() + kind.slice(1)} Sanctions on ${target}`,
          `Impose ${kind} sanctions against ${target}. ${aggressive ? "Covert execution minimizes diplomatic blowback." : "Public enforcement signals resolve."}`,
          intent,
          aggressive ? 0.2 : 0.35,
          aggressive ? 1.0 : -1.0,
          -0.25,
        ),
      );
    }

    if (intentType === "propose-trade" && hasTarget && target) {
      const intent: StrictIntent = { intent: "propose-trade", from: snapshot.playerCode, target };
      options.push(
        buildOption(
          `byod-${options.length + 1}`,
          `Trade Pact with ${target}`,
          `Negotiate a bilateral trade agreement with ${target} to boost GDP and reduce tensions.`,
          intent,
          -0.15,
          2.0,
          0.3,
        ),
      );
    }

    if (intentType === "conduct-recon" && hasTarget && target) {
      const cost = aggressive ? 500 : 200;
      const intent: StrictIntent = { intent: "conduct-recon", from: snapshot.playerCode, target, cost };
      options.push(
        buildOption(
          `byod-${options.length + 1}`,
          `Reconnaissance on ${target}`,
          `Deploy intelligence assets to gather data on ${target}'s military and economic posture.`,
          intent,
          0.05,
          0,
          -0.05,
        ),
      );
    }
  }

  if (options.length === 0) {
    const intent: StrictIntent = { intent: "set-tax", from: snapshot.playerCode, rate: 0.21 };
    options.push(
      buildOption(
        "byod-fallback",
        "Maintain Current Fiscal Stance",
        "No specific directive detected. Keep the tax rate at the default level.",
        intent,
        0,
        0,
        0,
      ),
    );
  }

  return options;
}

export function analyzeDirective(text: string, snapshot: AnalysisSnapshot): DirectiveAnalysisResult {
  const intentTypes = detectIntentTypes(text);
  const options = generateOptions(text, intentTypes, snapshot);
  const summary = `Analyzed directive: "${text.slice(0, 80)}${text.length > 80 ? "…" : ""}" — generated ${options.length} strategic option(s).`;
  return { options, summary };
}
