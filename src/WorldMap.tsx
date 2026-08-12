// WorldMap — HTML5 Canvas tactical map. Renders world-atlas TopoJSON with
// geoEqualEarth, highlights hover/selection, draws a marker dot for nations
// that have no 110m geometry, overlays military unit markers (with
// hit-detection), and supports a "Tension" map mode that recolors every
// country by its diplomatic tension with the selected nation.

import { geoEqualEarth, geoPath } from "d3-geo";
import type { GeoPermissibleObjects } from "d3-geo";
import { feature } from "topojson-client";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ConflictZone,
  Country,
  IntelLevel,
  Unit,
  UnitType,
  WorldSeed,
} from "./shared/types.js";
import { gameSocket } from "./gameSocket.js";
import { selection } from "./selectionManager.js";
import { round2 } from "./briefing/format.js";

const TOPO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const CLUSTER_RADIUS_DEG = 8; // 8° lat/lng grouping radius
const TRAJECTORY_DURATION_MS = 8000; // dashed lines persist for 8s

type CountryFeature = {
  type: "Feature";
  id: string;
  properties: { name: string };
  geometry: GeoJSON.Geometry;
};

const sphere: GeoPermissibleObjects = { type: "Sphere" } as GeoPermissibleObjects;

export function WorldMap({
  seed,
  onCountryPicked,
}: {
  seed: WorldSeed;
  onCountryPicked?: (c: Country) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [features, setFeatures] = useState<CountryFeature[]>([]);
  const [size, setSize] = useState({ w: 800, h: 400 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [tensionMode, setTensionMode] = useState(false);
  const [intelMode, setIntelMode] = useState(false);
  const [tradeMode, setTradeMode] = useState(false);
  const [trajectories, setTrajectories] = useState<Trajectory[]>([]);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; country: Country } | null>(null);

  const selectedRef = useRef<Country | null>(null);

  // player's intel level per foreign country (0-100)
  const intelRef = useRef<Map<string, IntelLevel>>(new Map());
  // currently selected country's intel level, for conflict marker gating
  const selectedIntelRef = useRef<IntelLevel>(0);

  // trajectory lines: dashed teal lines that fade after 8 seconds
  interface Trajectory {
    id: string;
    from: [number, number];
    to: [number, number];
    createdAt: number;
  }

  // lookups
  const byNumeric = useRef<Map<string, Country>>(new Map());
  const byAlpha3 = useRef<Map<string, Country>>(new Map());
  useEffect(() => {
    const num = new Map<string, Country>();
    const a3 = new Map<string, Country>();
    for (const c of seed.countries) {
      num.set(c.numericCode, c);
      a3.set(c.id, c);
    }
    byNumeric.current = num;
    byAlpha3.current = a3;
  }, [seed]);

  // selection subscription
  useEffect(() => {
    return selection.subscribe((sel) => {
      selectedRef.current = sel?.kind === "country" ? sel.country : null;
      selectedIntelRef.current =
        sel?.kind === "country" ? (intelRef.current.get(sel.country.id) ?? 0) : 0;
      requestAnimationFrame(draw);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // unit roster subscription + trajectory event listener
  useEffect(() => {
    const unsubUnits = gameSocket.onUnits(setUnits);
    const unsubEvents = gameSocket.onEvent((evt) => {
      if (evt.type === "war.unit-destroyed" || evt.type === "war.combat-resolved") return;
    });
    return () => {
      unsubUnits();
      unsubEvents();
    };
  }, []);

  // intel tracking: listen for intel.gathered events and update the map
  useEffect(() => {
    return gameSocket.onEvent((evt) => {
      if (evt.type === "intel.gathered") {
        intelRef.current.set(evt.target, evt.intelLevel);
        if (selectedRef.current?.id === evt.target) selectedIntelRef.current = evt.intelLevel;
      }
    });
  }, []);

  // load topojson
  useEffect(() => {
    let cancelled = false;
    fetch(TOPO_URL)
      .then((r) => r.json())
      .then((topo) => {
        if (cancelled) return;
        const fc = feature(topo, topo.objects.countries) as unknown as {
          features: CountryFeature[];
        };
        setFeatures(fc.features);
      })
      .catch((err) => console.error("[map] topojson load failed", err));
    return () => {
      cancelled = true;
    };
  }, []);

  // responsive size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cr = e.contentRect;
        setSize({ w: Math.max(200, cr.width), h: Math.max(150, cr.height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // trade routes: pairs of allied nations (tension < 15) with reciprocal affinity > 60
  const tradeRoutes = useMemo(() => {
    if (!tradeMode) return [];
    const routes: Array<{ from: [number, number]; to: [number, number]; affinity: number }> = [];
    const seen = new Set<string>();
    for (const c of seed.countries) {
      for (const r of c.relationships) {
        if (r.tension < 15 && r.affinity > 60) {
          const target = byAlpha3.current.get(r.countryCode);
          if (!target) continue;
          const key = [c.id, r.countryCode].sort().join("-");
          if (seen.has(key)) continue;
          seen.add(key);
          routes.push({ from: c.latlng, to: target.latlng, affinity: r.affinity });
        }
      }
    }
    return routes;
  }, [tradeMode, seed]);
  const tensionMap = useMemo(() => {
    const m = new Map<string, number>();
    if (!tensionMode || !selectedRef.current) return m;
    const sel = selectedRef.current;
    for (const r of sel.relationships) m.set(r.countryCode, r.tension);
    // also surface reverse direction if modelled on the other side
    for (const c of seed.countries) {
      if (c.id === sel.id) continue;
      if (m.has(c.id)) continue;
      const reverse = c.relationships.find((r) => r.countryCode === sel.id);
      if (reverse) m.set(c.id, reverse.tension);
    }
    return m;
  }, [tensionMode, seed]);

  const proj = () => geoEqualEarth().fitSize([size.w, size.h], sphere);

  // cache projected unit coordinates to avoid reprojecting every unit on every mousemove
  const projectedUnits = useMemo(() => {
    const projection = geoEqualEarth().fitSize([size.w, size.h], sphere);
    return units.map(u => ({ unit: u, xy: projection(u.latlng) }));
  }, [units, size.w, size.h]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = size;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = "#0a0f14";
    ctx.fillRect(0, 0, w, h);

    const projection = proj();
    const path = geoPath(projection, ctx);

    // sphere
    ctx.beginPath();
    path(sphere);
    ctx.fillStyle = "#0d141b";
    ctx.fill();
    ctx.strokeStyle = "#1c2a36";
    ctx.lineWidth = 1;
    ctx.stroke();

    const hovered = hoveredId;
    const selected = selectedRef.current;
    const selectedNum = selected?.numericCode ?? null;

    const renderedIds = new Set<string>();
    for (const f of features) {
      const num = f.id;
      renderedIds.add(num);
      const isHover = num === hovered;
      const isSel = num === selectedNum;
      const owner = byNumeric.current.get(num);
      const tension = tensionMode && owner ? tensionMap.get(owner.id) : undefined;
      ctx.beginPath();
      path(f as unknown as GeoPermissibleObjects);
      ctx.fillStyle = tensionColor(isSel, isHover, tension);
      ctx.fill();
      ctx.strokeStyle = isSel ? "#4ae3c4" : isHover ? "#4ae3c4" : "#27465a";
      ctx.lineWidth = isSel ? 1.8 : isHover ? 1.2 : 0.5;
      ctx.stroke();
    }

    // marker dot for a selected nation that has no geometry at this resolution
    if (selected && !renderedIds.has(selected.numericCode)) {
      const xy = projection(selected.latlng);
      if (xy) {
        ctx.beginPath();
        ctx.arc(xy[0], xy[1], 6, 0, Math.PI * 2);
        ctx.fillStyle = "#4ae3c4";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(xy[0], xy[1], 11, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(74,227,196,0.5)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // trade route vectors
    if (tradeMode) {
      for (const route of tradeRoutes) {
        const fromXY = projection(route.from);
        const toXY = projection(route.to);
        if (!fromXY || !toXY) continue;
        drawTradeRoute(ctx, fromXY[0], fromXY[1], toXY[0], toXY[1], route.affinity);
      }
    }

    // military unit layer — ONLY active conflict zones are drawn.
    // Peaceful/neutral units are never rendered on the map canvas.
    const zones = clusterConflictZones(units, CLUSTER_RADIUS_DEG);
    for (const zone of zones) {
      if (zone.hostility < 70) continue; // only active combat
      const xy = projection(zone.centroid);
      if (!xy) continue;
      drawConflictMarker(ctx, xy[0], xy[1], zone, intelMode, selectedIntelRef.current);
    }

    // trajectory lines (dashed teal, persist 8s)
    const now = Date.now();
    for (const t of trajectories) {
      const age = now - t.createdAt;
      if (age > TRAJECTORY_DURATION_MS) continue;
      const alpha = 1 - age / TRAJECTORY_DURATION_MS;
      const fromXY = projection(t.from);
      const toXY = projection(t.to);
      if (!fromXY || !toXY) continue;
      drawTrajectory(ctx, fromXY[0], fromXY[1], toXY[0], toXY[1], alpha);
    }
  };

  // redraw on any input change
  useEffect(() => {
    draw();
    // prune expired trajectories every second
    const timer = setInterval(() => {
      setTrajectories((prev) => {
        const now = Date.now();
        const kept = prev.filter((t) => now - t.createdAt < TRAJECTORY_DURATION_MS);
        return kept.length === prev.length ? prev : kept;
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    features,
    size,
    hoveredId,
    units,
    tensionMode,
    intelMode,
    tradeMode,
    tensionMap,
    trajectories,
    tradeRoutes,
  ]);

  // pointer handling — hover + hit detection (country polygons then units)
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // units take hover priority so they feel clickable
    const hoveredUnit = hitUnit(mx, my);
    if (hoveredUnit) {
      setHoveredId(null);
      canvas.style.cursor = "pointer";
      return;
    }
    if (features.length === 0) return;
    const projection = proj();
    const pathGen = geoPath(projection);
    let foundId: string | null = null;
    for (const f of features) {
      if (pointInFeature(pathGen, f, mx, my)) {
        foundId = f.id;
        break;
      }
    }
    setHoveredId((prev) => (prev === foundId ? prev : foundId));
    canvas.style.cursor = foundId ? "pointer" : "default";
    // Update tooltip for hovered country
    if (foundId) {
      const country = byNumeric.current.get(foundId);
      if (country) {
        setTooltip({ x: mx, y: my, country });
      } else {
        setTooltip(null);
      }
    } else {
      setTooltip(null);
    }
  };

  const hitUnit = (mx: number, my: number): Unit | null => {
    for (const { unit, xy } of projectedUnits) {
      if (!xy) continue;
      const dx = mx - xy[0];
      const dy = my - xy[1];
      if (dx * dx + dy * dy <= 9 * 9) return unit;
    }
    return null;
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // unit first
    const u = hitUnit(mx, my);
    if (u) {
      selection.selectUnit(u);
      return;
    }
    if (hoveredId == null) return;
    const country = byNumeric.current.get(hoveredId);
    if (onCountryPicked && country) {
      onCountryPicked(country);
      return;
    }
    selection.selectCountry(country ?? null);
  };

  const handleLeave = () => {
    setHoveredId(null);
    setTooltip(null);
  };

  return (
    <div ref={containerRef} className="map-container">
      <div className="map-controls">
        <button
          className={tensionMode ? "chip chip-warn active" : "chip"}
          onClick={() => setTensionMode((m) => !m)}
          title="Recolor nations by diplomatic tension vs your selection"
        >
          Map Mode: Tension {tensionMode ? "ON" : "OFF"}
        </button>
        <button
          className={intelMode ? "chip chip-intel active" : "chip"}
          onClick={() => setIntelMode((m) => !m)}
          title="Cluster military units into conflict zones with fog-of-war intel gating"
        >
          Map Mode: Fog of War {intelMode ? "ON" : "OFF"}
        </button>
        <button
          className={tradeMode ? "chip chip-trade active" : "chip"}
          onClick={() => setTradeMode((m) => !m)}
          title="Show trade route vectors between allied nations"
        >
          Map Mode: Trade Routes {tradeMode ? "ON" : "OFF"}
        </button>
      </div>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMouseLeave={handleLeave}
      />
      {features.length === 0 && <div className="map-loading">Loading world map…</div>}
      {tooltip && (
        <div className="map-tooltip" style={{ left: tooltip.x + 16, top: tooltip.y + 16 }}>
          <div className="map-tooltip-name">{tooltip.country.name}</div>
          <div className="map-tooltip-row">
            <span>GDP Growth</span>
            <span>{round2(tooltip.country.economy?.stability ?? 0)}%</span>
          </div>
          <div className="map-tooltip-row">
            <span>Tension</span>
            <span>
              {round2(
                tooltip.country.relationships?.length > 0
                  ? Math.max(...tooltip.country.relationships.map((r) => r.tension))
                  : 0,
              )}
            </span>
          </div>
          <div className="map-tooltip-row">
            <span>Readiness</span>
            <span>{round2(tooltip.country.military?.readiness ?? 0)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- helpers ---------------------------------------------------------------

// ---- Conflict zone clustering + fog of war ----

/** Group units within an 8° lat/lng radius into hexagonal conflict zones. */
function clusterConflictZones(units: Unit[], radiusDeg: number): ConflictZone[] {
  if (units.length === 0) return [];

  const cellSize = radiusDeg;
  const grid = new Map<string, number[]>();

  for (let i = 0; i < units.length; i++) {
    const unit = units[i]!;
    const latIdx = Math.floor(unit.latlng[0] / cellSize);
    const lngIdx = Math.floor(unit.latlng[1] / cellSize);
    const key = `${latIdx},${lngIdx}`;

    let cell = grid.get(key);
    if (!cell) {
      cell = [];
      grid.set(key, cell);
    }
    cell.push(i);
  }

  const visited = new Set<number>();
  const zones: ConflictZone[] = [];

  for (let i = 0; i < units.length; i++) {
    if (visited.has(i)) continue;

    const rootUnit = units[i]!;
    const cluster = [rootUnit];
    visited.add(i);

    const latIdx = Math.floor(rootUnit.latlng[0] / cellSize);
    const lngIdx = Math.floor(rootUnit.latlng[1] / cellSize);

    for (let dLatIdx = -1; dLatIdx <= 1; dLatIdx++) {
      for (let dLngIdx = -1; dLngIdx <= 1; dLngIdx++) {
        const key = `${latIdx + dLatIdx},${lngIdx + dLngIdx}`;
        const cellUnitIndices = grid.get(key);

        if (cellUnitIndices) {
          for (let k = 0; k < cellUnitIndices.length; k++) {
            const j = cellUnitIndices[k]!;
            if (visited.has(j)) continue;

            const unit = units[j]!;
            const dLat = Math.abs(rootUnit.latlng[0] - unit.latlng[0]);
            const dLng = Math.abs(rootUnit.latlng[1] - unit.latlng[1]);

            if (dLat <= radiusDeg && dLng <= radiusDeg) {
              cluster.push(unit);
              visited.add(j);
            }
          }
        }
      }
    }
    const lat = cluster.reduce((s, u) => s + u.latlng[0], 0) / cluster.length;
    const lng = cluster.reduce((s, u) => s + u.latlng[1], 0) / cluster.length;
    const ownerSet = new Set(cluster.map((u) => u.ownerCode));
    const typeCounts = new Map<string, number>();
    for (const u of cluster) typeCounts.set(u.type, (typeCounts.get(u.type) ?? 0) + 1);
    const dominantType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0]![0] as UnitType;
    // hostility: if multiple owners present, higher; scale by unit count
    const hostility =
      ownerSet.size > 1
        ? Math.min(100, 50 + cluster.length * 10)
        : Math.min(50, cluster.length * 5);
    zones.push({
      id: `zone-${i}`,
      centroid: [lat, lng],
      unitCount: cluster.length,
      ownerCodes: [...ownerSet],
      dominantType,
      hostility,
      units: cluster,
    });
  }
  return zones;
}

/** Draw a clean conflict marker (⚔️) for active war zones.
 *  Only called when hostility >= 70 (active combat). */
function drawConflictMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zone: ConflictZone,
  fogMode: boolean,
  intel: IntelLevel,
): void {
  const r = 14;
  ctx.save();
  // pulsing red glow for active combat
  ctx.fillStyle = "rgba(192, 57, 43, 0.25)";
  ctx.beginPath();
  ctx.arc(x, y, r + 6, 0, Math.PI * 2);
  ctx.fill();
  // solid red disc
  ctx.fillStyle = "#c0392b";
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // crossed swords glyph
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "16px var(--mono)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("\u2694", x, y + 1);
  // unit count badge if multiple units
  if (zone.unitCount > 1) {
    ctx.fillStyle = "#c0392b";
    ctx.beginPath();
    ctx.arc(x + r - 2, y - r + 2, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 9px var(--mono)";
    ctx.fillText(String(zone.unitCount), x + r - 2, y - r + 2);
  }
  // owner codes: show when fog off, or when intel >= 31 in fog mode
  if (!fogMode || intel >= 31) {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "9px var(--mono)";
    ctx.fillText(zone.ownerCodes.join(" vs "), x, y + r + 12);
  }
  ctx.restore();
}

/** Draw a dashed teal trajectory line with arrowhead, fading over time. */
function drawTrajectory(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  alpha: number,
): void {
  ctx.save();
  ctx.strokeStyle = `rgba(26, 188, 156, ${alpha})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  // arrowhead
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const ah = 8;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ah * Math.cos(angle - Math.PI / 6), y2 - ah * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - ah * Math.cos(angle + Math.PI / 6), y2 - ah * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fillStyle = `rgba(26, 188, 156, ${alpha})`;
  ctx.fill();
  ctx.restore();
}

/** Draw a solid green trade route line with arrowhead, opacity scaled by affinity. */
function drawTradeRoute(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  affinity: number,
): void {
  ctx.save();
  const alpha = 0.2 + (affinity / 100) * 0.4;
  ctx.strokeStyle = `rgba(46, 204, 113, ${alpha})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  // arrowhead
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const ah = 6;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ah * Math.cos(angle - Math.PI / 6), y2 - ah * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - ah * Math.cos(angle + Math.PI / 6), y2 - ah * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fillStyle = `rgba(46, 204, 113, ${alpha})`;
  ctx.fill();
  ctx.restore();
}

function tensionColor(isSel: boolean, isHover: boolean, tension: number | undefined): string {
  if (isSel) return "#1b6f6a";
  if (isHover) return "#234d63";
  if (tension === undefined) return "#16242f"; // neutral / no relationship
  if (tension >= 70) return "#5c1a1a"; // deep red — at war
  if (tension >= 45) return "#7a3a2a";
  if (tension >= 25) return "#2a3a4a";
  if (tension <= 15) return "#1a4a2a"; // green — allied
  return "#16242f";
}

// hit-testing via offscreen canvas
let hitCtx: CanvasRenderingContext2D | null = null;
function getHitCtx(): CanvasRenderingContext2D | null {
  if (!hitCtx) hitCtx = document.createElement("canvas").getContext("2d");
  return hitCtx;
}

function pointInFeature(
  pathGen: ReturnType<typeof geoPath>,
  f: CountryFeature,
  x: number,
  y: number,
): boolean {
  const d = pathGen(f as unknown as GeoPermissibleObjects);
  if (!d) return false;
  const ctx = getHitCtx();
  if (!ctx) return false;
  const p = new Path2D(d);
  return ctx.isPointInPath(p, x, y);
}
