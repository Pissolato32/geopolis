export interface CityLight {
  name: string
  lat: number
  lng: number
  population: 'major' | 'capital' | 'megacity'
}

export interface TradeRoute {
  from: [number, number]
  to: [number, number]
  name: string
}

export const OCEAN_GRADIENT_TOP = '#080f1e'
export const OCEAN_GRADIENT_BOTTOM = '#111d33'
export const GRID_COLOR = 'rgba(100,140,200,0.08)'

export const CITIES: CityLight[] = [
  { name: 'Washington DC', lat: 38.9, lng: -77.0, population: 'capital' },
  { name: 'New York', lat: 40.7, lng: -74.0, population: 'megacity' },
  { name: 'Los Angeles', lat: 34.1, lng: -118.2, population: 'megacity' },
  { name: 'Mexico City', lat: 19.4, lng: -99.1, population: 'megacity' },
  { name: 'Brasília', lat: -15.8, lng: -47.9, population: 'capital' },
  { name: 'São Paulo', lat: -23.5, lng: -46.6, population: 'megacity' },
  { name: 'Buenos Aires', lat: -34.6, lng: -58.4, population: 'capital' },
  { name: 'Lima', lat: -12.0, lng: -77.0, population: 'capital' },
  { name: 'Bogotá', lat: 4.7, lng: -74.1, population: 'capital' },
  { name: 'Santiago', lat: -33.5, lng: -70.7, population: 'capital' },
  { name: 'London', lat: 51.5, lng: -0.1, population: 'megacity' },
  { name: 'Paris', lat: 48.9, lng: 2.3, population: 'megacity' },
  { name: 'Berlin', lat: 52.5, lng: 13.4, population: 'capital' },
  { name: 'Madrid', lat: 40.4, lng: -3.7, population: 'capital' },
  { name: 'Rome', lat: 41.9, lng: 12.5, population: 'capital' },
  { name: 'Moscow', lat: 55.8, lng: 37.6, population: 'megacity' },
  { name: 'Beijing', lat: 39.9, lng: 116.4, population: 'megacity' },
  { name: 'Shanghai', lat: 31.2, lng: 121.5, population: 'megacity' },
  { name: 'Tokyo', lat: 35.7, lng: 139.7, population: 'megacity' },
  { name: 'Seoul', lat: 37.6, lng: 127.0, population: 'megacity' },
  { name: 'New Delhi', lat: 28.6, lng: 77.2, population: 'megacity' },
  { name: 'Mumbai', lat: 19.1, lng: 72.9, population: 'megacity' },
  { name: 'Bangkok', lat: 13.8, lng: 100.5, population: 'megacity' },
  { name: 'Singapore', lat: 1.3, lng: 103.8, population: 'megacity' },
  { name: 'Jakarta', lat: -6.2, lng: 106.8, population: 'megacity' },
  { name: 'Manila', lat: 14.6, lng: 121.0, population: 'megacity' },
  { name: 'Sydney', lat: -33.9, lng: 151.2, population: 'capital' },
  { name: 'Cairo', lat: 30.0, lng: 31.2, population: 'megacity' },
  { name: 'Lagos', lat: 6.5, lng: 3.4, population: 'megacity' },
  { name: 'Nairobi', lat: -1.3, lng: 36.8, population: 'capital' },
  { name: 'Cape Town', lat: -33.9, lng: 18.4, population: 'capital' },
  { name: 'Riyadh', lat: 24.7, lng: 46.7, population: 'capital' },
  { name: 'Tehran', lat: 35.7, lng: 51.4, population: 'capital' },
  { name: 'Ankara', lat: 39.9, lng: 32.9, population: 'capital' },
  { name: 'Dubai', lat: 25.2, lng: 55.3, population: 'megacity' },
  { name: 'Toronto', lat: 43.7, lng: -79.4, population: 'megacity' },
  { name: 'Chicago', lat: 41.9, lng: -87.6, population: 'megacity' },
  { name: 'Houston', lat: 29.8, lng: -95.4, population: 'megacity' },
  { name: 'San Francisco', lat: 37.8, lng: -122.4, population: 'major' },
  { name: 'Lisbon', lat: 38.7, lng: -9.1, population: 'capital' },
]

export const TRADE_ROUTES: TradeRoute[] = [
  { from: [38.0, -77.0], to: [52.5, 13.4], name: 'Washington-Berlin' },
  { from: [52.5, 13.4], to: [55.8, 37.6], name: 'Berlin-Moscow' },
  { from: [40.4, -3.7], to: [41.9, 12.5], name: 'Madrid-Rome' },
  { from: [38.7, -9.1], to: [40.4, -3.7], name: 'Lisbon-Madrid' },
  { from: [48.9, 2.3], to: [52.5, 13.4], name: 'Paris-Berlin' },
  { from: [51.5, -0.1], to: [48.9, 2.3], name: 'London-Paris' },
  { from: [55.8, 37.6], to: [39.9, 116.4], name: 'Moscow-Beijing' },
  { from: [24.7, 46.7], to: [25.2, 55.3], name: 'Riyadh-Dubai' },
  { from: [30.0, 31.2], to: [24.7, 46.7], name: 'Cairo-Riyadh' },
  { from: [30.0, 31.2], to: [6.5, 3.4], name: 'Cairo-Lagos' },
  { from: [1.3, 103.8], to: [19.1, 72.9], name: 'Singapore-Mumbai' },
  { from: [19.1, 72.9], to: [28.6, 77.2], name: 'Mumbai-Delhi' },
  { from: [31.2, 121.5], to: [35.7, 139.7], name: 'Shanghai-Tokyo' },
  { from: [39.9, 116.4], to: [31.2, 121.5], name: 'Beijing-Shanghai' },
  { from: [14.6, 121.0], to: [1.3, 103.8], name: 'Manila-Singapore' },
  { from: [-23.5, -46.6], to: [-34.6, -58.4], name: 'Sao Paulo-Buenos Aires' },
  { from: [-23.5, -46.6], to: [-15.8, -47.9], name: 'Brasilia-Sao Paulo' },
  { from: [38.9, -77.0], to: [43.7, -79.4], name: 'Washington-Toronto' },
  { from: [38.9, -77.0], to: [41.9, -87.6], name: 'Washington-Chicago' },
  { from: [34.1, -118.2], to: [37.8, -122.4], name: 'LA-San Francisco' },
]

export function getOwnerColor(ownerId: string): string {
  const hash = [...ownerId].reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const hue = ownerId === 'unclaimed' ? 0 : (hash * 137.5) % 360
  const sat = ownerId === 'unclaimed' ? 0 : 65
  const lit = ownerId === 'unclaimed' ? 25 : 55
  return `hsl(${hue}, ${sat}%, ${lit}%)`
}
