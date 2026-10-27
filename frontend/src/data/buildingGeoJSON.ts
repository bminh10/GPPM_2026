// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
export type BuildingFeature = {
  id: string
  name: string
  floors: number
  floorHeight: number
  polygon: [number, number][]
}

export type RoomFeature = {
  id: string
  code: string
  name: string
  buildingId: string
  floor: number
  capacity: number
  occupancy: number
  baseHeight: number
  displayHeight: number
  maintenance: boolean
  polygon: [number, number][]
}

type GeoJSONFeatureCollection = {
  type: 'FeatureCollection'
  features: unknown[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function positiveNumber(value: unknown, label: string): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`Thuộc tính "${label}" phải là một số lớn hơn 0.`)
  }
  return number
}

function parsePolygon(value: unknown, label: string): [number, number][] {
  if (!Array.isArray(value) || !Array.isArray(value[0])) {
    throw new Error(`Feature ${label} cần có geometry Polygon với tọa độ vòng ngoài.`)
  }

  const polygon = value[0].map((coordinate: unknown): [number, number] => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
      throw new Error('Tọa độ Polygon không hợp lệ.')
    }

    const [longitude, latitude] = coordinate
    if (
      typeof longitude !== 'number' ||
      typeof latitude !== 'number' ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    ) {
      throw new Error('Tọa độ cần theo thứ tự kinh độ, vĩ độ và nằm trong phạm vi hợp lệ.')
    }
    return [longitude, latitude]
  })

  if (polygon.length < 4) {
    throw new Error('Vòng ngoài Polygon cần có ít nhất 4 tọa độ.')
  }
  return polygon
}

export function parseBuildingGeoJSON(source: string): BuildingFeature[] {
  const features = parseFeatureCollection(source, 'building.geojson')
  const buildings = features.flatMap((feature, index) => {
    if (!isRecord(feature) || !isRecord(feature.properties)) return []
    const properties = feature.properties
    if (properties.kind !== 'building') return []

    if (!isRecord(feature.geometry) || feature.geometry.type !== 'Polygon') {
      throw new Error(`Feature ${index + 1}: chỉ hỗ trợ geometry Polygon.`)
    }

    const id = properties.id
    const name = properties.name
    if (typeof id !== 'string' || !id.trim() || typeof name !== 'string' || !name.trim()) {
      throw new Error(`Feature ${index + 1}: thiếu id hoặc name hợp lệ.`)
    }

    return [{
      id,
      name,
      floors: positiveNumber(properties.floors, 'floors'),
      floorHeight: positiveNumber(properties.floorHeight, 'floorHeight'),
      polygon: parsePolygon(feature.geometry.coordinates, `tòa nhà ${id}`),
    }]
  })

  if (buildings.length === 0) {
    throw new Error('Không tìm thấy Feature nào có kind="building" trong building.geojson.')
  }
  return buildings
}

export function parseRoomGeoJSON(source: string): RoomFeature[] {
  const features = parseFeatureCollection(source, 'room-3d.geojson')
  const rooms = features.flatMap((feature, index) => {
    if (!isRecord(feature) || !isRecord(feature.properties)) return []
    const properties = feature.properties
    if (properties.kind !== 'room') return []

    if (!isRecord(feature.geometry) || feature.geometry.type !== 'Polygon') {
      throw new Error(`Feature phòng ${index + 1}: chỉ hỗ trợ geometry Polygon.`)
    }

    const { id, code, name, buildingId } = properties
    if (
      typeof id !== 'string' || !id.trim() ||
      typeof code !== 'string' || !code.trim() ||
      typeof name !== 'string' || !name.trim() ||
      typeof buildingId !== 'string' || !buildingId.trim()
    ) {
      throw new Error(`Feature phòng ${index + 1}: thiếu id, code, name hoặc buildingId hợp lệ.`)
    }

    const maintenance = properties.maintenance
    if (
      maintenance !== undefined &&
      maintenance !== true &&
      maintenance !== false &&
      maintenance !== 'true' &&
      maintenance !== 'false'
    ) {
      throw new Error(`Phòng ${id}: thuộc tính maintenance phải là true hoặc false.`)
    }

    return [{
      id,
      code,
      name,
      buildingId,
      floor: positiveNumber(properties.floor, 'floor'),
      capacity: positiveNumber(properties.capacity, 'capacity'),
      occupancy: nonNegativeNumber(properties.occupancy, 'occupancy'),
      baseHeight: nonNegativeNumber(properties.baseHeight, 'baseHeight'),
      displayHeight: positiveNumber(properties.displayHeight, 'displayHeight'),
      maintenance: maintenance === true || maintenance === 'true',
      polygon: parsePolygon(feature.geometry.coordinates, `phòng ${id}`),
    }]
  })

  if (rooms.length === 0) {
    throw new Error('Không tìm thấy Feature nào có kind="room" trong room-3d.geojson.')
  }
  return rooms
}

function nonNegativeNumber(value: unknown, label: string): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`Thuộc tính "${label}" phải là một số không âm.`)
  }
  return number
}

function parseFeatureCollection(source: string, filename: string): unknown[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    throw new Error(`Không thể đọc ${filename}: nội dung không phải JSON hợp lệ.`, { cause: error })
  }

  if (
    !isRecord(parsed) ||
    parsed.type !== 'FeatureCollection' ||
    !Array.isArray(parsed.features)
  ) {
    throw new Error(`${filename} phải có cấu trúc GeoJSON FeatureCollection.`)
  }

  return (parsed as GeoJSONFeatureCollection).features
}
