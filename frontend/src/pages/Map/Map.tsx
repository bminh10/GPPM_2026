import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Card, Flex, Spin, Tag, Typography } from 'antd'
import CampusMap, { type MapFocus } from '../../components/map/CampusMap'
import BuildingSelector from '../../components/map/BuildingSelector'
import FloorSelector from '../../components/map/FloorSelector'
import RoomListPanel from '../../components/map/RoomListPanel'
import RoomDetailCard, { type ActiveRoomClass } from '../../components/map/RoomDetailCard'
import MapLegend from '../../components/map/MapLegend'
import { loadCampusDataset, type CampusDataset } from '../../data/campusData'
import { useRoomLighting } from '../../hooks/useRoomLighting'
import { lightAddress } from '../../services/LightingService'
import { useAuth } from '../../store/authStore'
import SearchFilterSelect from '../../components/common/SearchFilterSelect'
import { apiClient, getErrorMessage } from '../../services/apiClient'

type SemesterOption = { id: number; name: string; start_date: string; end_date: string }
type CampusOption = { id: number; name: string; address: string | null }

function localDateTime(value: Date) {
  const date = [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-')
  const time = [
    String(value.getHours()).padStart(2, '0'),
    String(value.getMinutes()).padStart(2, '0'),
    String(value.getSeconds()).padStart(2, '0'),
  ].join(':')
  return { date, time }
}

export default function Map() {
  const [dataset, setDataset] = useState<CampusDataset | null>(null)
  const [campusId, setCampusId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [semesters, setSemesters] = useState<SemesterOption[]>([])
  const [campusOptions, setCampusOptions] = useState<CampusOption[]>([])
  const [selectedSemesterId, setSelectedSemesterId] = useState<number>()
  const [referenceError, setReferenceError] = useState<string | null>(null)
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
    void Promise.all([
      apiClient.get<SemesterOption[]>('/semesters'),
      apiClient.get<CampusOption[]>('/campus/all'),
    ]).then(([semesterResponse, campusResponse]) => {
      setSemesters(semesterResponse.data)
      setCampusOptions(campusResponse.data)
      const today = localDateTime(new Date()).date
      const currentSemester = semesterResponse.data.find(
        (semester) => semester.start_date <= today && semester.end_date >= today,
      )
      setSelectedSemesterId(currentSemester?.id ?? semesterResponse.data[0]?.id)
    }).catch((error: unknown) => {
      setReferenceError(getErrorMessage(error))
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
      {referenceError && (
        <Alert type="error" showIcon title="Không tải được dữ liệu học kỳ/cơ sở" description={referenceError} />
      )}
      <Alert type="info" showIcon title="Đèn IoT mô phỏng · Trạng thái chỉ được xác nhận sau khi ESP32 báo về. Thiết bị cần chạy Wokwi." />
      <Card size="small">
        <Flex align="center" justify="space-between" gap={16} wrap>
          <Flex align="center" gap={8}>
            <Typography.Text strong>Học kỳ:</Typography.Text>
            <SearchFilterSelect
              aria-label="Chọn học kỳ xem lịch phòng"
              value={selectedSemesterId}
              onChange={setSelectedSemesterId}
              options={semesters.map((semester) => ({ value: semester.id, label: semester.name }))}
              placeholder="Chọn học kỳ"
              style={{ width: 280 }}
              disabled={semesters.length === 0}
            />
          </Flex>
          <Flex align="center" gap={8}>
            <Tag color="#1677ff">Đang có lớp</Tag>
            <Typography.Text type="secondary">
              Tình trạng phòng theo giờ hiện tại · tự cập nhật mỗi 30 giây
            </Typography.Text>
          </Flex>
        </Flex>
      </Card>
    <CampusView
      key={campusId}
      dataset={dataset}
      campusId={campusId}
      onChangeCampus={setCampusId}
      campusOptions={campusOptions}
      semesterId={selectedSemesterId}
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
  campusOptions: CampusOption[]
  semesterId: number | undefined
  lighting: ReturnType<typeof useRoomLighting>
  canControl: boolean
}

function CampusView({
  dataset,
  campusId,
  onChangeCampus,
  campusOptions,
  semesterId,
  lighting,
  canControl,
}: ViewProps) {
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
  const [currentClasses, setCurrentClasses] = useState<ActiveRoomClass[]>([])
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [scheduleLoading, setScheduleLoading] = useState(true)

  const databaseCampusId = useMemo(() => {
    const aliases =
      campusId === 'CS1'
        ? ['vo van tan']
        : campusId === 'CS3'
          ? ['nha be', 'nhon duc']
          : []
    const normalize = (value: string) =>
      value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase()
    return campusOptions.find((option) => {
      const value = normalize(`${option.name} ${option.address ?? ''}`)
      return aliases.some((alias) => value.includes(alias))
    })?.id
  }, [campusId, campusOptions])
  const visibleCurrentClasses =
    semesterId !== undefined && databaseCampusId !== undefined ? currentClasses : []
  const statusError =
    databaseCampusId === undefined
      ? `Không tìm thấy cơ sở ${campus.name} trong danh mục cơ sở của database.`
      : scheduleError

  useEffect(() => {
    if (semesterId === undefined) {
      return
    }
    if (databaseCampusId === undefined) {
      return
    }

    let active = true
    const loadRoomStatus = async () => {
      const { date, time } = localDateTime(new Date())
      try {
        const { data } = await apiClient.get<ActiveRoomClass[]>('/schedules/room-status', {
          params: {
            semester_id: semesterId,
            campus_id: databaseCampusId,
            date,
            time,
          },
        })
        if (active) {
          setCurrentClasses(data)
          setScheduleError(null)
        }
      } catch (error: unknown) {
        if (active) {
          setCurrentClasses([])
          setScheduleError(getErrorMessage(error))
        }
      } finally {
        if (active) setScheduleLoading(false)
      }
    }

    void loadRoomStatus()
    const intervalId = window.setInterval(() => {
      setScheduleLoading(true)
      void loadRoomStatus()
    }, 30_000)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [databaseCampusId, semesterId])

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
      {statusError && (
        <Alert
          type="error"
          showIcon
          title="Không tải được trạng thái lớp học"
          description={statusError}
          style={{ position: 'absolute', top: 16, right: 16, zIndex: 3, maxWidth: 420 }}
        />
      )}
      <Flex style={{ position: 'absolute', inset: 0 }}>
        <CampusMap
          campus={campus}
          buildings={buildings}
          rooms={rooms}
          selectedBuildingId={buildingId}
          selectedFloor={floor}
          selectedRoomId={roomId}
          activeRoomNames={visibleCurrentClasses.map((item) => item.room_name)}
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
            currentClasses={visibleCurrentClasses.filter(
              (item) => item.room_name.toLocaleUpperCase() === selectedRoom.code.toLocaleUpperCase(),
            )}
            scheduleLoading={scheduleLoading}
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
