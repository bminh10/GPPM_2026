import { colors } from '../theme/colors'
import { parseRoomLights, type RoomLight } from './roomLighting'
import cs1Buildings from './cs1/building.geojson?raw'
import cs1Rooms from './cs1/room-3d.geojson?raw'
import cs3Buildings from './cs3/building.geojson?raw'
import cs3Rooms from './cs3/room-3d.geojson?raw'

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
  lights: RoomLight[]
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

const METERS_PER_DEG = 111320

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

function buildingReference(id: string): string {
  return id.trim().split('.').pop()?.toLocaleUpperCase() ?? ''
}

function numericProperty(value: unknown, label: string, allowZero = false): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number) || (allowZero ? number < 0 : number <= 0)) {
    throw new Error(`Thuộc tính "${label}" phải là một số ${allowZero ? 'không âm' : 'lớn hơn 0'}.`)
  }
  return number
}

function parseFeatureCollection(source: string, filename: string): GeoFeature[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    throw new Error(`${filename} không phải JSON hợp lệ.`, { cause: error })
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('features' in parsed) ||
    !Array.isArray(parsed.features)
  ) {
    throw new Error(`${filename} phải có danh sách GeoJSON features.`)
  }
  return parsed.features as GeoFeature[]
}

function facilityFeatures(
  campusId: string,
  campusName: string,
  buildingSource: string,
  roomSource: string,
): CampusDataset {
  const buildingFeatures = parseFeatureCollection(buildingSource, `${campusId}/building.geojson`)
    .filter((feature) => feature.properties.kind === 'building')
  const roomFeatures = parseFeatureCollection(roomSource, `${campusId}/room-3d.geojson`)
    .filter((feature) => feature.properties.kind === 'room')

  const parsedBuildings = parseCampusGeoJSON({ features: buildingFeatures }).buildings
  const normalizedBuildings = buildingFeatures.map((feature) => {
    const properties = feature.properties
    return {
      ...feature,
      properties: {
        ...properties,
        campusId,
        floors: numericProperty(properties.floors, 'floors'),
        floorHeight: numericProperty(properties.floorHeight, 'floorHeight'),
      },
    }
  })
  const normalizedRooms = roomFeatures.map((feature) => {
    const properties = feature.properties
    const building = parsedBuildings.find(
      (candidate) => buildingReference(candidate.id) === buildingReference(String(properties.buildingId)),
    )
    if (!building) {
      throw new Error(`Phòng "${String(properties.id)}" tham chiếu đến tòa không tồn tại.`)
    }
    return {
      ...feature,
      properties: {
        ...properties,
        campusId,
        buildingId: building.id,
        floor: numericProperty(properties.floor, 'floor'),
        capacity: numericProperty(properties.capacity, 'capacity'),
        occupancy: properties.occupancy == null
          ? 0
          : numericProperty(properties.occupancy, 'occupancy', true),
        maintenance: properties.maintenance === true || properties.maintenance === 'true',
      },
    }
  })

  const buildings = parsedBuildings.map((building) => ({ ...building, campusId }))
  const boundary = paddedBounds(buildings, 25, 25)
  const campusFeature: GeoFeature = {
    properties: { kind: 'campus', id: campusId, name: campusName, zoom: 18 },
    geometry: { coordinates: [[...boundary, boundary[0]]] },
  }

  return parseCampusGeoJSON({
    features: [campusFeature, ...normalizedBuildings, ...normalizedRooms],
  })
}

/** Hình chữ nhật bao quanh các tòa, nới ra `padX` (Đông-Tây) và `padY` (Bắc-Nam) mét. */
function paddedBounds(buildings: Building[], padX: number, padY: number): LngLat[] {
  const points = buildings.flatMap((b) => b.polygon)
  const lngs = points.map((p) => p[0])
  const lats = points.map((p) => p[1])
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2
  const dLng = padX / (METERS_PER_DEG * Math.cos((midLat * Math.PI) / 180))
  const dLat = padY / METERS_PER_DEG
  const [w, e] = [Math.min(...lngs) - dLng, Math.max(...lngs) + dLng]
  const [s, n] = [Math.min(...lats) - dLat, Math.max(...lats) + dLat]
  return [[w, s], [e, s], [e, n], [w, n]]
}

/**
 * Chuyển GeoJSON FeatureCollection (campus/building/room/walkway) thành dataset.
 * Feature `campus` có thể khai báo `paddingX`/`paddingY` (mét) để tự tính nền từ các tòa;
 * nếu không có thì dùng polygon của chính feature đó.
 */
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
      floors: numericProperty(p.floors, 'floors'),
      floorHeight: numericProperty(p.floorHeight, 'floorHeight'),
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
      campusId: buildings.find(
        (b) => buildingReference(b.id) === buildingReference(String(p.buildingId)),
      )?.campusId ?? (typeof p.campusId === 'string' ? p.campusId : ''),
      floor: numericProperty(p.floor, 'floor'),
      polygon,
      center: centroid(polygon),
      capacity: numericProperty(p.capacity, 'capacity'),
      occupancy: p.occupancy == null ? 0 : numericProperty(p.occupancy, 'occupancy', true),
      equipment: (p.equipment as string[]) ?? [],
      lights: parseRoomLights(p.lights, String(p.id), polygon),
      maintenance: p.maintenance === true || p.maintenance === 'true',
    }
  })

  const campuses: Campus[] = of('campus').map((f) => {
    const p = f.properties
    const hasPadding = p.paddingX !== undefined || p.paddingY !== undefined
    const boundary = hasPadding
      ? paddedBounds(
          buildings.filter((b) => b.campusId === p.id),
          (p.paddingX as number) ?? 22,
          (p.paddingY as number) ?? 22,
        )
      : ringOf(f)
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
  const campuses = [
    facilityFeatures('CS1', 'Cơ sở 1 - 97 Võ Văn Tần', cs1Buildings, cs1Rooms),
    facilityFeatures('CS3', 'Cơ sở 3', cs3Buildings, cs3Rooms),
  ]
  return {
    campuses: campuses.flatMap((dataset) => dataset.campuses),
    buildings: campuses.flatMap((dataset) => dataset.buildings),
    rooms: campuses.flatMap((dataset) => dataset.rooms),
  }
}

export function getRoomState(room: Room): RoomState {
  if (room.maintenance) return 'maintenance'
  const rate = room.occupancy / room.capacity
  if (rate >= 0.9) return 'crowded'
  if (room.occupancy > 0) return 'inUse'
  return 'available'
}
