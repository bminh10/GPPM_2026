import { useEffect, useMemo, useRef, useState } from 'react'
import MapGL, { useControl, type MapRef } from 'react-map-gl/maplibre'
import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox'
import { IconLayer, PathLayer, PolygonLayer, TextLayer } from '@deck.gl/layers'
import EnvironmentOutlined from '@ant-design/icons-svg/es/asn/EnvironmentOutlined'
import 'maplibre-gl/dist/maplibre-gl.css'
import { colors, hexToRgba } from '../../theme/colors'
import {
  ROOM_STATE_META,
  getRoomState,
  type Building,
  type Campus,
  type LngLat,
  type Room,
} from '../../data/campusData'

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
const PLATE_THICKNESS = 0.4
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

export type MapFocus = { center: LngLat; key: number; zoom?: number }

type CampusMapProps = {
  campus: Campus
  buildings: Building[]
  rooms: Room[]
  selectedBuildingId: string | null
  selectedFloor: number
  selectedRoomId: string | null
  focus: MapFocus | null
  onSelectRoom: (roomId: string) => void
  onSelectBuilding: (buildingId: string) => void
  onSelectNone: () => void
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
  focus,
  onSelectRoom,
  onSelectBuilding,
  onSelectNone,
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
    if (!focus) return
    mapRef.current?.flyTo({
      center: focus.center,
      zoom: focus.zoom ?? 19.3,
      pitch: 58,
      bearing: -25,
      duration: 1400,
      essential: true,
    })
  }, [focus])

  const layers = useMemo(() => {
    const primary = colors.primary.DEFAULT
    const selectedBuilding: Building | undefined = BUILDINGS.find((b) => b.id === selectedBuildingId)

    // Các tòa không được chọn: khối nổi tổng thể
    const shells = BUILDINGS.filter((b) => b.id !== selectedBuildingId).map((b) => ({
      building: b,
      polygon: withZ(b.polygon, 0),
      height: b.floors * b.floorHeight,
    }))

    // Tòa đang chọn: các tầng dưới tầng chọn (mờ) + sàn tầng chọn; tầng trên bị ẩn (cắt lớp)
    const slabs: Slab[] = []
    let visibleRooms: Room[] = []
    let floorBase = 0
    let roomElevation: (r: Room) => number = () => 0
    if (selectedBuilding) {
      const ring = selectedBuilding.polygon
      for (let f = 1; f <= selectedFloor; f++) {
        const base = (f - 1) * selectedBuilding.floorHeight
        const current = f === selectedFloor
        slabs.push({
          id: `${selectedBuilding.id}-${f}`,
          polygon: withZ(ring, base),
          elevation: current ? PLATE_THICKNESS : selectedBuilding.floorHeight * 0.92,
          current,
        })
      }

      floorBase = (selectedFloor - 1) * selectedBuilding.floorHeight + PLATE_THICKNESS
      visibleRooms = ROOMS.filter(
        (r) => r.buildingId === selectedBuildingId && r.floor === selectedFloor,
      )
      const fh = selectedBuilding.floorHeight
      roomElevation = (r: Room) => fh * 0.7 + (r.id === selectedRoomId ? 1.5 : 0)
    }

    const boundary = campus.boundary
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
        onClick: () => onSelectNone(),
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
        fontFamily: 'Inter, Segoe UI, sans-serif',
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
        data: visibleRooms,
        extruded: true,
        wireframe: true,
        getPolygon: (r) => withZ(r.polygon, floorBase),
        getElevation: roomElevation,
        getFillColor: (r) =>
          hexToRgba(ROOM_STATE_META[getRoomState(r)].color, r.id === selectedRoomId ? 255 : 215),
        getLineColor: (r) =>
          r.id === selectedRoomId ? hexToRgba('#ffffff', 255) : hexToRgba('#ffffff', 160),
        lineWidthMinPixels: 1.5,
        pickable: true,
        autoHighlight: true,
        highlightColor: hexToRgba('#ffffff', 90),
        onClick: (info) => info.object && onSelectRoom(info.object.id),
        updateTriggers: {
          getFillColor: [selectedRoomId],
          getLineColor: [selectedRoomId],
          getElevation: [selectedRoomId],
        },
      }),
      new TextLayer({
        id: 'room-labels',
        data: visibleRooms,
        characterSet: 'auto',
        fontFamily: 'Inter, Segoe UI, sans-serif',
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
      new IconLayer({
        id: 'room-hotspots',
        data: visibleRooms,
        getIcon: () => environmentIcon,
        getPosition: (r) =>
          [...r.center, floorBase + roomElevation(r) + 0.6 + hotspotOffset] as [number, number, number],
        getSize: 24,
        sizeUnits: 'pixels',
        getColor: hexToRgba(colors.primary.dark),
        getPixelOffset: [0, -20],
        billboard: true,
        pickable: true,
        onClick: (info) => info.object && onSelectRoom(info.object.id),
        updateTriggers: { getPosition: [selectedRoomId, hotspotOffset] },
      }),
      new TextLayer({
        id: 'building-labels',
        data: BUILDINGS,
        characterSet: 'auto',
        fontFamily: 'Inter, Segoe UI, sans-serif',
        fontWeight: 700,
        getPosition: (b) =>
          [...b.center, b.floors * b.floorHeight + 4 + hotspotOffset] as [number, number, number],
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
          [...b.center, b.floors * b.floorHeight + 4 + hotspotOffset] as [number, number, number],
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
    hotspotOffset,
    onSelectRoom,
    onSelectBuilding,
    onSelectNone,
  ])

  return (
    <MapGL
      ref={mapRef}
      initialViewState={{
        longitude: campus.center[0],
        latitude: campus.center[1],
        zoom: campus.zoom,
        pitch: 58,
        bearing: -25,
      }}
      maxPitch={75}
      maxZoom={21}
      mapStyle={MAP_STYLE}
      style={{ width: '100%', height: '100%' }}
    >
      <DeckOverlay layers={layers} />
    </MapGL>
  )
}
