import type { Unit } from "../shared/types.js";

export function makeUnit(id: string, ownerCode: string): Unit {
  return {
    id,
    name: id,
    ownerCode,
    type: "infantry",
    readiness: 60,
    morale: 60,
    latlng: [10, 10],
    strength: 1000,
  };
}
