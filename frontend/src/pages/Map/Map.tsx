import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Card, Flex, Input, Spin, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useLocation } from 'react-router-dom'
import CampusMap, { type MapFocus } from '../../components/map/CampusMap'
import BuildingSelector from '../../components/map/BuildingSelector'
import FloorSelector from '../../components/map/FloorSelector'
import RoomListPanel from '../../components/map/RoomListPanel'
import RoomDetailCard, { type ActiveRoomClass } from '../../components/map/RoomDetailCard'
import MapLegend from '../../components/map/MapLegend'
import {
  loadCampusDataset,
  normalizeRoomCode,
  type Building,
  type CampusDataset,
} from '../../data/campusData'
import { useRoomLighting } from '../../hooks/useRoomLighting'
import { lightAddress } from '../../services/LightingService'
import { useAuth } from '../../store/authStore'
import { getAppRole } from '../../routes/roleAccess'
import SearchFilterSelect from '../../components/common/SearchFilterSelect'
import { placeRoomLights } from '../../data/roomLighting'
import { apiClient, getErrorMessage } from '../../services/apiClient'

type CampusOption = { id: number; name: string; address: string | null }
type SemesterOption = { id: number; name: string; start_date: string; end_date: string }
type DatabaseRoom = {
  id: number
  name: string
  building: string | null
  capacity: number
  is_thuc_hanh: boolean
  campus_id: number
}
const EMPTY_CURRENT_CLASSES: ActiveRoomClass[] = []
const EMPTY_DATABASE_ROOMS: DatabaseRoom[] = []

function bearingTowardNearestBuilding(
  target: Building,
  buildings: Building[],
): number | undefined {
  const nearestBuilding = buildings
    .filter((building) => building.id !== target.id)
    .sort((left, right) => {
      const distance = (building: Building) =>
        Math.hypot(
          (building.center[0] - target.center[0]) *
            Math.cos((target.center[1] * Math.PI) / 180),
          building.center[1] - target.center[1],
        )
      return distance(left) - distance(right)
    })[0]

  if (!nearestBuilding) return undefined
  return (
    (Math.atan2(
      (nearestBuilding.center[0] - target.center[0]) *
        Math.cos((target.center[1] * Math.PI) / 180),
      nearestBuilding.center[1] - target.center[1],
    ) *
      180) /
    Math.PI
  )
}

function localDate(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-')
}

function focusRoomAt(
  longitude: number,
  latitude: number,
  floor: number,
  buildingId: string,
  databaseRoomId: number | undefined,
  buildings: Building[],
): MapFocus {
  const roomBuilding = buildings.find((item) => item.id === buildingId)
  const roomBearing = roomBuilding
    ? (Math.atan2(
        (longitude - roomBuilding.center[0]) *
          Math.cos((latitude * Math.PI) / 180),
        latitude - roomBuilding.center[1],
      ) *
        180) /
      Math.PI
    : undefined

  return {
    center: [longitude, latitude],
    key: databaseRoomId ?? 0,
    zoom: 18.7,
    pitch: 40,
    bearing: roomBearing,
    offset: [-60, 0],
    elevation: roomBuilding
      ? (floor - 1) * roomBuilding.floorHeight * 2.5 +
        0.4 * 2.5 +
        (roomBuilding.floorHeight * 0.7 + 1.5) * 2.5 / 2
      : undefined,
  }
}

export default function Map() {
  const [mapIntent] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return {
      campusId: params.get('campus'),
      roomName: params.get('room'),
      date: params.get('date'),
    }
  })
  const [dataset, setDataset] = useState<CampusDataset | null>(null)
  const [campusId, setCampusId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(() =>
    mapIntent.date ?? localDate(new Date()),
  )
  const [loadError, setLoadError] = useState<string | null>(null)
  const [campusOptions, setCampusOptions] = useState<CampusOption[]>([])
  const [semesters, setSemesters] = useState<SemesterOption[]>([])
  const [selectedSemesterId, setSelectedSemesterId] = useState<number>()
  const [referenceError, setReferenceError] = useState<string | null>(null)
  const lighting = useRoomLighting()
  const { user } = useAuth()
  const canControl = ['admin', 'super_admin', 'technician'].includes(getAppRole(user?.role))

  useEffect(() => {
    loadCampusDataset().then((d) => {
      setDataset(d)
      const requestedCampus = mapIntent.campusId?.toUpperCase()
      setCampusId(
        d.campuses.find((campus) => campus.id.toUpperCase() === requestedCampus)?.id ??
        d.campuses[0]?.id ??
        null,
      )
    }).catch((error: unknown) => {
      setLoadError(error instanceof Error ? error.message : 'Không thể tải dữ liệu bản đồ')
    })
    void Promise.all([
      apiClient.get<CampusOption[]>('/campus/all'),
      apiClient.get<SemesterOption[]>('/semesters'),
    ]).then(([campusResponse, semesterResponse]) => {
      setCampusOptions(campusResponse.data)
      setSemesters(semesterResponse.data)
      const today = localDate(new Date())
      const currentSemester = semesterResponse.data.find(
        (semester) => semester.start_date <= today && semester.end_date >= today,
      )
      const initialSemester = currentSemester ?? semesterResponse.data[0]
      setSelectedSemesterId(initialSemester?.id)
      if (!mapIntent.date && initialSemester) setSelectedDate(initialSemester.start_date)
    }).catch((error: unknown) => {
      setReferenceError(getErrorMessage(error))
    })
  }, [mapIntent.campusId, mapIntent.date])

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
        <Alert type="error" showIcon title="Không tải được dữ liệu cơ sở" description={referenceError} />
      )}
      <Card id="map-date-filters" size="small">
        <Flex align="center" justify="space-between" gap={16} wrap>
          <Flex align="center" gap={8}>
            <Typography.Text strong>Học kỳ:</Typography.Text>
            <SearchFilterSelect
              aria-label="Chọn học kỳ xem lịch phòng"
              value={selectedSemesterId}
              onChange={(semesterId: number) => {
                setSelectedSemesterId(semesterId)
                const semester = semesters.find((item) => item.id === semesterId)
                if (semester) setSelectedDate(semester.start_date)
              }}
              options={semesters.map((semester) => ({
                label: semester.name,
                value: semester.id,
              }))}
              placeholder="Chọn học kỳ"
              style={{ width: 220 }}
              disabled={semesters.length === 0}
            />
            <Typography.Text strong>Ngày xem lịch:</Typography.Text>
            <Input
              aria-label="Chọn ngày xem lịch phòng"
              type="date"
              value={selectedDate}
              onChange={(event) => {
                if (event.target.value) setSelectedDate(event.target.value)
              }}
              style={{ width: 180 }}
            />
            <Button onClick={() => setSelectedDate(localDate(new Date()))}>Hôm nay</Button>
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
      selectedDate={selectedDate}
      targetRoomName={mapIntent.roomName}
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
  selectedDate: string
  targetRoomName: string | null
  lighting: ReturnType<typeof useRoomLighting>
  canControl: boolean
}

function CampusView({
  dataset,
  campusId,
  onChangeCampus,
  campusOptions,
  semesterId,
  selectedDate,
  targetRoomName,
  lighting,
  canControl,
}: ViewProps) {
  const campus = dataset.campuses.find((c) => c.id === campusId)!
  const buildings = useMemo(() => dataset.buildings.filter((b) => b.campusId === campusId), [dataset, campusId])
  const databaseRoomsQuery = useQuery({
    queryKey: ['map', 'database-rooms'],
    queryFn: async () => {
      const { data } = await apiClient.get<DatabaseRoom[]>('/rooms')
      return data
    },
  })
  const databaseRooms = databaseRoomsQuery.data ?? EMPTY_DATABASE_ROOMS
  const inferredDatabaseCampusId = useMemo(() => {
    const aliases =
      campusId === 'CS1'
        ? ['vo van tan']
        : campusId === 'CS3'
          ? ['nha be', 'nhon duc']
          : []
    const normalize = (value: string) =>
      value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd')
    const namedCampus = campusOptions.find((option) => {
      const value = normalize(`${option.name} ${option.address ?? ''}`)
      return aliases.some((alias) => value.includes(alias))
    })
    if (namedCampus) return namedCampus.id

    const mapRoomCodes = new Set(
      dataset.rooms
        .filter((room) => room.campusId === campusId)
        .map((room) => normalizeRoomCode(room.code)),
    )
    const campusScores = new globalThis.Map<number, number>()
    databaseRooms.forEach((room) => {
      if (mapRoomCodes.has(normalizeRoomCode(room.name))) {
        campusScores.set(room.campus_id, (campusScores.get(room.campus_id) ?? 0) + 1)
      }
    })
    const bestMatch = [...campusScores.entries()].sort((left, right) => right[1] - left[1])
    if (bestMatch.length > 0 && (!bestMatch[1] || bestMatch[0][1] > bestMatch[1][1])) {
      return bestMatch[0][0]
    }
  }, [campusId, campusOptions, databaseRooms, dataset.rooms])
  const databaseCampusId = inferredDatabaseCampusId
  const rooms = useMemo(() => {
    const campusRooms = dataset.rooms.filter((room) => room.campusId === campusId)
    const reportedLights = Object.values(lighting.lights).filter((light) => light.campus_id === campusId)

    return campusRooms.flatMap((mapRoom) => {
      const databaseRoom = databaseRooms.find(
        (room) =>
          room.campus_id === databaseCampusId &&
          normalizeRoomCode(room.name) === normalizeRoomCode(mapRoom.code),
      )
      if (!databaseRoom) return []
      const configuredIds = new Set(mapRoom.lights.map((light) => light.id))
      const additionalLights = reportedLights.filter(
        (light) => light.room_id === mapRoom.id && !configuredIds.has(light.light_id),
      )
      return [{
        ...mapRoom,
        databaseRoomId: databaseRoom.id,
        code: databaseRoom.name,
        name: databaseRoom.name,
        databaseBuilding: databaseRoom.building,
        capacity: databaseRoom.capacity,
        occupancy: 0,
        lights: [
          ...mapRoom.lights,
          ...placeRoomLights(
            additionalLights.map((light) => ({ id: light.light_id, name: light.light_id })),
            mapRoom.polygon,
          ),
        ],
      }]
    })
  }, [campusId, databaseCampusId, databaseRooms, dataset, lighting.lights])
  const roomStatusQuery = useQuery({
    queryKey: ['map', 'room-status', databaseCampusId, semesterId, selectedDate],
    enabled: databaseCampusId !== undefined && semesterId !== undefined,
    queryFn: async () => {
      if (databaseCampusId === undefined || semesterId === undefined) {
        throw new Error('Cần chọn cơ sở database và học kỳ để tải lịch phòng.')
      }
      const { data } = await apiClient.get<ActiveRoomClass[]>('/schedules/room-status', {
        params: {
          campus_id: databaseCampusId,
          semester_id: semesterId,
          date: selectedDate,
        },
      })
      return data
    },
    refetchInterval: 30_000,
  })
  const currentClasses = roomStatusQuery.data ?? EMPTY_CURRENT_CLASSES
  const scheduleError = roomStatusQuery.error
    ? getErrorMessage(roomStatusQuery.error)
    : null
  const scheduleLoading = roomStatusQuery.isFetching
  const visibleCurrentClasses =
    databaseCampusId !== undefined
      ? currentClasses
      : EMPTY_CURRENT_CLASSES
  const scheduledRoomNames = useMemo(() => {
    const scheduledRoomIds = new Set(visibleCurrentClasses.map((item) => item.room_id))
    return rooms
      .filter((room) => room.databaseRoomId !== undefined && scheduledRoomIds.has(room.databaseRoomId))
      .map((room) => room.code)
  }, [rooms, visibleCurrentClasses])
  const statusError =
    databaseRoomsQuery.error
      ? getErrorMessage(databaseRoomsQuery.error)
      : databaseCampusId === undefined
          ? databaseRoomsQuery.isSuccess
            ? `Không tự xác định được cơ sở database cho ${campus.name}. Hãy chọn cơ sở database bên dưới.`
            : null
          : databaseRoomsQuery.isSuccess && rooms.length === 0
            ? `Chưa ghép được phòng trong ${campus.name}. Hãy chọn đúng cơ sở database bên dưới hoặc kiểm tra tên phòng trong database.`
          : semesterId === undefined
            ? null
            : scheduleError

  // Mặc định chưa chọn tòa nào: hiển thị toàn khuôn viên
  const [buildingId, setBuildingId] = useState<string | null>(null)
  const [floor, setFloor] = useState(1)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [targetRoomDismissed, setTargetRoomDismissed] = useState(false)
  const [focus, setFocus] = useState<MapFocus | null>(() => ({
    center: campus.center,
    zoom: campus.zoom - 1,
    offset: [0, 0],
    pitch: 45,
    key: Date.now(),
  }))

  const targetRoom = targetRoomName
    ? rooms.find((room) => normalizeRoomCode(room.code) === normalizeRoomCode(targetRoomName))
    : undefined
  const activeTargetRoom = targetRoomDismissed ? undefined : targetRoom
  const activeBuildingId = activeTargetRoom?.buildingId ?? buildingId
  const activeFloor = activeTargetRoom?.floor ?? floor
  const activeRoomId = activeTargetRoom?.id ?? roomId
  const building = buildings.find((item) => item.id === activeBuildingId) ?? null
  const selectedRoom = rooms.find((room) => room.id === activeRoomId) ?? null
  const targetRoomLongitude = activeTargetRoom?.center[0]
  const targetRoomLatitude = activeTargetRoom?.center[1]
  const targetRoomFloor = activeTargetRoom?.floor
  const targetRoomBuildingId = activeTargetRoom?.buildingId
  const targetDatabaseRoomId = activeTargetRoom?.databaseRoomId
  const targetFocus = useMemo(
    () => {
      if (
        targetRoomLongitude === undefined ||
        targetRoomLatitude === undefined ||
        targetRoomFloor === undefined ||
        targetRoomBuildingId === undefined
      ) return null
      return focusRoomAt(
        targetRoomLongitude,
        targetRoomLatitude,
        targetRoomFloor,
        targetRoomBuildingId,
        targetDatabaseRoomId,
        buildings,
      )
    },
    [
      targetRoomLongitude,
      targetRoomLatitude,
      targetRoomFloor,
      targetRoomBuildingId,
      targetDatabaseRoomId,
      buildings,
    ],
  )
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
      setTargetRoomDismissed(true)
      setBuildingId(room.buildingId)
      setFloor(room.floor)
      setRoomId(room.id)
      setFocus(focusRoomAt(
        room.center[0],
        room.center[1],
        room.floor,
        room.buildingId,
        room.databaseRoomId,
        buildings,
      ))
    },
    [buildings, rooms],
  )

  const selectBuilding = useCallback(
    (id: string) => {
      const target = buildings.find((b) => b.id === id)
      if (!target) return
      setTargetRoomDismissed(true)
      setBuildingId(id)
      setFloor(1)
      setRoomId(null)
      setFocus({
        center: target.center,
        key: Date.now(),
        bearing: bearingTowardNearestBuilding(target, buildings),
        pitch: 40,
      })
    },
    [buildings],
  )

  const selectNone = useCallback(() => {
    setTargetRoomDismissed(true)
    setBuildingId(null)
    setFloor(1)
    setRoomId(null)
    setFocus({
      center: campus.center,
      zoom: campus.zoom - 1,
      offset: [0, 0],
      pitch: 45,
      key: Date.now(),
    })
  }, [campus])

  const selectCampusGround = useCallback(() => {
    setTargetRoomDismissed(true)
    setBuildingId(null)
    setFloor(1)
    setRoomId(null)
    setFocus({
      center: campus.center,
      zoom: campus.zoom - 1,
      offset: [-1000, 0],
      pitch: 45,
      key: Date.now(),
    })
  }, [campus])

  const selectFloor = (f: number) => {
    if (!building) return
    setTargetRoomDismissed(true)
    setFloor(f)
    if (selectedRoom && selectedRoom.floor !== f) setRoomId(null)
    setFocus({
      center: building.center,
      key: Date.now(),
      zoom: 18.7 - (f - 1) * 0.25,
      bearing: bearingTowardNearestBuilding(building, buildings),
      pitch: 40,
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
          action={
            databaseCampusId !== undefined && (
              <Button
                size="small"
                icon={<ReloadOutlined />}
                loading={roomStatusQuery.isFetching}
                onClick={() => void roomStatusQuery.refetch()}
              >
                Thử lại
              </Button>
            )
          }
          style={{ position: 'absolute', top: 16, right: 16, zIndex: 3, maxWidth: 420 }}
        />
      )}
      <Flex style={{ position: 'absolute', inset: 0 }}>
        <CampusMap
          campus={campus}
          buildings={buildings}
          rooms={rooms}
          selectedBuildingId={activeBuildingId}
          selectedFloor={activeFloor}
          selectedRoomId={activeRoomId}
          activeRoomNames={scheduledRoomNames}
          focus={targetFocus ?? focus}
          onSelectRoom={selectRoom}
          onSelectBuilding={selectBuilding}
          onSelectCampusGround={selectCampusGround}
          isRoomLightOn={isRoomLightOn}
          onToggleRoomLight={toggleLight}
        />
      </Flex>

      <Flex
        id="map-navigation"
        vertical
        gap={12}
        style={{ position: 'absolute', top: 16, left: 16, bottom: 16, width: 300, zIndex: 2 }}
      >
        {dataset.campuses.length > 1 && (
          <Card className="glass" size="small" styles={{ body: { padding: 8 } }}>
            <SearchFilterSelect
              aria-label="Chọn khuôn viên bản đồ"
              style={{ width: '100%' }}
              value={campusId}
              onChange={onChangeCampus}
              options={dataset.campuses.map((c) => ({ label: c.name, value: c.id }))}
              placeholder="Chọn khuôn viên bản đồ"
            />
          </Card>
        )}
        <div id="map-building-selector">
          <BuildingSelector buildings={buildings} value={activeBuildingId} onChange={selectBuilding} onReset={selectNone} />
        </div>
        <div id="map-room-list" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <RoomListPanel
            rooms={rooms}
            buildings={buildings}
            scheduledRoomNames={scheduledRoomNames}
            selectedRoomId={activeRoomId}
            onSelectRoom={selectRoom}
          />
        </div>
      </Flex>

      {building && (
        <Flex style={{ position: 'absolute', top: '50%', right: 16, transform: 'translateY(-50%)', zIndex: 2 }}>
          <FloorSelector floors={building.floors} value={activeFloor} onChange={selectFloor} />
        </Flex>
      )}

      {selectedRoom && (
        <Flex
          id="map-room-details"
          onWheel={(event) => event.stopPropagation()}
          style={{
            position: 'absolute',
            right: 84,
            bottom: 16,
            width: 350,
            maxHeight: 'calc(100% - 32px)',
            overflowY: 'auto',
            overscrollBehaviorY: 'contain',
            zIndex: 2,
          }}
        >
          <RoomDetailCard
            room={selectedRoom}
            buildingName={building?.name ?? ''}
            currentClasses={visibleCurrentClasses.filter(
              (item) => item.room_id === selectedRoom.databaseRoomId,
            )}
            scheduleLoading={scheduleLoading}
            scheduleError={scheduleError}
            isLightOn={(lightId) => isRoomLightOn(selectedRoom.id, lightId)}
            onToggleLight={(lightId) => toggleLight(selectedRoom.id, lightId)}
            getLightStatus={(lightId) => lighting.lights[lightAddress(campusId, selectedRoom.id, lightId)]}
            isSending={(lightId) => lighting.sending.has(lightAddress(campusId, selectedRoom.id, lightId))}
            canControl={canControl && !lighting.error}
            onClose={() => {
              setTargetRoomDismissed(true)
              setRoomId(null)
            }}
          />
        </Flex>
      )}

      <Flex style={{ position: 'absolute', left: 332, bottom: 16, zIndex: 2 }}>
        <MapLegend />
      </Flex>
    </Flex>
  )
}

export function MapRoute() {
  const { search } = useLocation()
  return <Map key={search} />
}
