// WorldMap — HTML5 Canvas tactical map. Renders world-atlas TopoJSON with
// geoEqualEarth, highlights hover/selection, draws a marker dot for nations
// that have no 110m geometry, overlays military unit markers (with
// hit-detection), and supports a "Tension" map mode that recolors every
// country by its diplomatic tension with the selected nation.

import { geoEqualEarth, geoPath } from "d3-geo";
import type { GeoPermissibleObjects } from "d3-geo";
import { feature } from "topojson-client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Country, Relationship, Unit, WorldSeed } from "./shared/types.js";
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
  const [tensionMode, setTensionMode] = useState(false);

  const selectedRef = useRef<Country | null>(null);
  const selectedUnitRef = useRef<Unit | null>(null);

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
    return gameSocket.onUnits(setUnits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    // military unit layer
    const selCountry = selectedRef.current;
    const selUnitId = selectedUnitRef.current?.id ?? null;
    for (const u of units) {
      const xy = projection(u.latlng);
      if (!xy) continue;
      const rel = selCountry ? relationshipOf(selCountry, u.ownerCode) : "neutral";
      const color = unitColor(u, rel, selUnitId === u.id);
      drawUnitMarker(ctx, xy[0], xy[1], u.type, color);
    }
  };

  // redraw on any input change
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features, size, hoveredId, units, tensionMode, tensionMap]);

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
  };

  const hitUnit = (mx: number, my: number): Unit | null => {
    const projection = proj();
    for (const u of units) {
      const xy = projection(u.latlng);
      if (!xy) continue;
      const dx = mx - xy[0];
      const dy = my - xy[1];
      if (dx * dx + dy * dy <= 9 * 9) return u;
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

function relationshipOf(sel: Country, ownerCode: string): "ally" | "enemy" | "neutral" {
  if (sel.id === ownerCode) return "ally";
  const r = sel.relationships.find((x) => x.countryCode === ownerCode) as Relationship | undefined;
  if (!r) return "neutral";
  if (r.tension >= 60) return "enemy";
  if (r.tension <= 25 && r.affinity >= 30) return "ally";
  return "neutral";
}

function unitColor(_u: Unit, rel: "ally" | "enemy" | "neutral", selected: boolean): string {
  if (selected) return "#ffffff";
  if (rel === "ally") return "#4a9fe8"; // blue
  if (rel === "enemy") return "#e8635a"; // red
  return "#8ba3b5"; // gray
}

function drawUnitMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  type: Unit["type"],
  color: string
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = 1;
  const r = 6;
  ctx.beginPath();
  if (type === "infantry") {
    ctx.rect(x - r, y - r, r * 2, r * 2); // square
  } else if (type === "armor") {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath(); // diamond
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2); // circle = navy
  }
  ctx.fill();
  ctx.stroke();
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
