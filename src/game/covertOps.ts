// Covert Operations System — manages stealth missions, success/exposure resolution,
// diplomatic incident generation, and per-tick advancement of active operations.

import type {
  Country,
  CovertOperation,
  CovertOpType,
  CovertOpsState,
  GameEvent,
} from "../shared/types.js";

/** Base parameters per operation type. */
interface OpTemplate {
  type: CovertOpType;
  name: string;
  description: string;
  baseSuccessChance: number;
  baseExposureRisk: number;
  baseCost: number;
  baseDuration: number;
}

export const OP_TEMPLATES: Record<CovertOpType, OpTemplate> = {
  cyber_sabotage: {
    type: "cyber_sabotage",
    name: "Cyber Sabotage",
    description: "Infiltrate the target's research networks to delay their technology progress.",
    baseSuccessChance: 0.55,
    baseExposureRisk: 0.35,
    baseCost: 50_000_000,
    baseDuration: 3,
  },
  political_subversion: {
    type: "political_subversion",
    name: "Political Subversion",
    description: "Fund opposition groups and destabilize the target government from within.",
    baseSuccessChance: 0.45,
    baseExposureRisk: 0.40,
    baseCost: 75_000_000,
    baseDuration: 4,
  },
  economic_sabotage: {
    type: "economic_sabotage",
    name: "Economic Sabotage",
    description: "Disrupt the target's financial infrastructure and drain treasury reserves.",
    baseSuccessChance: 0.50,
    baseExposureRisk: 0.30,
    baseCost: 100_000_000,
    baseDuration: 3,
  },
  troop_recon: {
    type: "troop_recon",
    name: "Troop Reconnaissance",
    description: "Deploy intelligence assets to reveal enemy troop positions and movements.",
    baseSuccessChance: 0.70,
    baseExposureRisk: 0.20,
    baseCost: 40_000_000,
    baseDuration: 2,
  },
};

let opCounter = 0;

export function generateOpId(): string {
  opCounter++;
  return `covert-${Date.now()}-${opCounter}`;
}

/** Initialize a fresh covert ops state for a country. */
export function createInitialCovertOpsState(countryId: string): CovertOpsState {
  return {
    countryId,
    activeOps: [],
    completedOps: [],
    exposedIncidents: [],
  };
}

/** Create a new covert operation with randomized success/exposure within bounds. */
export function createOperation(
  type: CovertOpType,
  sourceCountry: string,
  targetCountry: string,
  startTick: number,
): CovertOperation {
  const template = OP_TEMPLATES[type];
  const successChance = clamp(
    template.baseSuccessChance + (Math.random() - 0.5) * 0.15,
    0.30,
    0.85,
  );
  const exposureRisk = clamp(
    template.baseExposureRisk + (Math.random() - 0.5) * 0.10,
    0.15,
    0.60,
  );
  return {
    id: generateOpId(),
    type,
    sourceCountry,
    targetCountry,
    successChance,
    exposureRisk,
    costTreasury: template.baseCost,
    durationTicks: template.baseDuration,
    startTick,
    endTick: startTick + template.baseDuration,
    status: "active",
  };
}

/** Launch a covert operation. Returns updated state and events, or null if insufficient treasury. */
export function launchOperation(
  source: Country,
  type: CovertOpType,
  targetCountry: string,
  tick: number,
): { country: Country; events: GameEvent[] } | null {
  const op = createOperation(type, source.id, targetCountry, tick);
  if (source.economy.treasury < op.costTreasury) {
    return null;
  }

  const covertOps = source.covertOps ?? createInitialCovertOpsState(source.id);
  const events: GameEvent[] = [];

  const updatedCountry: Country = {
    ...source,
    economy: {
      ...source.economy,
      treasury: source.economy.treasury - op.costTreasury,
    },
    covertOps: {
      ...covertOps,
      activeOps: [...covertOps.activeOps, op],
    },
  };

  return { country: updatedCountry, events };
}

/** Abort an active covert operation. */
export function abortOperation(
  source: Country,
  opId: string,
): { country: Country; events: GameEvent[] } {
  if (!source.covertOps) return { country: source, events: [] };

  const op = source.covertOps.activeOps.find((o) => o.id === opId);
  if (!op) return { country: source, events: [] };

  const aborted: CovertOperation = { ...op, status: "aborted" };
  return {
    country: {
      ...source,
      covertOps: {
        ...source.covertOps,
        activeOps: source.covertOps.activeOps.filter((o) => o.id !== opId),
        completedOps: [...source.covertOps.completedOps, aborted],
      },
    },
    events: [],
  };
}

/** Resolve a covert operation — determine success and exposure. */
export function resolveOperation(op: CovertOperation): {
  succeeded: boolean;
  exposed: boolean;
  resolved: CovertOperation;
} {
  const successRoll = Math.random();
  const exposureRoll = Math.random();
  const succeeded = successRoll < op.successChance;
  const exposed = !succeeded && exposureRoll < op.exposureRisk;

  let status: CovertOperation["status"];
  if (succeeded) {
    status = "succeeded";
  } else if (exposed) {
    status = "exposed";
  } else {
    status = "failed";
  }

  return {
    succeeded,
    exposed,
    resolved: { ...op, status },
  };
}

/** Apply operation effects to the target country. */
export function applyOpEffects(
  target: Country,
  op: CovertOperation,
): { country: Country; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let updated = { ...target };

  switch (op.type) {
    case "cyber_sabotage": {
      if (target.research) {
                const updatedProgress: typeof target.research.progress = {};
        for (const [techId, prog] of Object.entries(target.research.progress)) {
          if (!prog.unlocked && prog.accumulatedPoints > 0) {
            updatedProgress[techId] = {
              ...prog,
              accumulatedPoints: Math.max(0, prog.accumulatedPoints - 15),
            };
          } else {
            updatedProgress[techId] = prog;
          }
        }
        updated = {
          ...updated,
          research: {
            ...target.research,
            progress: updatedProgress,
          },
        };
        events.push({
          type: "sabotage.executed",
          at: new Date().toISOString(),
          from: op.sourceCountry,
          target: op.targetCountry,
          stabilityHit: 0,
          readinessHit: 0,
          cost: op.costTreasury,
        } as never);
      }
      break;
    }
    case "political_subversion": {
      const stabilityDrop = 5 + Math.floor(Math.random() * 10);
      updated = {
        ...updated,
        economy: {
          ...updated.economy,
          stability: Math.max(0, updated.economy.stability - stabilityDrop),
        },
      };
      events.push({
          type: "sabotage.executed",
          at: new Date().toISOString(),
          from: op.sourceCountry,
          target: op.targetCountry,
          stabilityHit: stabilityDrop,
          readinessHit: 0,
          cost: op.costTreasury,
        } as never);
      break;
    }
    case "economic_sabotage": {
      const treasuryLoss = op.costTreasury * (1.5 + Math.random());
      updated = {
        ...updated,
        economy: {
          ...updated.economy,
          treasury: Math.max(0, updated.economy.treasury - treasuryLoss),
        },
      };
      events.push({
          type: "sabotage.executed",
          at: new Date().toISOString(),
          from: op.sourceCountry,
          target: op.targetCountry,
          stabilityHit: 0,
          readinessHit: 0,
          cost: treasuryLoss,
        } as never);
      break;
    }
    case "troop_recon": {
      events.push({
          type: "intel.gathered",
          at: new Date().toISOString(),
          player: op.sourceCountry,
          target: op.targetCountry,
          intelLevel: 75,
          cost: op.costTreasury,
        } as never);
      break;
    }
  }

  return { country: updated, events };
}

/** Generate diplomatic incident events for exposed operations. */
export function generateExposureIncidents(op: CovertOperation): GameEvent[] {
  return [
    {
      type: "sabotage.failed",
      at: new Date().toISOString(),
      from: op.sourceCountry,
      target: op.targetCountry,
      cost: op.costTreasury,
      reason: `ESPIONAGE EXPOSED: ${OP_TEMPLATES[op.type].name} against ${op.targetCountry}`,
    } as never,
  ];
}

/** Advance all active covert operations by one tick. Resolves completed ops. */
export function advanceCovertOps(
  countries: Country[],
  tick: number,
): { countries: Country[]; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const updated = [...countries];

  for (let i = 0; i < updated.length; i++) {
    const country = updated[i]!;
    if (!country.covertOps || country.covertOps.activeOps.length === 0) continue;

    const remainingActive: CovertOperation[] = [];
    const newlyCompleted: CovertOperation[] = [];
    const newlyExposed: CovertOperation[] = [];

    for (const op of country.covertOps.activeOps) {
      if (tick < op.endTick) {
        remainingActive.push(op);
        continue;
      }

      const { succeeded, exposed, resolved } = resolveOperation(op);
      newlyCompleted.push(resolved);

      if (succeeded) {
        const targetIdx = updated.findIndex((c) => c.id === op.targetCountry);
        if (targetIdx >= 0) {
          const result = applyOpEffects(updated[targetIdx]!, resolved);
          updated[targetIdx] = result.country;
          events.push(...result.events);
        }
      } else if (exposed) {
        newlyExposed.push(resolved);
        events.push(...generateExposureIncidents(resolved));

        // Massive affinity drop
        const targetIdx = updated.findIndex((c) => c.id === op.targetCountry);
        if (targetIdx >= 0) {
          const target = updated[targetIdx]!;
          const updatedRels = target.relationships.map((r) =>
            r.countryCode === op.sourceCountry
              ? { ...r, affinity: Math.max(-100, r.affinity - 40) }
              : r,
          );
          updated[targetIdx] = { ...target, relationships: updatedRels };
        }
      }
    }

    if (newlyCompleted.length > 0 || newlyExposed.length > 0) {
      updated[i] = {
        ...country,
        covertOps: {
          ...country.covertOps,
          activeOps: remainingActive,
          completedOps: [...country.covertOps.completedOps, ...newlyCompleted],
          exposedIncidents: [...country.covertOps.exposedIncidents, ...newlyExposed],
        },
      };
    }
  }

  return { countries: updated, events };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
