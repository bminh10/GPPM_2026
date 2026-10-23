import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  Alert,
  Button,
  Card,
  Empty,
  Flex,
  Input,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { LeftOutlined, ReloadOutlined, RightOutlined } from '@ant-design/icons'
import { apiClient, getErrorMessage } from '../../services/apiClient'
import SearchFilterSelect from '../../components/common/SearchFilterSelect'

type Schedule = {
  id: number
  dang_ky_mon_hoc_id: number
  lop_id: number
  mon_hoc_id: number
  phong_hoc_id: number
  hoc_ky_id: number
  ca_hoc_id: number
  day_of_week: number
  start_date: string
  end_date: string
  teacher_name: string | null
  is_thuc_hanh: boolean
}

type NamedOption = { id: number; name: string }
type ClassOption = NamedOption & { si_so: number }
type RoomOption = NamedOption & {
  building: string | null
  capacity: number
  is_thuc_hanh: boolean
  campus_id: number
}
type CampusOption = NamedOption & { address: string | null }
type SemesterOption = NamedOption & { start_date: string; end_date: string }
type TimeSlotOption = NamedOption & { start_time: string; end_time: string }

const DAY_NAMES = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']

function toDateString(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfWeek(value: string) {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return date
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' })
    .format(new Date(`${value}T00:00:00`))
}

function getWeekDays(weekStart: Date) {
  return DAY_NAMES.map((name, index) => {
    const date = new Date(weekStart)
    date.setDate(date.getDate() + index)
    const dateString = toDateString(date)
    return { name, date: dateString, dayOfWeek: index + 2 }
  })
}

function formatTime(value: string) {
  return value.slice(0, 5)
}

export default function TimetablePage() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [subjects, setSubjects] = useState<NamedOption[]>([])
  const [rooms, setRooms] = useState<RoomOption[]>([])
  const [campuses, setCampuses] = useState<CampusOption[]>([])
  const [semesters, setSemesters] = useState<SemesterOption[]>([])
  const [timeSlots, setTimeSlots] = useState<TimeSlotOption[]>([])
  const [semesterId, setSemesterId] = useState<number>()
  const [classId, setClassId] = useState<number>()
  const [roomId, setRoomId] = useState<number>()
  const [weekAnchor, setWeekAnchor] = useState(() => toDateString(new Date()))
  const [referencesLoading, setReferencesLoading] = useState(true)
  const [referencesError, setReferencesError] = useState<string | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [referenceReloadKey, setReferenceReloadKey] = useState(0)
  const [loadedScheduleKey, setLoadedScheduleKey] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([
      apiClient.get<ClassOption[]>('/classes'),
      apiClient.get<NamedOption[]>('/subjects'),
      apiClient.get<RoomOption[]>('/rooms'),
      apiClient.get<CampusOption[]>('/campus/all'),
      apiClient.get<SemesterOption[]>('/semesters'),
      apiClient.get<TimeSlotOption[]>('/time-slots'),
    ])
      .then(([classesResult, subjectsResult, roomsResult, campusesResult, semestersResult, slotsResult]) => {
        if (!active) return
        setClasses(classesResult.data)
        setSubjects(subjectsResult.data)
        setRooms(roomsResult.data)
        setCampuses(campusesResult.data)
        setSemesters(semestersResult.data)
        setTimeSlots(slotsResult.data)
        setSemesterId((current) => current ?? semestersResult.data[0]?.id)
      })
      .catch((error: unknown) => {
        if (active) setReferencesError(getErrorMessage(error))
      })
      .finally(() => {
        if (active) setReferencesLoading(false)
      })
    return () => {
      active = false
    }
  }, [referenceReloadKey])

  const scheduleRequestKey = `${semesterId ?? ''}:${classId ?? ''}:${roomId ?? ''}:${reloadKey}`
  const scheduleLoading = semesterId !== undefined && loadedScheduleKey !== scheduleRequestKey

  useEffect(() => {
    let active = true
    if (semesterId === undefined) return () => { active = false }

    apiClient.get<Schedule[]>('/schedules', {
      params: {
        semester_id: semesterId,
        ...(classId !== undefined ? { class_id: classId } : {}),
        ...(roomId !== undefined ? { room_id: roomId } : {}),
      },
    })
    .then(({ data }) => {
      if (!active) return
      setSchedules(data)
      setScheduleError(null)
    })
    .catch((error: unknown) => {
      if (active) {
        setSchedules([])
        setScheduleError(getErrorMessage(error))
      }
    })
    .finally(() => {
      if (active) setLoadedScheduleKey(scheduleRequestKey)
    })
    return () => {
    active = false
    }
  }, [classId, reloadKey, roomId, scheduleRequestKey, semesterId])

  const weekStart = useMemo(() => startOfWeek(weekAnchor), [weekAnchor])
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])
  const weekEnd = weekDays[6].date
  const weekLabel = `${formatDate(weekDays[0].date)} – ${formatDate(weekEnd)}`

  const visibleSchedules = useMemo(
    () => schedules.filter((schedule) =>
      weekDays.some((day) =>
        day.dayOfWeek === schedule.day_of_week &&
        day.date >= schedule.start_date &&
        day.date <= schedule.end_date,
      ),
    ),
    [schedules, weekDays],
  )

  const orderedSlots = useMemo(() => {
    const knownIds = new Set(timeSlots.map((slot) => slot.id))
    const missingSlots = visibleSchedules
      .filter((schedule) => !knownIds.has(schedule.ca_hoc_id))
      .map((schedule) => schedule.ca_hoc_id)
      .filter((id, index, ids) => ids.indexOf(id) === index)
      .map((id) => ({
        id,
        name: 'Ca không xác định',
        start_time: '23:59',
        end_time: '23:59',
      }))
    return [...timeSlots, ...missingSlots].sort((left, right) =>
      left.start_time.localeCompare(right.start_time),
    )
  }, [timeSlots, visibleSchedules])

  const shiftWeek = (amount: number) => {
    const nextWeek = new Date(weekStart)
    nextWeek.setDate(nextWeek.getDate() + amount * 7)
    setWeekAnchor(toDateString(nextWeek))
  }

  const selectedSemester = semesters.find((semester) => semester.id === semesterId)

  return (
    <Space direction="vertical" size="large" style={{ display: 'flex' }}>
      <Flex align="center" justify="space-between" wrap="wrap" gap={12}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>Thời khóa biểu</Typography.Title>
          <Typography.Text type="secondary">
            Xem lịch học theo tuần, học kỳ, lớp và phòng.
          </Typography.Text>
        </div>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => {
            setReloadKey((key) => key + 1)
            setReferenceReloadKey((key) => key + 1)
            setReferencesLoading(true)
            setReferencesError(null)
          }}
          loading={scheduleLoading || referencesLoading}
        >
          Tải lại
        </Button>
      </Flex>

      {referencesError && <Alert type="error" showIcon message={referencesError} />}
      {scheduleError && <Alert type="error" showIcon message={scheduleError} />}

      <Card>
        <Flex gap={12} wrap="wrap" align="end">
          <div style={{ minWidth: 220, flex: '1 1 220px' }}>
            <Typography.Text strong>Học kỳ</Typography.Text>
            <SearchFilterSelect
              aria-label="Lọc theo học kỳ"
              value={semesterId}
              options={semesters.map((semester) => ({ value: semester.id, label: semester.name }))}
              placeholder="Chọn học kỳ"
              style={{ width: '100%', marginTop: 6 }}
              onChange={(value: number | undefined) => setSemesterId(value)}
            />
          </div>
          <div style={{ minWidth: 200, flex: '1 1 200px' }}>
            <Typography.Text strong>Lớp</Typography.Text>
            <SearchFilterSelect
              aria-label="Lọc theo lớp"
              allowClear
              value={classId}
              options={classes.map((schoolClass) => ({
                value: schoolClass.id,
                label: schoolClass.name,
              }))}
              placeholder="Tất cả lớp"
              style={{ width: '100%', marginTop: 6 }}
              onChange={(value: number | undefined) => setClassId(value)}
            />
          </div>
          <div style={{ minWidth: 200, flex: '1 1 200px' }}>
            <Typography.Text strong>Phòng</Typography.Text>
            <SearchFilterSelect
              aria-label="Lọc theo phòng"
              allowClear
              value={roomId}
              options={rooms.map((room) => ({
                value: room.id,
                label: room.name,
              }))}
              placeholder="Tất cả phòng"
              style={{ width: '100%', marginTop: 6 }}
              onChange={(value: number | undefined) => setRoomId(value)}
            />
          </div>
          <div style={{ minWidth: 170 }}>
            <Typography.Text strong>Tuần có ngày</Typography.Text>
            <Input
              aria-label="Chọn ngày trong tuần"
              type="date"
              value={weekAnchor}
              onChange={(event) => {
                if (event.target.value) setWeekAnchor(event.target.value)
              }}
              style={{ marginTop: 6 }}
            />
          </div>
        </Flex>
        {selectedSemester && (
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
            Học kỳ: {selectedSemester.name} ({formatDate(selectedSemester.start_date)} – {formatDate(selectedSemester.end_date)})
          </Typography.Text>
        )}
      </Card>

      <Card
        title={
          <Flex align="center" gap={8} wrap="wrap">
            <Button
              aria-label="Tuần trước"
              icon={<LeftOutlined />}
              size="small"
              onClick={() => shiftWeek(-1)}
            />
            <Typography.Text strong>{weekLabel}</Typography.Text>
            <Button
              aria-label="Tuần sau"
              icon={<RightOutlined />}
              size="small"
              onClick={() => shiftWeek(1)}
            />
          </Flex>
        }
        styles={{ body: { padding: 12 } }}
      >
        {referencesLoading ? (
          <Flex justify="center" style={{ padding: 48 }}><Spin /></Flex>
        ) : !semesterId ? (
          <Empty description="Chưa có học kỳ để hiển thị thời khóa biểu" />
        ) : scheduleLoading ? (
          <Flex justify="center" style={{ padding: 48 }}><Spin /></Flex>
        ) : visibleSchedules.length === 0 ? (
          <Empty description="Không có lịch học trong tuần này" />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '112px repeat(7, minmax(145px, 1fr))',
                minWidth: 112 + 7 * 145,
              }}
            >
              <div style={headerCellStyle}>Ca học</div>
              {weekDays.map((day) => (
                <div key={day.dayOfWeek} style={headerCellStyle}>
                  <Typography.Text strong>{day.name}</Typography.Text>
                  <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                    {formatDate(day.date)}
                  </Typography.Text>
                </div>
              ))}
              {orderedSlots.map((slot) => (
                <FragmentRow
                  key={slot.id}
                  slot={slot}
                  weekDays={weekDays}
                  schedules={visibleSchedules}
                  classes={classes}
                  subjects={subjects}
                  rooms={rooms}
                  campuses={campuses}
                />
              ))}
            </div>
          </div>
        )}
      </Card>
    </Space>
  )
}

const headerCellStyle: CSSProperties = {
  borderBottom: '1px solid #e5e7eb',
  borderRight: '1px solid #e5e7eb',
  padding: '10px 8px',
  background: '#fafafa',
  textAlign: 'center',
}

type FragmentRowProps = {
  slot: TimeSlotOption
  weekDays: ReturnType<typeof getWeekDays>
  schedules: Schedule[]
  classes: ClassOption[]
  subjects: NamedOption[]
  rooms: RoomOption[]
  campuses: CampusOption[]
}

function FragmentRow({ slot, weekDays, schedules, classes, subjects, rooms, campuses }: FragmentRowProps) {
  return (
    <>
      <div
        style={{
          borderBottom: '1px solid #e5e7eb',
          borderRight: '1px solid #e5e7eb',
          padding: 10,
          textAlign: 'center',
          alignContent: 'center',
          background: '#fafafa',
        }}
      >
        <Typography.Text strong>{slot.name}</Typography.Text>
        <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
          {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
        </Typography.Text>
      </div>
      {weekDays.map((day) => {
        const items = schedules.filter((schedule) =>
          schedule.ca_hoc_id === slot.id &&
          schedule.day_of_week === day.dayOfWeek &&
          day.date >= schedule.start_date &&
          day.date <= schedule.end_date,
        )
        return (
          <div
            key={day.dayOfWeek}
            style={{
              minHeight: 112,
              padding: 6,
              borderBottom: '1px solid #e5e7eb',
              borderRight: '1px solid #e5e7eb',
            }}
          >
            {items.map((schedule) => {
              const schoolClass = classes.find((item) => item.id === schedule.lop_id)
              const subject = subjects.find((item) => item.id === schedule.mon_hoc_id)
              const room = rooms.find((item) => item.id === schedule.phong_hoc_id)
              const campus = campuses.find((item) => item.id === room?.campus_id)
              const scheduleDetails = (
                <Space direction="vertical" size={2}>
                  <Typography.Text strong style={{ color: 'white' }}>
                    {subject?.name ?? 'Môn học không xác định'}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'white' }}>
                    {formatDate(schedule.start_date)} – {formatDate(schedule.end_date)}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'white' }}>
                    {slot.name}: {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'white' }}>
                    Lớp: {schoolClass?.name ?? 'Không xác định'}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'white' }}>
                    Giảng viên: {schedule.teacher_name?.trim() || 'Chưa cập nhật'}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'white' }}>
                    Phòng: {room?.name ?? 'Không xác định'}
                    {room?.building ? ` · ${room.building}` : ''}
                  </Typography.Text>
                  <Typography.Text style={{ color: 'white' }}>
                    Cơ sở: {campus?.name ?? 'Không xác định'}
                  </Typography.Text>
                  {campus?.address && (
                    <Typography.Text style={{ color: 'white' }}>
                      Địa chỉ: {campus.address}
                    </Typography.Text>
                  )}
                </Space>
              )
              return (
                <Tooltip key={schedule.id} title={scheduleDetails} placement="top" mouseEnterDelay={0.2}>
                  <Card
                    size="small"
                    styles={{ body: { padding: 8 } }}
                    style={{ marginBottom: 6, borderLeft: '3px solid #1677ff', cursor: 'help' }}
                  >
                    <Typography.Text strong style={{ display: 'block' }}>
                      {subject?.name ?? 'Môn học không xác định'}
                    </Typography.Text>
                    <Typography.Text style={{ display: 'block', fontSize: 12 }}>
                      {schoolClass?.name ?? 'Lớp không xác định'}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                      {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                      {room?.name ?? 'Phòng không xác định'}
                      {room?.building ? ` · ${room.building}` : ''}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                      {campus?.name ?? 'Cơ sở không xác định'}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                      GV: {schedule.teacher_name?.trim() || 'Chưa cập nhật'}
                    </Typography.Text>
                    {schedule.is_thuc_hanh && (
                      <Tag color="blue" style={{ marginTop: 5, marginInlineEnd: 0 }}>Thực hành</Tag>
                    )}
                  </Card>
                </Tooltip>
              )
            })}
          </div>
        )
      })}
    </>
  )
}
