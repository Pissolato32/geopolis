// WorldMap — HTML5 Canvas tactical map. Renders world-atlas TopoJSON with
// geoEqualEarth, highlights hover/selection, draws a marker dot for nations
// that have no 110m geometry, overlays military unit markers (with
// hit-detection), and supports a "Tension" map mode that recolors every
// country by its diplomatic tension with the selected nation.

import { geoEqualEarth, geoPath } from "d3-geo";
import type { GeoPermissibleObjects } from "d3-geo";
import { feature } from "topojson-client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ConflictZone, Country, Unit, WorldSeed } from "./shared/types.js";
import { gameSocket } from "./gameSocket.js";
import { selection } from "./selectionManager.js";

const TOPO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

type CountryFeature = {
  type: "Feature";
  id: string;
  properties: { name: string };
  geometry: GeoJSON.Geometry;
};

const sphere: GeoPermissibleObjects = { type: "Sphere" } as GeoPermissibleObjects;

export function WorldMap({ seed }: { seed: WorldSeed }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [features, setFeatures] = useState<CountryFeature[]>([]);
  const [size, setSize] = useState({ w: 800, h: 400 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [zones, setZones] = useState<ConflictZone[]>([]);
  const [trajectory, setTrajectory] = useState<{ from: [number, number]; to: [number, number]; id: string } | null>(null);
  const [tensionMode, setTensionMode] = useState(false);

  const selectedRef = useRef<Country | null>(null);
  const selectedUnitRef = useRef<Unit | null>(null);
  const hoveredZoneRef = useRef<ConflictZone | null>(null);

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
      selectedUnitRef.current = sel?.kind === "unit" ? sel.unit : null;
      requestAnimationFrame(draw);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // unit roster subscription
  useEffect(() => {
    const unsubUnits = gameSocket.onUnits(setUnits);
    const unsubTraj = gameSocket.onTrajectory(setTrajectory);
    return () => { unsubUnits(); unsubTraj(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // recompute conflict zones whenever units change
  useEffect(() => {
    setZones(gameSocket.getConflictZones());
  }, [units]);

  // load topojson
  useEffect(() => {
    let cancelled = false;
    fetch(TOPO_URL)
      .then((r) => r.json())
      .then((topo) => {
        if (cancelled) return;
        const fc = feature(topo, topo.objects.countries) as unknown as { features: CountryFeature[] };
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

  // tension lookup: alpha3 -> tension vs selected country
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

    // military conflict-zone layer (fog of war: no individual units shown)
    for (const z of zones) {
      const xy = projection(z.centroid);
      if (!xy) continue;
      drawConflictZone(ctx, xy[0], xy[1], z, hoveredZoneRef.current?.id === z.id);
    }

    // movement trajectory for player units (dashed line from origin to destination)
    if (trajectory) {
      const fromXy = projection(trajectory.from);
      const toXy = projection(trajectory.to);
      if (fromXy && toXy) {
        ctx.save();
        ctx.strokeStyle = "#4ae3c4";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(fromXy[0], fromXy[1]);
        ctx.lineTo(toXy[0], toXy[1]);
        ctx.stroke();
        // arrowhead at destination
        const angle = Math.atan2(toXy[1] - fromXy[1], toXy[0] - fromXy[0]);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(toXy[0], toXy[1]);
        ctx.lineTo(toXy[0] - 8 * Math.cos(angle - 0.4), toXy[1] - 8 * Math.sin(angle - 0.4));
        ctx.moveTo(toXy[0], toXy[1]);
        ctx.lineTo(toXy[0] - 8 * Math.cos(angle + 0.4), toXy[1] - 8 * Math.sin(angle + 0.4));
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  // redraw on any input change
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features, size, hoveredId, zones, trajectory, tensionMode, tensionMap]);

  // pointer handling — hover + hit detection (zones first, then country polygons)
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // conflict zones take hover priority
    const hoveredZone = hitZone(mx, my);
    if (hoveredZone) {
      hoveredZoneRef.current = hoveredZone;
      setHoveredId(null);
      canvas.style.cursor = "pointer";
      return;
    }
    hoveredZoneRef.current = null;
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
  };

  const hitZone = (mx: number, my: number): ConflictZone | null => {
    const projection = proj();
    for (const z of zones) {
      const xy = projection(z.centroid);
      if (!xy) continue;
      const dx = mx - xy[0];
      const dy = my - xy[1];
      const radius = z.hostility >= 70 ? 16 : 12;
      if (dx * dx + dy * dy <= radius * radius) return z;
    }
    return null;
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // conflict zones first
    const z = hitZone(mx, my);
    if (z) {
      selection.selectZone(z);
      return;
    }
    if (hoveredId == null) return;
    const country = byNumeric.current.get(hoveredId);
    selection.selectCountry(country ?? null);
  };

  const handleLeave = () => setHoveredId(null);

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
      </div>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMouseLeave={handleLeave}
      />
      {features.length === 0 && <div className="map-loading">Loading world map…</div>}
    </div>
  );
}

// ---- helpers ---------------------------------------------------------------

/** Draw a glowing conflict-zone marker — a radar-blip hexagon with a pulsing aura. */
function drawConflictZone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zone: ConflictZone,
  hovered: boolean
) {
  const isHostile = zone.hostility >= 70;
  const isPresence = zone.hostility >= 35;
  const baseColor = isHostile ? "#e8635a" : isPresence ? "#e8b84a" : "#4a9fe8";
  const r = hovered ? 14 : 10;

  ctx.save();
  // outer glow / aura
  const gradient = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.5);
  gradient.addColorStop(0, isHostile ? "rgba(232,99,90,0.35)" : isPresence ? "rgba(232,184,74,0.25)" : "rgba(74,159,232,0.2)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
  ctx.fill();

  // hexagon marker
  ctx.fillStyle = baseColor;
  ctx.strokeStyle = hovered ? "#ffffff" : "rgba(0,0,0,0.5)";
  ctx.lineWidth = hovered ? 2 : 1;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const px = x + r * Math.cos(angle);
    const py = y + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // inner dot
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
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
  y: number
): boolean {
  const d = pathGen(f as unknown as GeoPermissibleObjects);
  if (!d) return false;
  const ctx = getHitCtx();
  if (!ctx) return false;
  const p = new Path2D(d);
  return ctx.isPointInPath(p, x, y);
}
