import type { StateStore } from './state-store'
import type {
  SimulationState,
  MilitaryStateDTO,
  UnitDTO,
} from './types'
import { getOwnerColor } from './world-data'
import { entityToIso2, getFlagUrl } from './utils/iso-mapper'

interface GeoJsonFeature {
  type: string
  properties: Record<string, unknown>
  geometry: {
    type: string
    coordinates: number[][][] | number[][][][]
  }
}

interface GeoJsonFeatureCollection {
  type: string
  features: GeoJsonFeature[]
}

const SELECTED_COLOR = '#38bdf8'
const HOVER_COLOR = '#7dd3fc'

function pointInPolygonRing(point: [number, number], ring: number[][]): boolean {
  const x = point[0]
  const y = point[1]
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!
    const yi = ring[i]![1]!
    const xj = ring[j]![0]!
    const yj = ring[j]![1]!
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export class MapView {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly offscreen: HTMLCanvasElement
  private readonly offCtx: CanvasRenderingContext2D

  private state: Readonly<SimulationState> | null = null
  private military: Readonly<MilitaryStateDTO> | null = null
  private selectedEntityId: string | null = null
  private selectedUnitId: string | null = null
  private hoveredEntityId: string | null = null
  private hoveredUnit: UnitDTO | null = null

  private onSelect: ((entityId: string) => void) | null = null
  private onUnitSelect: ((unitId: string) => void) | null = null

  private mapW = 0
  private mapH = 0

  private geoFeatures: GeoJsonFeature[] = []
  private geoJsonLoaded = false
  private baseDirty = true
  private flagCache = new Map<string, HTMLImageElement>()
  private animFrameId: number | null = null

  private playerCountry: string | null = null
  private mapMode: 'political' | 'tension' = 'political'

  public setMapMode(mode: 'political' | 'tension'): void {
    this.mapMode = mode
    this.baseDirty = true
    this.scheduleRender()
  }

  public getMapMode(): 'political' | 'tension' {
    return this.mapMode
  }

  constructor(canvasId: string, store: StateStore) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement
    this.ctx = this.canvas.getContext('2d')!

    this.offscreen = document.createElement('canvas')
    this.offCtx = this.offscreen.getContext('2d')!

    this.resize()
    window.addEventListener('resize', () => this.resize())

    this.canvas.addEventListener('click', (e) => this.handleClick(e))
    this.canvas.addEventListener('mousemove', (e) => this.handleHover(e))
    this.canvas.addEventListener('mouseleave', () => {
      this.hoveredEntityId = null
      this.hoveredUnit = null
      this.scheduleRender()
    })

    store.onSimState((s) => {
      this.state = s
      this.scheduleRender()
    })

    store.onMilitaryState((m) => {
      this.military = m
      this.scheduleRender()
    })

    store.onPlayerCountry((id) => {
      this.playerCountry = id
      this.scheduleRender()
    })

    this.initGeoJson()
  }

  setOnSelect(fn: (entityId: string) => void): void {
    this.onSelect = fn
  }

  setOnUnitSelect(fn: (unitId: string) => void): void {
    this.onUnitSelect = fn
  }

  selectEntity(id: string | null): void {
    this.selectedEntityId = id
    this.selectedUnitId = null
    this.scheduleRender()
  }

  selectUnit(unitId: string | null): void {
    this.selectedUnitId = unitId
    this.scheduleRender()
  }

  private resize(): void {
    const rect = this.canvas.parentElement!.getBoundingClientRect()
    const w = rect.width
    const h = rect.height

    this.canvas.width = w * devicePixelRatio
    this.canvas.height = h * devicePixelRatio
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`

    this.mapW = w
    this.mapH = h

    this.offscreen.width = w * devicePixelRatio
    this.offscreen.height = h * devicePixelRatio

    this.baseDirty = true
    this.scheduleRender()
  }

  private scheduleRender(): void {
    if (this.animFrameId !== null) return
    this.animFrameId = requestAnimationFrame(() => {
      this.animFrameId = null
      this.render()
    })
  }

  private render(): void {
    if (!this.state) return

    const screenW = this.canvas.width / devicePixelRatio
    const screenH = this.canvas.height / devicePixelRatio

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    this.ctx.save()
    this.ctx.scale(devicePixelRatio, devicePixelRatio)

    // 1. Ocean background
    this.drawOcean(this.ctx, screenW, screenH)

    // 2. Base layer
    if (this.baseDirty) {
      this.renderBaseLayer()
      this.baseDirty = false
    }

    // 3. Composite offscreen
    this.ctx.drawImage(this.offscreen, 0, 0, this.mapW, this.mapH)

    // 4. Dynamic layers
    this.renderLayer2()
    this.renderLayer3()

    this.ctx.restore()
  }

  private lngToX(lng: number, w: number): number {
    return ((lng + 180) / 360) * w
  }

  private latToY(lat: number, h: number): number {
    return ((90 - lat) / 180) * h
  }

  private geoToCanvas(lat: number, lng: number): { x: number; y: number } {
    return {
      x: ((lng + 180) / 360) * this.mapW,
      y: ((90 - lat) / 180) * this.mapH,
    }
  }

  canvasToGeo(x: number, y: number): { lat: number; lng: number } {
    return {
      lng: (x / this.mapW) * 360 - 180,
      lat: 90 - (y / this.mapH) * 180,
    }
  }

  private async initGeoJson(): Promise<void> {
    try {
      const res = await fetch('/assets/world-110m.geojson')
      const collection = (await res.json()) as GeoJsonFeatureCollection
      this.geoFeatures = collection.features.filter((f) => f.geometry !== null)
      this.geoJsonLoaded = true
      this.baseDirty = true
      this.preloadFlags()
      this.scheduleRender()
    } catch {
      this.geoJsonLoaded = false
    }
  }

  private preloadFlags(): void {
    const seen = new Set<string>()
    for (const feature of this.geoFeatures) {
      const props = feature.properties
      const iso2 = (((props.iso_a2 ?? props.ISO_A2) as string) ?? '').toLowerCase()
      if (iso2 && iso2.length === 2 && !seen.has(iso2)) {
        seen.add(iso2)
        const img = new Image()
        img.onload = () => {
          this.flagCache.set(iso2, img)
          this.scheduleRender()
        }
        img.onerror = () => {}
        img.src = getFlagUrl(iso2)
      }
    }
  }

  private renderBaseLayer(): void {
    const w = this.mapW
    const h = this.mapH

    this.offCtx.save()
    this.offCtx.scale(devicePixelRatio, devicePixelRatio)
    this.offCtx.clearRect(0, 0, w, h)

    if (this.geoJsonLoaded) {
      this.drawGeoJsonContinents(this.offCtx, w, h)
    }

    this.drawGraticule(this.offCtx, w, h)
    this.offCtx.restore()
  }

  private drawOcean(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, '#040711')
    grad.addColorStop(0.5, '#070c1b')
    grad.addColorStop(1, '#040711')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
  }

  private drawGraticule(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.05)'
    ctx.lineWidth = 0.5

    for (let lng = -150; lng <= 150; lng += 30) {
      const x = this.lngToX(lng, w)
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }

    for (let lat = -60; lat <= 60; lat += 30) {
      const y = this.latToY(lat, h)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
  }

  private drawGeoJsonContinents(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    for (const feature of this.geoFeatures) {
      const props = feature.properties
      const iso2 = (((props.iso_a2 ?? props.ISO_A2) as string) ?? '').toLowerCase()
      const geom = feature.geometry

      if (geom.type === 'Polygon') {
        this.drawPolygon(ctx, geom.coordinates as number[][][], w, h, iso2)
      } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates as number[][][][]) {
          this.drawPolygon(ctx, poly, w, h, iso2)
        }
      }
    }
  }

  private drawPolygon(
    ctx: CanvasRenderingContext2D,
    coordinates: number[][][],
    w: number,
    h: number,
    iso2: string,
  ): void {
    const outerRing = coordinates[0]
    if (!outerRing || outerRing.length < 3) return

    ctx.beginPath()
    ctx.moveTo(this.lngToX(outerRing[0]![0]!, w), this.latToY(outerRing[0]![1]!, h))
    for (let i = 1; i < outerRing.length; i++) {
      ctx.lineTo(this.lngToX(outerRing[i]![0]!, w), this.latToY(outerRing[i]![1]!, h))
    }
    ctx.closePath()

    for (let hIdx = 1; hIdx < coordinates.length; hIdx++) {
      const hole = coordinates[hIdx]!
      if (hole.length < 3) continue
      ctx.moveTo(this.lngToX(hole[0]![0]!, w), this.latToY(hole[0]![1]!, h))
      for (let i = 1; i < hole.length; i++) {
        ctx.lineTo(this.lngToX(hole[i]![0]!, w), this.latToY(hole[i]![1]!, h))
      }
      ctx.closePath()
    }

    const countryId = iso2 ? `country-${iso2}` : ''
    const isKnownEntity = countryId && this.state?.entities[countryId]

    if (isKnownEntity) {
      let ownerColor = getOwnerColor(countryId)

      if (this.mapMode === 'tension' && this.playerCountry && countryId !== this.playerCountry) {
        const relations = this.state?.relations[this.playerCountry] ?? []
        const rel = relations.find((r) => r.targetId === countryId)
        if (rel) {
          if (rel.tension >= 0.7) {
            ownerColor = '#ef4444'
          } else if (rel.affinity >= 0.4) {
            ownerColor = '#22c55e'
          } else {
            ownerColor = '#334155'
          }
        }
      }

      ctx.fillStyle = ownerColor
      ctx.globalAlpha = 0.55
      ctx.fill('evenodd')
      ctx.globalAlpha = 1.0
    } else {
      ctx.fillStyle = '#0f172a'
      ctx.fill('evenodd')
    }

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.95)'
    ctx.lineWidth = 0.85
    ctx.stroke()
  }

  private renderLayer2(): void {
    this.drawHighlights()
  }

  private drawHighlights(): void {
    const targetId = this.hoveredEntityId ?? this.selectedEntityId
    if (!targetId) return

    const iso2 = entityToIso2(targetId)
    const entity = this.state?.entities[targetId]
    let drawnPolygon = false

    if (iso2 && this.geoJsonLoaded) {
      const w = this.mapW
      const h = this.mapH

      for (const feature of this.geoFeatures) {
        const featIso = (((feature.properties.iso_a2 ?? feature.properties.ISO_A2) as string) ?? '').toLowerCase()
        if (featIso !== iso2) continue

        const geom = feature.geometry
        const isSelected = targetId === this.selectedEntityId
        const strokeColor = isSelected ? SELECTED_COLOR : HOVER_COLOR

        const drawStroke = (coords: number[][][]) => {
          const ring = coords[0]
          if (!ring || ring.length < 3) return
          this.ctx.beginPath()
          this.ctx.moveTo(this.lngToX(ring[0]![0]!, w), this.latToY(ring[0]![1]!, h))
          for (let i = 1; i < ring.length; i++) {
            this.ctx.lineTo(this.lngToX(ring[i]![0]!, w), this.latToY(ring[i]![1]!, h))
          }
          this.ctx.closePath()
          this.ctx.strokeStyle = strokeColor
          this.ctx.lineWidth = isSelected ? 2.2 : 1.5
          this.ctx.shadowColor = strokeColor
          this.ctx.shadowBlur = isSelected ? 12 : 6
          this.ctx.stroke()
          this.ctx.shadowBlur = 0
          drawnPolygon = true
        }

        if (geom.type === 'Polygon') {
          drawStroke(geom.coordinates as number[][][])
        } else if (geom.type === 'MultiPolygon') {
          for (const poly of geom.coordinates as number[][][][]) {
            drawStroke(poly)
          }
        }
      }
    }

    // Fallback: Glowing Teal Marker Dot for micro-states without map polygon
    if (!drawnPolygon && entity && entity.position) {
      const { x, y } = this.geoToCanvas(entity.position.lat, entity.position.lng)
      this.ctx.save()
      this.ctx.shadowColor = SELECTED_COLOR
      this.ctx.shadowBlur = 12
      this.ctx.strokeStyle = SELECTED_COLOR
      this.ctx.lineWidth = 2.5
      this.ctx.beginPath()
      this.ctx.arc(x, y, 10, 0, Math.PI * 2)
      this.ctx.stroke()
      this.ctx.shadowBlur = 0
      this.ctx.restore()
    }
  }

  private renderLayer3(): void {
    this.drawUnits()
    this.drawCountryLabels()
  }

  private drawUnits(): void {
    const state = this.state
    const mil = this.military
    if (!state || !mil) return

    for (const unit of mil.units) {
      const provPos = this.getProvincePosition(unit.currentProvinceId, state)
      if (!provPos) continue

      let x = provPos.x
      let y = provPos.y

      if (
        unit.moveTargetProvinceId &&
        unit.moveProgress !== undefined &&
        unit.moveProgress < 100
      ) {
        const targetPos = this.getProvincePosition(unit.moveTargetProvinceId, state)
        if (targetPos) {
          const t = unit.moveProgress / 100
          x = provPos.x + (targetPos.x - provPos.x) * t
          y = provPos.y + (targetPos.y - provPos.y) * t

          this.ctx.setLineDash([3, 4])
          this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)'
          this.ctx.lineWidth = 1.2
          this.ctx.beginPath()
          this.ctx.moveTo(provPos.x, provPos.y)
          this.ctx.lineTo(targetPos.x, targetPos.y)
          this.ctx.stroke()
          this.ctx.setLineDash([])
        }
      }

      // Color coding: Blue for allies/player, Red for hostile, Gray for neutral
      let unitColor = '#94a3b8' // Neutral gray
      if (this.playerCountry) {
        if (unit.ownerCountryId === this.playerCountry) {
          unitColor = '#38bdf8' // Player blue
        } else {
          const relations = state.relations[this.playerCountry] ?? []
          const rel = relations.find((r) => r.targetId === unit.ownerCountryId)
          if (rel) {
            if (rel.tension >= 0.6) {
              unitColor = '#ef4444' // Hostile red
            } else if (rel.affinity >= 0.4) {
              unitColor = '#22c55e' // Friendly green
            }
          }
        }
      }

      const isHovered = this.hoveredUnit?.unitId === unit.unitId
      const isSelected = this.selectedUnitId === unit.unitId
      const size = isSelected ? 8 : isHovered ? 7 : 5

      this.ctx.save()
      this.ctx.shadowColor = unitColor
      this.ctx.shadowBlur = isSelected ? 12 : 6
      this.ctx.fillStyle = unitColor

      const unitNameLower = unit.unitName.toLowerCase()
      if (unitNameLower.includes('blind') || unitNameLower.includes('tanq') || unitNameLower.includes('armor')) {
        // Diamond shape for Armor
        this.ctx.beginPath()
        this.ctx.moveTo(x, y - size * 1.3)
        this.ctx.lineTo(x + size * 1.3, y)
        this.ctx.lineTo(x, y + size * 1.3)
        this.ctx.lineTo(x - size * 1.3, y)
        this.ctx.closePath()
        this.ctx.fill()
      } else if (unitNameLower.includes('mar') || unitNameLower.includes('nav') || unitNameLower.includes('fleet')) {
        // Circle shape for Navy
        this.ctx.beginPath()
        this.ctx.arc(x, y, size, 0, Math.PI * 2)
        this.ctx.fill()
      } else {
        // Square shape for Infantry
        this.ctx.fillRect(x - size, y - size, size * 2, size * 2)
      }

      this.ctx.shadowBlur = 0
      this.ctx.strokeStyle = isSelected ? '#38bdf8' : '#fff'
      this.ctx.lineWidth = isSelected ? 2 : 1.2
      this.ctx.stroke()
      this.ctx.restore()
    }
  }

  private drawCountryLabels(): void {
    const state = this.state
    if (!state) return

    this.ctx.font = 'bold 9px Inter, sans-serif'
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'top'

    for (const [id, entity] of Object.entries(state.entities)) {
      if (!entity.position) continue
      const { x, y } = this.geoToCanvas(entity.position.lat, entity.position.lng)

      const isHovered = this.hoveredEntityId === id
      const isSelected = this.selectedEntityId === id

      const iso2 = entityToIso2(id)
      if (iso2) {
        const flag = this.flagCache.get(iso2.toLowerCase())
        if (flag) {
          this.ctx.drawImage(flag, x - 9, y - 22, 18, 13.5)
        }
      }

      const shortName = entity.name.replace(/^country-/i, '').toUpperCase()
      const labelY = y + 6

      this.ctx.strokeStyle = 'rgba(5, 8, 17, 0.9)'
      this.ctx.lineWidth = 3
      this.ctx.lineJoin = 'round'
      this.ctx.strokeText(shortName, x, labelY)

      this.ctx.fillStyle = isSelected
        ? SELECTED_COLOR
        : isHovered
          ? '#fff'
          : '#94a3b8'
      this.ctx.fillText(shortName, x, labelY)
    }
  }



  private getProvincePosition(
    provinceId: string,
    state: SimulationState,
  ): { x: number; y: number } | undefined {
    for (const provinces of Object.values(state.provinces)) {
      const prov = provinces.find((p) => p.provinceId === provinceId)
      if (prov) {
        return this.geoToCanvas(prov.lat, prov.lng)
      }
    }
    return undefined
  }

  private entityAt(mx: number, my: number, state: SimulationState): string | null {
    // 1. Military unit hit testing takes priority
    const mil = this.military
    if (mil) {
      for (const unit of mil.units) {
        const pos = this.getProvincePosition(unit.currentProvinceId, state)
        if (!pos) continue
        let ux = pos.x
        let uy = pos.y
        if (
          unit.moveTargetProvinceId &&
          unit.moveProgress !== undefined &&
          unit.moveProgress < 100
        ) {
          const targetPos = this.getProvincePosition(unit.moveTargetProvinceId, state)
          if (targetPos) {
            const t = unit.moveProgress / 100
            ux = pos.x + (targetPos.x - pos.x) * t
            uy = pos.y + (targetPos.y - pos.y) * t
          }
        }
        const dx = mx - ux
        const dy = my - uy
        if (dx * dx + dy * dy < 144) return unit.unitId
      }
    }

    const geo = this.canvasToGeo(mx, my)

    // 2. Precise GeoJSON Point-In-Polygon hit detection
    if (this.geoJsonLoaded) {
      for (const feature of this.geoFeatures) {
        const geom = feature.geometry
        const iso2 = (((feature.properties.iso_a2 ?? feature.properties.ISO_A2) as string) ?? '').toLowerCase()
        if (!iso2) continue

        const checkPoly = (coords: number[][][]): boolean => {
          const outer = coords[0]
          if (!outer || outer.length < 3) return false
          return pointInPolygonRing([geo.lng, geo.lat], outer)
        }

        let isInside = false
        if (geom.type === 'Polygon') {
          isInside = checkPoly(geom.coordinates as number[][][])
        } else if (geom.type === 'MultiPolygon') {
          for (const poly of geom.coordinates as number[][][][]) {
            if (checkPoly(poly)) {
              isInside = true
              break
            }
          }
        }

        if (isInside) {
          const cid = `country-${iso2}`
          if (state.entities[cid]) return cid
        }
      }
    }

    // 3. Proximity fallback to country position
    for (const [id, entity] of Object.entries(state.entities)) {
      if (!entity.position) continue
      const { x, y } = this.geoToCanvas(entity.position.lat, entity.position.lng)
      const dx = mx - x
      const dy = my - y
      if (dx * dx + dy * dy < 900) return id
    }

    return null
  }

  private getMousePos(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  private handleClick(e: MouseEvent): void {
    if (!this.state) return
    const { x, y } = this.getMousePos(e)
    const target = this.entityAt(x, y, this.state)
    if (target) {
      if (target.startsWith('unit-')) {
        this.selectUnit(target)
        if (this.onUnitSelect) this.onUnitSelect(target)
      } else {
        this.selectEntity(target)
        if (this.onSelect) this.onSelect(target)
      }
    }
  }

  private handleHover(e: MouseEvent): void {
    if (!this.state) return
    const { x, y } = this.getMousePos(e)
    const target = this.entityAt(x, y, this.state)

    if (target) {
      if (target.startsWith('unit-')) {
        this.hoveredUnit = this.military?.units.find((u) => u.unitId === target) ?? null
        this.hoveredEntityId = null
      } else {
        this.hoveredEntityId = target
        this.hoveredUnit = null
      }
      this.canvas.style.cursor = 'pointer'
    } else {
      this.hoveredEntityId = null
      this.hoveredUnit = null
      this.canvas.style.cursor = 'default'
    }

    this.scheduleRender()
  }
}
