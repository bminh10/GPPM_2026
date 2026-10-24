import { useEffect, useMemo, useRef, useState } from 'react'
import MapGL, { useControl, type MapRef } from 'react-map-gl/maplibre'
import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox'
import { IconLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import EnvironmentOutlined from '@ant-design/icons-svg/es/asn/EnvironmentOutlined'
import 'maplibre-gl/dist/maplibre-gl.css'
import { colors, hexToRgba } from '../../theme/colors'
import { FONT_FAMILY } from '../../theme/font'
import type { RoomLight } from '../../data/roomLighting'
import {
  ROOM_STATE_META,
  getRoomState,
  normalizeRoomCode,
  type Building,
  type Campus,
  type LngLat,
  type Room,
} from '../../data/campusData'

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
const PLATE_THICKNESS = 0.4
const VERTICAL_EXAGGERATION = 2.5
const iconNode = EnvironmentOutlined.icon
const environmentIconNode =
  typeof iconNode === 'function' ? iconNode('#000000', '#000000') : iconNode

type IconNode = { tag: string; attrs: Record<string, string>; children?: IconNode[] }

function serializeIconNode(node: IconNode): string {
  const attrs = Object.entries(node.attrs)
    .map(([name, value]) => `${name}="${value}"`)
    .join(' ')
  const children = node.children
    ?.map(serializeIconNode)
    .join('')
  return `<${node.tag}${attrs ? ` ${attrs}` : ''}>${children ?? ''}</${node.tag}>`
}

const environmentIconUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="${environmentIconNode.attrs.viewBox}">${environmentIconNode.children
    ?.map((node) => serializeIconNode(node))
    .join('')}</svg>`,
)}`
const environmentIcon = {
  id: 'environment',
  url: environmentIconUrl,
  width: 24,
  height: 24,
  anchorX: 12,
  anchorY: 24,
  mask: true,
}

const bulbIcon = {
  id: 'room-bulb',
  url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40"><path fill="white" d="M16 2a12 12 0 0 0-8 21c2 2 3 4 3 7h10c0-3 1-5 3-7A12 12 0 0 0 16 2Z"/><path d="m11 13 5 6 5-6M16 19v11" fill="none" stroke="black" stroke-width="2"/><path fill="white" d="M11 32h10v3H11zm2 5h6v2h-6z"/></svg>',
  )}`,
  width: 32,
  height: 40,
  anchorX: 16,
  anchorY: 20,
  mask: true,
}

export type MapFocus = {
  center: LngLat
  key: number
  zoom?: number
  elevation?: number
  bearing?: number
  pitch?: number
  offset?: [number, number]
}

type CampusMapProps = {
  campus: Campus
  buildings: Building[]
  rooms: Room[]
  selectedBuildingId: string | null
  selectedFloor: number
  selectedRoomId: string | null
  activeRoomNames: string[]
  focus: MapFocus | null
  onSelectRoom: (roomId: string) => void
  onSelectBuilding: (buildingId: string) => void
  onSelectCampusGround: () => void
  isRoomLightOn: (roomId: string, lightId: string) => boolean
  onToggleRoomLight: (roomId: string, lightId: string) => void
}

function DeckOverlay(props: MapboxOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay({ ...props, interleaved: false }))
  overlay.setProps(props)
  return null
}

const withZ = (ring: LngLat[], z: number) => ring.map(([x, y]) => [x, y, z] as [number, number, number])

type Slab = { id: string; polygon: [number, number, number][]; elevation: number; current: boolean }

export default function CampusMap({
  campus,
  buildings: BUILDINGS,
  rooms: ROOMS,
  selectedBuildingId,
  selectedFloor,
  selectedRoomId,
  activeRoomNames,
  focus,
  onSelectRoom,
  onSelectBuilding,
  onSelectCampusGround,
  isRoomLightOn,
  onToggleRoomLight,
}: CampusMapProps) {
  const mapRef = useRef<MapRef | null>(null)
  const [hotspotOffset, setHotspotOffset] = useState(0)

  useEffect(() => {
    const startedAt = performance.now()
    let lastUpdate = startedAt
    let frame = 0

    const animate = (now: number) => {
      if (now - lastUpdate >= 50) {
        setHotspotOffset(Math.sin((now - startedAt) / 900) * 0.12)
        lastUpdate = now
      }
      frame = window.requestAnimationFrame(animate)
    }

    frame = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(frame)
  }, [])




  useEffect(() => {
    if (!focus || !mapRef.current) return

    const map = mapRef.current
    const zoom = focus.zoom ?? 19.3

    const building = BUILDINGS.find(
      (item) => item.id === selectedBuildingId,
    )

    let targetElevation: number

    // Uu tien cao do duoc tinh tu phong dang nhan
    if (
      typeof focus.elevation === 'number' &&
      Number.isFinite(focus.elevation)
    ) {
      targetElevation = focus.elevation
    } else if (building) {
      // Chi tinh theo tang khi focus khong co elevation
      const floorIndex = Math.max(0, selectedFloor - 1)

      const floorBase =
        floorIndex *
        building.floorHeight *
        VERTICAL_EXAGGERATION +
        PLATE_THICKNESS * VERTICAL_EXAGGERATION

      const roomHeight =
        building.floorHeight *
        0.7 *
        VERTICAL_EXAGGERATION

      targetElevation = floorBase + roomHeight / 2
    } else {
      targetElevation = 0
    }

    map.setCenterClampedToGround(false)

    map.easeTo({
      center: focus.center,
      zoom,
      elevation: targetElevation,
      offset: focus.offset ?? (selectedRoomId ? [-60, 0] : [0, 0]),
      pitch: focus.pitch ?? (selectedRoomId ? 55 : 58),
      bearing: focus.bearing ?? -25,
      duration: 1800,
      essential: true,
    })
  }, [
    focus,
    BUILDINGS,
    selectedRoomId,
    selectedBuildingId,
    selectedFloor,
  ])


  const layers = useMemo(() => {
    const primary = colors.primary.DEFAULT
    const activeRoomNameSet = new Set(activeRoomNames.map(normalizeRoomCode))
    const selectedBuilding: Building | undefined = BUILDINGS.find((b) => b.id === selectedBuildingId)

    // Các tòa không được chọn: khối nổi tổng thể
    const shells = BUILDINGS.filter((b) => b.id !== selectedBuildingId).map((b) => ({
      building: b,
      polygon: withZ(b.polygon, 0),
      height: b.floors * b.floorHeight * VERTICAL_EXAGGERATION,
    }))

    // Tòa đang chọn: các tầng dưới tầng chọn (mờ) + sàn tầng chọn; tầng trên bị ẩn (cắt lớp)
    const slabs: Slab[] = []
    let visibleRooms: Room[] = []
    let floorBase = 0
    let roomElevation: (r: Room) => number = () => 0
    if (selectedBuilding) {
      const ring = selectedBuilding.polygon
      for (let f = 1; f <= selectedFloor; f++) {
        const base = (f - 1) * selectedBuilding.floorHeight * VERTICAL_EXAGGERATION
        const current = f === selectedFloor
        slabs.push({
          id: `${selectedBuilding.id}-${f}`,
          polygon: withZ(ring, base),
          elevation: current
            ? PLATE_THICKNESS * VERTICAL_EXAGGERATION
            : selectedBuilding.floorHeight * 0.92 * VERTICAL_EXAGGERATION,
          current,
        })
      }

      floorBase =
        (selectedFloor - 1) * selectedBuilding.floorHeight * VERTICAL_EXAGGERATION +
        PLATE_THICKNESS * VERTICAL_EXAGGERATION
      visibleRooms = ROOMS.filter(
        (r) => r.buildingId === selectedBuildingId && r.floor === selectedFloor,
      )
      const fh = selectedBuilding.floorHeight
      roomElevation = (r: Room) =>
        (fh * 0.7 + (r.id === selectedRoomId ? 1.5 : 0)) * VERTICAL_EXAGGERATION
    }

    const boundary = campus.boundary
    const openRoom = visibleRooms.find((r) => r.id === selectedRoomId)
    const lights = visibleRooms.flatMap((room) =>
      room.lights.map((light) => ({
        ...light,
        room,
        position: [...light.position, floorBase + roomElevation(room) * 0.5] as [number, number, number],
      })),
    )
    type LightDatum = Omit<RoomLight, 'position'> & { room: Room; position: [number, number, number] }
    const walls = openRoom ? openRoom.polygon.map((point, index, ring) => {
      const next = ring[(index + 1) % ring.length]
      const top = floorBase + roomElevation(openRoom)
      return {
        polygon: [
          [...point, floorBase], [...next, floorBase], [...next, top], [...point, top],
        ] as [number, number, number][]
      }
    }) : []
    const boundaryClosed = [...boundary, boundary[0]]
    const nameAnchor: [number, number, number] = [
      (boundary[0][0] + boundary[1][0]) / 2,
      boundary[2][1],
      0.5,
    ]

    return [
      new PolygonLayer({
        id: 'campus-ground',
        data: [{ polygon: withZ(boundary, 0) }],
        extruded: true,
        getPolygon: (d) => d.polygon,
        getElevation: 0.3,
        getFillColor: hexToRgba(colors.primary.light, 150),
        pickable: true,
        onClick: () => onSelectCampusGround(),
        material: false,
      }),
      new PolygonLayer({
        id: 'campus-walkway',
        data: campus.walkway ? [{ polygon: withZ(campus.walkway, 0.3) }] : [],
        extruded: true,
        getPolygon: (d) => d.polygon,
        getElevation: 0.1,
        getFillColor: hexToRgba('#ffffff', 230),
        material: false,
      }),
      new PathLayer({
        id: 'campus-border',
        data: [{ path: boundaryClosed.map(([x, y]) => [x, y, 0.5]) }],
        getPath: (d) => d.path as [number, number, number][],
        getColor: hexToRgba(primary, 235),
        widthUnits: 'pixels',
        getWidth: 3,
        jointRounded: true,
        capRounded: true,
      }),
      new TextLayer({
        id: 'campus-name',
        data: [{ position: nameAnchor }],
        characterSet: 'auto',
        fontFamily: FONT_FAMILY,
        fontWeight: 700,
        getPosition: (d) => d.position,
        getText: () => campus.name,
        getSize: 13,
        getColor: hexToRgba(colors.primary.dark),
        getPixelOffset: [0, -14],
        background: true,
        getBackgroundColor: hexToRgba('#ffffff', 235),
        backgroundPadding: [8, 4],
        billboard: true,
      }),
      new PolygonLayer({
        id: 'building-shells',
        data: shells,
        extruded: true,
        wireframe: true,
        getPolygon: (d) => d.polygon,
        getElevation: (d) => d.height,
        getFillColor: hexToRgba(primary, 170),
        getLineColor: hexToRgba('#ffffff', 220),
        lineWidthMinPixels: 1,
        pickable: true,
        autoHighlight: true,
        highlightColor: hexToRgba(colors.primary.hover, 220),
        onClick: (info) => info.object && onSelectBuilding(info.object.building.id),
      }),
      new PolygonLayer({
        id: 'floor-slabs',
        data: slabs,
        extruded: true,
        wireframe: true,
        getPolygon: (d) => d.polygon,
        getElevation: (d) => d.elevation,
        getFillColor: (d) =>
          d.current ? hexToRgba('#ffffff', 245) : hexToRgba(colors.primary.light, 130),
        getLineColor: hexToRgba(primary, 120),
        lineWidthMinPixels: 1,
      }),
      new PolygonLayer({
        id: 'rooms',
        data: visibleRooms.filter((r) => r.id !== selectedRoomId),
        extruded: true,
        wireframe: true,
        getPolygon: (r) => withZ(r.polygon, floorBase),
        getElevation: roomElevation,
        getFillColor: (r) =>
          hexToRgba(
            activeRoomNameSet.has(normalizeRoomCode(r.code))
              ? '#1677ff'
              : ROOM_STATE_META[getRoomState(r)].color,
            r.id === selectedRoomId ? 255 : 215,
          ),
        getLineColor: (r) =>
          r.id === selectedRoomId ? hexToRgba('#ffffff', 255) : hexToRgba('#ffffff', 160),
        lineWidthMinPixels: 1.5,
        pickable: true,
        autoHighlight: true,
        highlightColor: hexToRgba('#ffffff', 90),
        onClick: (info) => info.object && onSelectRoom(info.object.id),
        updateTriggers: {
          getFillColor: [selectedRoomId, activeRoomNames],
          getLineColor: [selectedRoomId],
          getElevation: [selectedRoomId],
        },
      }),
      new PolygonLayer<Room>({
        id: 'open-room-floor',
        data: openRoom ? [openRoom] : [],
        stroked: false,
        getPolygon: (r) => withZ(r.polygon, floorBase + 0.05),
        getFillColor: (r) =>
          hexToRgba(
            activeRoomNameSet.has(normalizeRoomCode(r.code))
              ? '#1677ff'
              : ROOM_STATE_META[getRoomState(r)].color,
            130,
          ),
        pickable: true,
        onClick: (info) => info.object && onSelectRoom(info.object.id),
      }),
      new PolygonLayer({
        id: 'open-room-walls',
        data: walls,
        getPolygon: (d) => d.polygon,
        getFillColor: openRoom ? hexToRgba(ROOM_STATE_META[getRoomState(openRoom)].color, 65) : [0, 0, 0, 0],
        stroked: true,
        getLineColor: hexToRgba(colors.primary.DEFAULT, 130),
        lineWidthMinPixels: 1,
        parameters: { depthWriteEnabled: false, cullMode: 'none' },
      }),
      new TextLayer({
        id: 'room-labels',
        data: visibleRooms,
        characterSet: 'auto',
        fontFamily: FONT_FAMILY,
        fontWeight: 700,
        getPosition: (r) =>
          [...r.center, floorBase + roomElevation(r) + 0.6 + hotspotOffset] as [number, number, number],
        getText: (r) => r.code,
        getSize: 14,
        getColor: hexToRgba(colors.text.primary),
        background: true,
        getBackgroundColor: hexToRgba('#ffffff', 235),
        backgroundPadding: [6, 3],
        billboard: true,
        pickable: true,
        onClick: (info) => info.object && onSelectRoom(info.object.id),
        updateTriggers: { getPosition: [selectedRoomId, hotspotOffset] },
      }),
      new ScatterplotLayer<LightDatum>({
        id: 'room-light-glow',
        data: lights,
        getPosition: (light) => light.position,
        getRadius: (light) => isRoomLightOn(light.room.id, light.id) ? 22 : 0,
        radiusUnits: 'pixels',
        getFillColor: hexToRgba(colors.warning.DEFAULT, 75),
        billboard: true,
        pickable: false,
        updateTriggers: {
          getPosition: [selectedRoomId, floorBase],
          getRadius: [isRoomLightOn],
        },
      }),
      new IconLayer<LightDatum>({
        id: 'room-light-bulbs',
        data: lights,
        getIcon: () => bulbIcon,
        getPosition: (light) => light.position,
        getSize: 36,
        sizeUnits: 'pixels',
        getColor: (light) => hexToRgba(isRoomLightOn(light.room.id, light.id) ? colors.warning.DEFAULT : colors.text.secondary),
        billboard: true,
        pickable: true,
        onClick: (info) => {
          if (!info.object) return
          onToggleRoomLight(info.object.room.id, info.object.id)
          onSelectRoom(info.object.room.id)
        },
        updateTriggers: {
          getPosition: [selectedRoomId, hotspotOffset],
          getColor: [isRoomLightOn],
        },
      }),
      new TextLayer({
        id: 'building-labels',
        data: BUILDINGS,
        characterSet: 'auto',
        fontFamily: FONT_FAMILY,
        fontWeight: 700,
        getPosition: (b) =>
          [...b.center, b.floors * b.floorHeight * VERTICAL_EXAGGERATION + 4 + hotspotOffset] as [number, number, number],
        getText: (b) => b.name,
        getSize: 16,
        getColor: hexToRgba('#ffffff'),
        background: true,
        getBackgroundColor: hexToRgba(colors.primary.dark, 235),
        backgroundPadding: [8, 4],
        billboard: true,
        pickable: true,
        onClick: (info) => info.object && onSelectBuilding(info.object.id),
        updateTriggers: { getPosition: [hotspotOffset] },
      }),
      new IconLayer({
        id: 'building-hotspots',
        data: BUILDINGS,
        getIcon: () => environmentIcon,
        getPosition: (b) =>
          [...b.center, b.floors * b.floorHeight * VERTICAL_EXAGGERATION + 4 + hotspotOffset] as [number, number, number],
        getSize: 24,
        sizeUnits: 'pixels',
        getColor: hexToRgba(colors.primary.dark),
        getPixelOffset: [0, -36],
        billboard: true,
        pickable: true,
        onClick: (info) => info.object && onSelectBuilding(info.object.id),
        updateTriggers: { getPosition: [hotspotOffset] },
      }),
    ]
  }, [
    campus,
    BUILDINGS,
    ROOMS,
    selectedBuildingId,
    selectedFloor,
    selectedRoomId,
    activeRoomNames,
    hotspotOffset,
    onSelectRoom,
    onSelectBuilding,
    onSelectCampusGround,
    isRoomLightOn,
    onToggleRoomLight,
  ])

  return (
    <MapGL
      ref={mapRef}
      initialViewState={{
        longitude: campus.center[0],
        latitude: campus.center[1],
        zoom: campus.zoom - 1,
        pitch: 45,
        bearing: -25,
      }}
      maxPitch={75}
      maxZoom={22}
      mapStyle={MAP_STYLE}
      style={{ width: '100%', height: '100%' }}
    >
      <DeckOverlay layers={layers} />
    </MapGL>
  )
}
