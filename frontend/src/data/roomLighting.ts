import { booleanPointInPolygon, point, polygon } from '@turf/turf'
import type { LngLat } from './campusData'
import defaults from './lightingDefaults.json' with { type: 'json' }

export type RoomLight = { id: string; name: string; position: LngLat }

export function placeRoomLights(
  lights: { id: string; name: string; offset?: number[] }[], boundary: LngLat[],
): RoomLight[] {
  if (lights.length === 0) return []
  const shape = polygon([[...boundary, boundary[0]]])
  const west = Math.min(...boundary.map(([lng]) => lng))
  const east = Math.max(...boundary.map(([lng]) => lng))
  const south = Math.min(...boundary.map(([, lat]) => lat))
  const north = Math.max(...boundary.map(([, lat]) => lat))
  const candidates: LngLat[] = []
  for (let x = 1; x < 20; x++) {
    for (let y = 1; y < 20; y++) {
      const position: LngLat = [west + (east - west) * x / 20, south + (north - south) * y / 20]
      if (booleanPointInPolygon(point(position), shape, { ignoreBoundary: true })) candidates.push(position)
    }
  }
  const used = new Set<string>()
  return lights.map((light, index) => {
    const offset = light.offset ?? [(index + 1) / (lights.length + 1), 0.5]
    if (offset.length !== 2 || !offset.every((value) => Number.isFinite(value) && value > 0 && value < 1)) {
      throw new Error(`Light ${light.id}: offset must contain two numbers between 0 and 1`)
    }
    const target: LngLat = [west + (east - west) * offset[0], south + (north - south) * offset[1]]
    const available = candidates.filter((position) => !used.has(position.join(',')))
    const distance = ([lng, lat]: LngLat) =>
      ((lng - target[0]) / (east - west)) ** 2 + ((lat - target[1]) / (north - south)) ** 2
    const position = booleanPointInPolygon(point(target), shape, { ignoreBoundary: true }) &&
      !used.has(target.join(','))
      ? target
      : available.sort((a, b) => distance(a) - distance(b))[0]
    if (!position) throw new Error(`Cannot place light ${light.id} inside room polygon; configure explicit positions`)
    used.add(position.join(','))
    return { id: light.id, name: light.name, position }
  })
}

export function parseRoomLights(value: unknown, roomId: string, boundary: LngLat[]): RoomLight[] {
  if (value === undefined) value = placeRoomLights(defaults.lights, boundary)
  if (!Array.isArray(value)) throw new Error(`Room ${roomId}: lights must be an array`)
  const ids = new Set<string>()
  return value.map((entry: unknown) => {
    if (
      typeof entry !== 'object' || entry === null ||
      !('id' in entry) || typeof entry.id !== 'string' || !entry.id.trim() ||
      !('name' in entry) || typeof entry.name !== 'string' || !entry.name.trim() ||
      !('position' in entry) || !Array.isArray(entry.position) ||
      entry.position.length !== 2 ||
      !entry.position.every((coordinate: unknown) => typeof coordinate === 'number' && Number.isFinite(coordinate))
    ) throw new Error(`Room ${roomId}: invalid light configuration`)
    if (ids.has(entry.id)) throw new Error(`Room ${roomId}: duplicate light ${entry.id}`)
    const position: LngLat = [entry.position[0], entry.position[1]]
    if (!booleanPointInPolygon(point(position), polygon([[...boundary, boundary[0]]]))) {
      throw new Error(`Room ${roomId}: light ${entry.id} must be inside the room`)
    }
    ids.add(entry.id)
    return { id: entry.id, name: entry.name, position }
  })
}
