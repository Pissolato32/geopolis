import { describe, it, expect } from "vitest";
import { geoEqualEarth } from "d3-geo";

// A mock of the hitUnit environment
function createMockUnits(count: number) {
  const units = [] as {id: string, latlng: [number, number]}[];
  for (let i = 0; i < count; i++) {
    units.push({
      id: `u${i}`,
      latlng: [Math.random() * 360 - 180, Math.random() * 180 - 90],
    });
  }
  return units;
}

// We mock a d3 geo projection
function createMockProjection() {
  let callCount = 0;
  const d3Proj = geoEqualEarth().fitSize([800, 400], { type: "Sphere" } as any);
  const proj = (latlng: [number, number]) => {
    callCount++;
    return d3Proj(latlng);
  };
  return { proj, getCallCount: () => callCount };
}

describe("WorldMap hitUnit logic cache", () => {
  it("baseline vs optimized projection calls logic", () => {
    const units = createMockUnits(1000);
    const mockProj = createMockProjection();
    const projection = mockProj.proj;

    const hitUnitBaseline = (mx: number, my: number) => {
      for (const u of units) {
        const xy = projection(u.latlng);
        if (!xy) continue;
        const dx = mx - xy[0];
        const dy = my - xy[1];
        if (dx * dx + dy * dy <= 9 * 9) return u;
      }
      return null;
    };

    // Simulate 1000 mouse moves
    for (let i = 0; i < 1000; i++) {
      hitUnitBaseline(Math.random() * 800, Math.random() * 400);
    }
    const baselineCalls = mockProj.getCallCount();

    // Optimize approach: cache
    const cachedProjections = new Map<{id: string, latlng: [number, number]}, [number, number] | null>();
    const updateCache = () => {
      cachedProjections.clear();
      for (const u of units) {
         cachedProjections.set(u, projection(u.latlng));
      }
    };
    updateCache(); // cache once on projection or unit change

    const hitUnitOptimized = (mx: number, my: number) => {
      for (const u of units) {
        const xy = cachedProjections.get(u);
        if (!xy) continue;
        const dx = mx - xy[0];
        const dy = my - xy[1];
        if (dx * dx + dy * dy <= 9 * 9) return u;
      }
      return null;
    };

    for (let i = 0; i < 1000; i++) {
      hitUnitOptimized(Math.random() * 800, Math.random() * 400);
    }
    const optimizedCalls = mockProj.getCallCount() - baselineCalls;

    // The optimization is that instead of O(m * u) projection calls, we have O(u)
    expect(optimizedCalls).toBe(1000);
    expect(baselineCalls).toBeGreaterThan(1000);
  });

  it("behaves correctly on hits and misses", () => {
    const units = [{ id: "u0", latlng: [0, 0] as [number, number] }];
    const projection = geoEqualEarth().fitSize([800, 400], { type: "Sphere" } as any);
    const cachedProjections = [{ unit: units[0]!, xy: projection(units[0]!.latlng) }];

    const hitUnit = (mx: number, my: number) => {
      for (const { unit, xy } of cachedProjections) {
        if (!xy) continue;
        const dx = mx - xy[0];
        const dy = my - xy[1];
        if (dx * dx + dy * dy <= 9 * 9) return unit;
      }
      return null;
    };

    // hit check
    const xy = cachedProjections[0].xy!;
    expect(hitUnit(xy[0], xy[1])).toBe(units[0]);
    // radius test
    expect(hitUnit(xy[0] + 9, xy[1])).toBe(units[0]);
    expect(hitUnit(xy[0] + 10, xy[1])).toBeNull();
  });
});
