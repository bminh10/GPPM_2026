import { booleanPointInPolygon, point, polygon } from '@turf/turf'
import type { LngLat } from './campusData'

export type RoomLight = { id: string; name: string; position: LngLat }

export function parseRoomLights(value: unknown, roomId: string, boundary: LngLat[]): RoomLight[] {
  if (value === undefined) return []
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
