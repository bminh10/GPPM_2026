import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Card, Flex, Spin } from 'antd'
import CampusMap, { type MapFocus } from '../../components/map/CampusMap'
import BuildingSelector from '../../components/map/BuildingSelector'
import FloorSelector from '../../components/map/FloorSelector'
import RoomListPanel from '../../components/map/RoomListPanel'
import RoomDetailCard from '../../components/map/RoomDetailCard'
import MapLegend from '../../components/map/MapLegend'
import { loadCampusDataset, type CampusDataset } from '../../data/campusData'
import { useRoomLighting } from '../../hooks/useRoomLighting'
import { lightAddress } from '../../services/LightingService'
import { useAuth } from '../../store/authStore'
import SearchFilterSelect from '../../components/common/SearchFilterSelect'

export default function Map() {
  const [dataset, setDataset] = useState<CampusDataset | null>(null)
  const [campusId, setCampusId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const lighting = useRoomLighting()
  const { user } = useAuth()
  const canControl = ['admin', 'superadmin'].includes(user?.role?.replace(/\s/g, '').toLowerCase() ?? '')

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
    <Flex vertical gap={8}>
      {lighting.error && <Alert type="error" showIcon title="Không đồng bộ được đèn" description={lighting.error} />}
      <Alert type="info" showIcon title="Đèn IoT mô phỏng · Trạng thái chỉ được xác nhận sau khi ESP32 báo về. Thiết bị cần chạy Wokwi." />
    <CampusView
      key={campusId}
      dataset={dataset}
      campusId={campusId}
      onChangeCampus={setCampusId}
      lighting={lighting}
      canControl={canControl}
    />
    </Flex>
  )
}

type ViewProps = {
  dataset: CampusDataset
  campusId: string
  onChangeCampus: (id: string) => void
  lighting: ReturnType<typeof useRoomLighting>
  canControl: boolean
}

function CampusView({ dataset, campusId, onChangeCampus, lighting, canControl }: ViewProps) {
  const campus = dataset.campuses.find((c) => c.id === campusId)!
  const buildings = useMemo(() => dataset.buildings.filter((b) => b.campusId === campusId), [dataset, campusId])
  const rooms = useMemo(() => {
    const campusRooms = dataset.rooms.filter((room) => room.campusId === campusId)
    const reportedLights = Object.values(lighting.lights).filter((light) => light.campus_id === campusId)

    return campusRooms.map((room) => {
      const roomLights = reportedLights
        .filter((light) => light.room_id === room.id)
        .map((light, index, matches) => {
          const longitudes = room.polygon.map(([longitude]) => longitude)
          const longitude = Math.min(...longitudes) +
            ((index + 1) / (matches.length + 1)) * (Math.max(...longitudes) - Math.min(...longitudes))
          return {
            id: light.light_id,
            name: light.light_id,
            position: [longitude, room.center[1]] as [number, number],
          }
        })
      const configuredIds = new Set(room.lights.map((light) => light.id))
      return {
        ...room,
        lights: [
          ...room.lights,
          ...roomLights.filter((light) => !configuredIds.has(light.id)),
        ],
      }
    })
  }, [dataset, campusId, lighting.lights])

  // Mặc định chưa chọn tòa nào: hiển thị toàn khuôn viên
  const [buildingId, setBuildingId] = useState<string | null>(null)
  const [floor, setFloor] = useState(1)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [focus, setFocus] = useState<MapFocus | null>(null)

  const building = buildings.find((b) => b.id === buildingId) ?? null
  const selectedRoom = rooms.find((r) => r.id === roomId) ?? null
  const isRoomLightOn = useCallback(
    (id: string, lightId: string) => lighting.lights[lightAddress(campusId, id, lightId)]?.reported_on ?? false,
    [campusId, lighting.lights],
  )
  const toggleLight = useCallback(
    (id: string, lightId: string) => {
      if (canControl) void lighting.toggle(campusId, id, lightId)
    },
    [campusId, canControl, lighting],
  )

  const selectRoom = useCallback(
    (id: string) => {
      const room = rooms.find((r) => r.id === id)
      if (!room) return
      const roomBuilding = buildings.find((item) => item.id === room.buildingId)
      setBuildingId(room.buildingId)
      setFloor(room.floor)
      setRoomId(room.id)
      setFocus({
        center: room.center,
        key: Date.now(),
        zoom: 20.7,
        elevation: roomBuilding
          ? (room.floor - 1) * roomBuilding.floorHeight * 2.5 +
            0.4 * 2.5 +
            (roomBuilding.floorHeight * 0.7 + 1.5) * 2.5 / 2
          : undefined,
      })
    },
    [buildings, rooms],
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
    setFocus({
      center: building.center,
      key: Date.now(),
      elevation: (f - 1 + 0.5) * building.floorHeight * 2.5,
    })
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
            <SearchFilterSelect
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
        <Flex style={{ position: 'absolute', right: 84, bottom: 16, width: 350, maxHeight: 'calc(100% - 32px)', overflowY: 'auto', zIndex: 2 }}>
          <RoomDetailCard
            room={selectedRoom}
            buildingName={building?.name ?? ''}
            isLightOn={(lightId) => isRoomLightOn(selectedRoom.id, lightId)}
            onToggleLight={(lightId) => toggleLight(selectedRoom.id, lightId)}
            getLightStatus={(lightId) => lighting.lights[lightAddress(campusId, selectedRoom.id, lightId)]}
            isSending={(lightId) => lighting.sending.has(lightAddress(campusId, selectedRoom.id, lightId))}
            canControl={canControl && !lighting.error}
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
