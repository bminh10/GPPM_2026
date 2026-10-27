// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, Card, Descriptions, Flex, Progress, Segmented, Select, Tag, Typography } from 'antd'
import { GlobalOutlined } from '@ant-design/icons'
import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox'
import { PolygonLayer, TextLayer } from '@deck.gl/layers'
import MapGL, { NavigationControl, useControl } from 'react-map-gl/maplibre'
import type { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import cs1BuildingGeoJSON from '../../data/cs1/building.geojson?raw'
import cs1RoomGeoJSON from '../../data/cs1/room-3d.geojson?raw'
import cs3BuildingGeoJSON from '../../data/cs3/building.geojson?raw'
import cs3RoomGeoJSON from '../../data/cs3/room-3d.geojson?raw'
import {
  parseBuildingGeoJSON,
  parseRoomGeoJSON,
  type BuildingFeature,
  type RoomFeature,
} from '../../data/buildingGeoJSON'

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
const FLOOR_PLATE_THICKNESS = 0.25
const VERTICAL_EXAGGERATION = 2.5
const ROOM_HEIGHT_EXAGGERATION = 3
const ROOM_FLOOR_GAP = 0.1

type FacilityDataset = {
  id: string
  name: string
  buildings: BuildingFeature[]
  rooms: RoomFeature[]
}

const EMPTY_BUILDINGS: BuildingFeature[] = []
const EMPTY_ROOMS: RoomFeature[] = []

const FACILITY_SOURCES = [
  {
    id: 'cs1',
    name: 'Cơ sở 1 - 97 Võ Văn Tần',
    buildingGeoJSON: cs1BuildingGeoJSON,
    roomGeoJSON: cs1RoomGeoJSON,
  },
  {
    id: 'cs3',
    name: 'Cơ sở 3',
    buildingGeoJSON: cs3BuildingGeoJSON,
    roomGeoJSON: cs3RoomGeoJSON,
  },
]

function buildingReference(id: string) {
  return id.trim().split('.').pop()?.toLocaleUpperCase() ?? ''
}

function roomBelongsToBuilding(room: RoomFeature, building: BuildingFeature) {
  return buildingReference(room.buildingId) === buildingReference(building.id)
}

function getFloorBaseHeight(building: BuildingFeature, floor: number, rooms: RoomFeature[]) {
  const floorRoom = rooms.find(
    (room) => roomBelongsToBuilding(room, building) && room.floor === floor,
  )
  return floorRoom?.baseHeight ?? (floor - 1) * building.floorHeight
}

function getBounds(polygon: [number, number][]): [[number, number], [number, number]] {
  const longitudes = polygon.map(([longitude]) => longitude)
  const latitudes = polygon.map(([, latitude]) => latitude)
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ]
}

function DeckOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay({ ...props, interleaved: false }))
  overlay.setProps(props)
  return null
}

function getInitialViewState(buildings: BuildingFeature[]) {
  const coordinates = buildings.flatMap((building) => building.polygon)
  const longitudes = coordinates.map(([longitude]) => longitude)
  const latitudes = coordinates.map(([, latitude]) => latitude)
  const longitudeSpan = Math.max(...longitudes) - Math.min(...longitudes)
  const latitudeSpan = Math.max(...latitudes) - Math.min(...latitudes)
  const zoom = Math.log2(
    Math.min(
      (1000 * 360) / (512 * longitudeSpan),
      (600 * 360) / (512 * latitudeSpan),
    ),
  ) - 0.4
  return {
    longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
    latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    zoom,
    pitch: 62,
    bearing: -25,
  }
}

function withElevation(polygon: [number, number][], elevation: number) {
  return polygon.map(([longitude, latitude]) => [longitude, latitude, elevation] as [number, number, number])
}

function getRoomLabelPosition(room: RoomFeature): [number, number, number] {
  const [longitudeSum, latitudeSum] = room.polygon.reduce<[number, number]>(
    ([sumLongitude, sumLatitude], [longitude, latitude]) => [
      sumLongitude + longitude,
      sumLatitude + latitude,
    ],
    [0, 0],
  )
  return [
    longitudeSum / room.polygon.length,
    latitudeSum / room.polygon.length,
    room.baseHeight * VERTICAL_EXAGGERATION +
      FLOOR_PLATE_THICKNESS * VERTICAL_EXAGGERATION +
      ROOM_FLOOR_GAP +
      room.displayHeight * ROOM_HEIGHT_EXAGGERATION +
      0.5 * VERTICAL_EXAGGERATION,
  ]
}

function roomState(room: RoomFeature) {
  if (room.maintenance) return { label: 'Bảo trì', color: '#f59e0b' }
  if (room.occupancy / room.capacity >= 0.9) return { label: 'Gần quá tải', color: '#ef4444' }
  if (room.occupancy > 0) return { label: 'Đang có lớp', color: '#3b82f6' }
  return { label: 'Đang trống', color: '#16a34a' }
}

export default function BuildingGeoJSONTest() {
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [selectedFacilityId, setSelectedFacilityId] = useState('cs3')
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null)
  const [selectedFloor, setSelectedFloor] = useState(1)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const { facilities, error } = useMemo<{ facilities: FacilityDataset[]; error: string | null }>(() => {
    try {
      return {
        facilities: FACILITY_SOURCES.map((facility) => ({
          id: facility.id,
          name: facility.name,
          buildings: parseBuildingGeoJSON(facility.buildingGeoJSON),
          rooms: parseRoomGeoJSON(facility.roomGeoJSON),
        })),
        error: null,
      }
    } catch (cause) {
      return {
        facilities: [],
        error: cause instanceof Error ? cause.message : 'Đã xảy ra lỗi khi đọc dữ liệu GeoJSON.',
      }
    }
  }, [])

  const selectedFacility = facilities.find((facility) => facility.id === selectedFacilityId)
  const buildings = selectedFacility ? selectedFacility.buildings : EMPTY_BUILDINGS
  const rooms = selectedFacility ? selectedFacility.rooms : EMPTY_ROOMS
  const selectedBuilding = buildings.find((building) => building.id === selectedBuildingId) ?? null
  const visibleRooms = useMemo(
    () => selectedBuilding
      ? rooms.filter(
          (room) => roomBelongsToBuilding(room, selectedBuilding) && room.floor === selectedFloor,
        )
      : [],
    [rooms, selectedBuilding, selectedFloor],
  )
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null

  const focusBuilding = useCallback((building: BuildingFeature) => {
    setSelectedBuildingId(building.id)
    setSelectedFloor(1)
    setSelectedRoomId(null)
    map?.fitBounds(getBounds(building.polygon), {
      padding: { top: 80, right: 80, bottom: 80, left: 320 },
      maxZoom: 17.5,
      pitch: 62,
      bearing: -25,
      duration: 1000,
    })
  }, [map])

  const focusRoom = useCallback((room: RoomFeature) => {
    const building = buildings.find((item) => roomBelongsToBuilding(room, item))
    if (!building) return
    setSelectedBuildingId(building.id)
    setSelectedFloor(room.floor)
    setSelectedRoomId(room.id)
    map?.fitBounds(getBounds(room.polygon), {
      padding: { top: 100, right: 100, bottom: 100, left: 320 },
      maxZoom: 19,
      pitch: 62,
      bearing: -25,
      duration: 1000,
    })
  }, [buildings, map])

  const layers = (() => {
    const shells = buildings.filter((building) => building.id !== selectedBuildingId)
    const slabs = selectedBuilding
      ? Array.from({ length: selectedFloor }, (_, index) => {
          const floor = index + 1
          return {
            id: `${selectedBuilding.id}-${floor}`,
            polygon: withElevation(
              selectedBuilding.polygon,
              getFloorBaseHeight(selectedBuilding, floor, rooms) * VERTICAL_EXAGGERATION,
            ),
            elevation: FLOOR_PLATE_THICKNESS * VERTICAL_EXAGGERATION,
            current: floor === selectedFloor,
          }
        })
      : []
    const roomBase = visibleRooms.map((room) => ({
      ...room,
      base: withElevation(
        room.polygon,
        room.baseHeight * VERTICAL_EXAGGERATION +
          FLOOR_PLATE_THICKNESS * VERTICAL_EXAGGERATION +
          ROOM_FLOOR_GAP,
      ),
    }))

    return [
      new PolygonLayer<BuildingFeature>({
        id: 'test-building-shells',
        data: shells,
        getPolygon: (building) => building.polygon,
        extruded: true,
        wireframe: true,
        getElevation: (building) =>
          building.floors * building.floorHeight * VERTICAL_EXAGGERATION,
        getFillColor: [10, 92, 168, 210],
        getLineColor: [255, 255, 255, 255],
        lineWidthMinPixels: 2,
        pickable: true,
        autoHighlight: true,
        onClick: (info) => {
          if (info.object) focusBuilding(info.object)
        },
      }),
      new PolygonLayer({
        id: 'test-floor-slabs',
        data: slabs,
        getPolygon: (slab) => slab.polygon,
        extruded: true,
        wireframe: true,
        getElevation: (slab) => slab.elevation,
        getFillColor: (slab) => slab.current ? [255, 255, 255, 245] : [10, 92, 168, 150],
        getLineColor: [10, 92, 168, 180],
        lineWidthMinPixels: 1,
      }),
      new PolygonLayer({
        id: 'test-rooms',
        data: roomBase,
        getPolygon: (room) => room.base,
        extruded: true,
        wireframe: true,
        getElevation: (room) => room.displayHeight * ROOM_HEIGHT_EXAGGERATION,
        getFillColor: (room) => {
          const color = roomState(room).color
          const hex = color.slice(1)
          const value = Number.parseInt(hex, 16)
          return [
            (value >> 16) & 255,
            (value >> 8) & 255,
            value & 255,
            room.id === selectedRoomId ? 255 : 220,
          ]
        },
        getLineColor: [255, 255, 255, 255],
        lineWidthMinPixels: 2,
        pickable: true,
        autoHighlight: true,
        onClick: (info) => {
          if (info.object) focusRoom(info.object)
        },
      }),
      new TextLayer<RoomFeature>({
        id: 'test-room-labels',
        data: visibleRooms,
        getPosition: getRoomLabelPosition,
        getText: (room) => room.code,
        getSize: 14,
        getColor: [15, 23, 42, 255],
        background: true,
        getBackgroundColor: [255, 255, 255, 230],
        backgroundPadding: [6, 3],
        billboard: true,
        pickable: true,
        onClick: (info) => {
          if (info.object) focusRoom(info.object)
        },
      }),
    ]
  })()

  if (error) {
    return <Alert type="error" showIcon message="Không thể dựng mô hình 3D" description={error} />
  }

  return (
    <Flex vertical gap={12} style={{ height: 'calc(100vh - 190px)', minHeight: 520 }}>
      <Card size="small">
        <Flex justify="space-between" align="center" wrap="wrap" gap={8}>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              Kiểm thử tương tác mô hình 3D
            </Typography.Title>
            <Typography.Text type="secondary">
              Chọn cơ sở, tòa, đổi tầng, rồi nhấn khối phòng để xem thông tin.
            </Typography.Text>
          </div>
          <Flex gap={8} align="center" wrap>
            <Select
              aria-label="Chọn cơ sở"
              value={selectedFacilityId}
              style={{ minWidth: 240 }}
              options={FACILITY_SOURCES.map((facility) => ({
                value: facility.id,
                label: facility.name,
              }))}
              onChange={(facilityId: string) => {
                setSelectedFacilityId(facilityId)
                setSelectedBuildingId(null)
                setSelectedFloor(1)
                setSelectedRoomId(null)
                setMap(null)
              }}
            />
            {buildings.map((building) => (
              <Tag key={building.id} color={selectedBuildingId === building.id ? 'green' : 'blue'}>
                {building.name} · {building.floors} tầng ·{' '}
                {building.floors * building.floorHeight} m
              </Tag>
            ))}
          </Flex>
        </Flex>
      </Card>

      <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', borderRadius: 12 }}>
        <MapGL
          key={selectedFacilityId}
          onLoad={(event) => setMap(event.target)}
          initialViewState={getInitialViewState(buildings)}
          maxPitch={75}
          maxZoom={22}
          mapStyle={MAP_STYLE}
          style={{ width: '100%', height: '100%' }}
        >
          <NavigationControl position="top-right" />
          <DeckOverlay layers={layers} />
        </MapGL>

        <Flex
          vertical
          gap={8}
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            bottom: 12,
            width: 280,
            maxWidth: 'calc(100% - 24px)',
            zIndex: 2,
            pointerEvents: 'none',
          }}
        >
          <Card size="small" title="Tòa nhà" styles={{ body: { padding: 8 } }} style={{ pointerEvents: 'auto' }}>
            <Flex vertical gap={6}>
              {buildings.map((building) => (
                <Button
                  key={building.id}
                  block
                  type={selectedBuildingId === building.id ? 'primary' : 'default'}
                  icon={<GlobalOutlined />}
                  onClick={() => focusBuilding(building)}
                >
                  {building.name}
                </Button>
              ))}
              {selectedBuilding && (
                <>
                  <Typography.Text type="secondary">Chọn tầng</Typography.Text>
                  <Segmented
                    block
                    value={selectedFloor}
                    options={Array.from({ length: selectedBuilding.floors }, (_, index) => {
                      const floor = index + 1
                      return { label: `T${floor}`, value: floor }
                    })}
                    onChange={(value) => {
                      setSelectedFloor(Number(value))
                      setSelectedRoomId(null)
                    }}
                  />
                </>
              )}
            </Flex>
          </Card>

          {selectedBuilding && (
            <Card
              size="small"
              title={`Phòng tầng ${selectedFloor}`}
              style={{ flex: 1, minHeight: 0, pointerEvents: 'auto' }}
              styles={{ body: { overflowY: 'auto', padding: 8 } }}
            >
              {visibleRooms.length === 0 ? (
                <Typography.Text type="secondary">Không có dữ liệu phòng ở tầng này.</Typography.Text>
              ) : (
                <Flex vertical gap={6}>
                  {visibleRooms.map((room) => (
                    <Button
                      key={room.id}
                      block
                      type={selectedRoomId === room.id ? 'primary' : 'default'}
                      onClick={() => focusRoom(room)}
                    >
                      {room.code} · {room.name}
                    </Button>
                  ))}
                </Flex>
              )}
            </Card>
          )}
        </Flex>

        {selectedRoom && (
          <Card
            size="small"
            title={
              <Flex align='center' gap={100}>
                <Typography.Text strong>{selectedRoom.code}</Typography.Text>
                <Tag color={roomState(selectedRoom).color}>{roomState(selectedRoom).label}</Tag>
              </Flex>
            }
            extra={<Button type="text" size="small" onClick={() => setSelectedRoomId(null)}>Đóng</Button>}
            style={{
              position: 'absolute',
              right: 12,
              bottom: 12,
              width: 300,
              maxWidth: 'calc(100% - 320px)',
              zIndex: 2,
            }}
          >
            <Typography.Paragraph style={{ marginBottom: 8 }}>
              {selectedRoom.name}
            </Typography.Paragraph>
            <Descriptions
              size="small"
              column={1}
              items={[
                { key: 'building', label: 'Tòa', children: selectedBuilding?.name ?? selectedRoom.buildingId },
                { key: 'floor', label: 'Tầng', children: `Tầng ${selectedRoom.floor}` },
                {
                  key: 'capacity',
                  label: 'Sức chứa',
                  children: `${selectedRoom.occupancy}/${selectedRoom.capacity} chỗ`,
                },
                { key: 'height', label: 'Cao độ', children: `${selectedRoom.baseHeight} m` },
              ]}
            />
            <Progress
              percent={Math.min(100, Math.round((selectedRoom.occupancy / selectedRoom.capacity) * 100))}
              strokeColor={roomState(selectedRoom).color}
            />
          </Card>
        )}
      </div>
    </Flex>
  )
}
