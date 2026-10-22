import { colors } from '../theme/colors'
import rawData from './campus.geojson.json'

export type LngLat = [number, number]

export type Campus = {
  id: string
  name: string
  center: LngLat
  zoom: number
  /** Viền khuôn viên */
  boundary: LngLat[]
  /** Lối đi nội bộ (tùy chọn) */
  walkway: LngLat[] | null
}

export type Building = {
  id: string
  campusId: string
  name: string
  polygon: LngLat[]
  center: LngLat
  floors: number
  /** Chiều cao mỗi tầng (m) */
  floorHeight: number
}

export type Room = {
  id: string
  code: string
  name: string
  buildingId: string
  campusId: string
  floor: number
  polygon: LngLat[]
  center: LngLat
  capacity: number
  occupancy: number
  equipment: string[]
  maintenance?: boolean
}

export type CampusDataset = { campuses: Campus[]; buildings: Building[]; rooms: Room[] }

export type RoomState = 'available' | 'inUse' | 'crowded' | 'maintenance'

export const ROOM_STATE_META: Record<RoomState, { label: string; color: string }> = {
  available: { label: 'Đang trống', color: colors.campus.available },
  inUse: { label: 'Đang có lớp', color: colors.campus.moderate },
  crowded: { label: 'Gần quá tải', color: colors.campus.busy },
  maintenance: { label: 'Bảo trì', color: colors.campus.maintenance },
}

type GeoFeature = {
  properties: Record<string, unknown>
  geometry: { coordinates: number[][][] }
}

const ringOf = (f: GeoFeature): LngLat[] => f.geometry.coordinates[0].slice(0, -1) as LngLat[]

function centroid(ring: LngLat[]): LngLat {
  const lngs = ring.map((p) => p[0])
  const lats = ring.map((p) => p[1])
  return [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2]
}

/** Chuyển GeoJSON FeatureCollection (campus/building/room/walkway) thành dataset. */
export function parseCampusGeoJSON(collection: { features: unknown[] }): CampusDataset {
  const features = collection.features as GeoFeature[]
  const of = (kind: string) => features.filter((f) => f.properties.kind === kind)

  const buildings: Building[] = of('building').map((f) => {
    const p = f.properties
    const polygon = ringOf(f)
    return {
      id: p.id as string,
      campusId: p.campusId as string,
      name: p.name as string,
      polygon,
      center: centroid(polygon),
      floors: p.floors as number,
      floorHeight: p.floorHeight as number,
    }
  })

  const rooms: Room[] = of('room').map((f) => {
    const p = f.properties
    const polygon = ringOf(f)
    return {
      id: p.id as string,
      code: p.code as string,
      name: p.name as string,
      buildingId: p.buildingId as string,
      campusId: buildings.find((b) => b.id === p.buildingId)?.campusId ?? '',
      floor: p.floor as number,
      polygon,
      center: centroid(polygon),
      capacity: p.capacity as number,
      occupancy: p.occupancy as number,
      equipment: (p.equipment as string[]) ?? [],
      maintenance: p.maintenance as boolean | undefined,
    }
  })

  const campuses: Campus[] = of('campus').map((f) => {
    const p = f.properties
    const boundary = ringOf(f)
    const walk = of('walkway').find((w) => w.properties.campusId === p.id)
    return {
      id: p.id as string,
      name: p.name as string,
      center: centroid(boundary),
      zoom: (p.zoom as number) ?? 18,
      boundary,
      walkway: walk ? ringOf(walk) : null,
    }
  })

  return { campuses, buildings, rooms }
}

/** Nguồn dữ liệu duy nhất: sau này thay bằng gọi API FastAPI trả cùng định dạng GeoJSON. */
export async function loadCampusDataset(): Promise<CampusDataset> {
  return parseCampusGeoJSON(rawData)
}

export function getRoomState(room: Room): RoomState {
  if (room.maintenance) return 'maintenance'
  const rate = room.occupancy / room.capacity
  if (rate >= 0.9) return 'crowded'
  if (room.occupancy > 0) return 'inUse'
  return 'available'
}
