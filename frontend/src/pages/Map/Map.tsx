import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Card, Flex, Select, Spin } from 'antd'
import CampusMap, { type MapFocus } from '../../components/map/CampusMap'
import BuildingSelector from '../../components/map/BuildingSelector'
import FloorSelector from '../../components/map/FloorSelector'
import RoomListPanel from '../../components/map/RoomListPanel'
import RoomDetailCard from '../../components/map/RoomDetailCard'
import MapLegend from '../../components/map/MapLegend'
import { loadCampusDataset, type CampusDataset } from '../../data/campusData'

export default function Map() {
  const [dataset, setDataset] = useState<CampusDataset | null>(null)
  const [campusId, setCampusId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [roomLights, setRoomLights] = useState<Record<string, boolean>>({})
  const toggleRoomLight = useCallback((campusId: string, roomId: string, lightId: string) => {
    const key = `${campusId}:${roomId}:${lightId}`
    setRoomLights((previous) => ({ ...previous, [key]: !previous[key] }))
  }, [])

  useEffect(() => {
    loadCampusDataset().then((d) => {
      setDataset(d)
      setCampusId(d.campuses[0]?.id ?? null)
    }).catch((error: unknown) => {
      setLoadError(error instanceof Error ? error.message : 'Không thể tải dữ liệu bản đồ')
    })
  }, [])

  if (loadError) return <Alert type="error" title="Lỗi dữ liệu bản đồ" description={loadError} showIcon />
  if (!dataset || !campusId) {
    return (
      <Flex justify="center" align="center" style={{ height: 300 }}>
        <Spin />
      </Flex>
    )
  }

  return (
    <CampusView
      key={campusId}
      dataset={dataset}
      campusId={campusId}
      onChangeCampus={setCampusId}
      roomLights={roomLights}
      onToggleRoomLight={toggleRoomLight}
    />
  )
}

type ViewProps = {
  dataset: CampusDataset
  campusId: string
  onChangeCampus: (id: string) => void
  roomLights: Readonly<Record<string, boolean>>
  onToggleRoomLight: (campusId: string, roomId: string, lightId: string) => void
}

function CampusView({ dataset, campusId, onChangeCampus, roomLights, onToggleRoomLight }: ViewProps) {
  const campus = dataset.campuses.find((c) => c.id === campusId)!
  const buildings = useMemo(() => dataset.buildings.filter((b) => b.campusId === campusId), [dataset, campusId])
  const rooms = useMemo(() => dataset.rooms.filter((r) => r.campusId === campusId), [dataset, campusId])

  // Mặc định chưa chọn tòa nào: hiển thị toàn khuôn viên
  const [buildingId, setBuildingId] = useState<string | null>(null)
  const [floor, setFloor] = useState(1)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [focus, setFocus] = useState<MapFocus | null>(null)

  const building = buildings.find((b) => b.id === buildingId) ?? null
  const selectedRoom = rooms.find((r) => r.id === roomId) ?? null
  const isRoomLightOn = useCallback(
    (id: string, lightId: string) => roomLights[`${campusId}:${id}:${lightId}`] ?? false,
    [campusId, roomLights],
  )
  const toggleLight = useCallback(
    (id: string, lightId: string) => onToggleRoomLight(campusId, id, lightId),
    [campusId, onToggleRoomLight],
  )

  const selectRoom = useCallback(
    (id: string) => {
      const room = rooms.find((r) => r.id === id)
      if (!room) return
      setBuildingId(room.buildingId)
      setFloor(room.floor)
      setRoomId(room.id)
      setFocus({ center: room.center, key: Date.now() })
    },
    [rooms],
  )

  const selectBuilding = useCallback(
    (id: string) => {
      const target = buildings.find((b) => b.id === id)
      if (!target) return
      setBuildingId(id)
      setFloor(1)
      setRoomId(null)
      setFocus({ center: target.center, key: Date.now() })
    },
    [buildings],
  )

  const selectNone = useCallback(() => {
    setBuildingId(null)
    setFloor(1)
    setRoomId(null)
    setFocus({ center: campus.center, zoom: campus.zoom, key: Date.now() })
  }, [campus])

  const selectFloor = (f: number) => {
    if (!building) return
    setFloor(f)
    if (selectedRoom && selectedRoom.floor !== f) setRoomId(null)
    setFocus({ center: building.center, key: Date.now() })
  }

  return (
    <Flex
      style={{
        position: 'relative',
        height: 'calc(100vh - 190px)',
        minHeight: 520,
        borderRadius: 16,
        overflow: 'hidden',
      }}
    >
      <Flex style={{ position: 'absolute', inset: 0 }}>
        <CampusMap
          campus={campus}
          buildings={buildings}
          rooms={rooms}
          selectedBuildingId={buildingId}
          selectedFloor={floor}
          selectedRoomId={roomId}
          focus={focus}
          onSelectRoom={selectRoom}
          onSelectBuilding={selectBuilding}
          onSelectNone={selectNone}
          isRoomLightOn={isRoomLightOn}
          onToggleRoomLight={toggleLight}
        />
      </Flex>

      <Flex
        vertical
        gap={12}
        style={{ position: 'absolute', top: 16, left: 16, bottom: 16, width: 300, zIndex: 2 }}
      >
        {dataset.campuses.length > 1 && (
          <Card className="glass" size="small" styles={{ body: { padding: 8 } }}>
            <Select
              style={{ width: '100%' }}
              value={campusId}
              onChange={onChangeCampus}
              options={dataset.campuses.map((c) => ({ label: c.name, value: c.id }))}
            />
          </Card>
        )}
        <BuildingSelector buildings={buildings} value={buildingId} onChange={selectBuilding} onReset={selectNone} />
        <RoomListPanel
          rooms={rooms}
          buildings={buildings}
          selectedRoomId={roomId}
          onSelectRoom={selectRoom}
        />
      </Flex>

      {building && (
        <Flex style={{ position: 'absolute', top: '50%', right: 16, transform: 'translateY(-50%)', zIndex: 2 }}>
          <FloorSelector floors={building.floors} value={floor} onChange={selectFloor} />
        </Flex>
      )}

      {selectedRoom && (
        <Flex style={{ position: 'absolute', right: 84, bottom: 16, width: 320, zIndex: 2 }}>
          <RoomDetailCard
            room={selectedRoom}
            buildingName={building?.name ?? ''}
            isLightOn={(lightId) => isRoomLightOn(selectedRoom.id, lightId)}
            onToggleLight={(lightId) => toggleLight(selectedRoom.id, lightId)}
            onClose={() => setRoomId(null)}
          />
        </Flex>
      )}

      <Flex style={{ position: 'absolute', left: 332, bottom: 16, zIndex: 2 }}>
        <MapLegend />
      </Flex>
    </Flex>
  )
}
