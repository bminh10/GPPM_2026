import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  Alert,
  Button,
  Card,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import { EditOutlined, LeftOutlined, ReloadOutlined, RightOutlined } from '@ant-design/icons'
import axios from 'axios'
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

type RegistrationOption = {
  id: number
  lop_id: number
  mon_id: number
  so_luong: number
  hoc_ky_id: number | null
}
type NamedOption = { id: number; name: string }
type ClassOption = NamedOption & { si_so: number; nganh_id: number }
type FacultyOption = NamedOption
type MajorOption = NamedOption & { khoa_id: number | null }
type RoomOption = NamedOption & {
  building: string | null
  capacity: number
  is_thuc_hanh: boolean
  campus_id: number
}
type CampusOption = NamedOption & { address: string | null }
type SemesterOption = NamedOption & { start_date: string; end_date: string }
type TimeSlotOption = NamedOption & { start_time: string; end_time: string }
type ScheduleEditValues = {
  dang_ky_mon_hoc_id: number
  phong_hoc_id: number
  hoc_ky_id: number
  ca_hoc_id: number
  day_of_week: number
  start_date: string
  end_date: string
  teacher_name: string
  is_thuc_hanh: boolean
}

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
  const [registrations, setRegistrations] = useState<RegistrationOption[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [faculties, setFaculties] = useState<FacultyOption[]>([])
  const [majors, setMajors] = useState<MajorOption[]>([])
  const [subjects, setSubjects] = useState<NamedOption[]>([])
  const [rooms, setRooms] = useState<RoomOption[]>([])
  const [campuses, setCampuses] = useState<CampusOption[]>([])
  const [semesters, setSemesters] = useState<SemesterOption[]>([])
  const [timeSlots, setTimeSlots] = useState<TimeSlotOption[]>([])
  const [semesterId, setSemesterId] = useState<number>()
  const [facultyId, setFacultyId] = useState<number>()
  const [majorId, setMajorId] = useState<number>()
  const [roomId, setRoomId] = useState<number>()
  const [weekAnchor, setWeekAnchor] = useState(() => toDateString(new Date()))
  const [referencesLoading, setReferencesLoading] = useState(true)
  const [referencesError, setReferencesError] = useState<string | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [referenceReloadKey, setReferenceReloadKey] = useState(0)
  const [loadedScheduleKey, setLoadedScheduleKey] = useState<string | null>(null)
  const [draggedScheduleId, setDraggedScheduleId] = useState<number | null>(null)
  const [movingScheduleId, setMovingScheduleId] = useState<number | null>(null)
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [editForm] = Form.useForm<ScheduleEditValues>()
  const [messageApi, contextHolder] = message.useMessage()

  useEffect(() => {
    let active = true
    Promise.all([
      apiClient.get<ClassOption[]>('/classes'),
      apiClient.get<RegistrationOption[]>('/course-registrations'),
      apiClient.get<NamedOption[]>('/subjects'),
      apiClient.get<RoomOption[]>('/rooms'),
      apiClient.get<CampusOption[]>('/campus/all'),
      apiClient.get<SemesterOption[]>('/semesters'),
      apiClient.get<TimeSlotOption[]>('/time-slots'),
      apiClient.get<FacultyOption[]>('/faculties'),
      apiClient.get<MajorOption[]>('/majors'),
    ])
      .then(([classesResult, registrationsResult, subjectsResult, roomsResult, campusesResult, semestersResult, slotsResult, facultiesResult, majorsResult]) => {
        if (!active) return
        setClasses(classesResult.data)
        setFaculties(facultiesResult.data)
        setMajors(majorsResult.data)
        setRegistrations(registrationsResult.data)
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

  const scheduleRequestKey = `${semesterId ?? ''}:${facultyId ?? ''}:${majorId ?? ''}:${roomId ?? ''}:${reloadKey}`
  const scheduleLoading = semesterId !== undefined && loadedScheduleKey !== scheduleRequestKey

  useEffect(() => {
    let active = true
    if (semesterId === undefined) return () => { active = false }

    apiClient.get<Schedule[]>('/schedules', {
      params: {
        semester_id: semesterId,
        ...(facultyId !== undefined ? { khoa_id: facultyId } : {}),
        ...(majorId !== undefined ? { nganh_id: majorId } : {}),
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
  }, [facultyId, majorId, reloadKey, roomId, scheduleRequestKey, semesterId])

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
  const availableMajors = majors.filter(
    (major) => facultyId === undefined || major.khoa_id === facultyId,
  )

  const openScheduleEditor = (schedule: Schedule) => {
    setEditingSchedule(schedule)
    editForm.setFieldsValue({
      dang_ky_mon_hoc_id: schedule.dang_ky_mon_hoc_id,
      phong_hoc_id: schedule.phong_hoc_id,
      hoc_ky_id: schedule.hoc_ky_id,
      ca_hoc_id: schedule.ca_hoc_id,
      day_of_week: schedule.day_of_week,
      start_date: schedule.start_date,
      end_date: schedule.end_date,
      teacher_name: schedule.teacher_name ?? '',
      is_thuc_hanh: schedule.is_thuc_hanh,
    })
  }

  const saveSchedule = async (values: ScheduleEditValues) => {
    if (!editingSchedule) return
    setSavingSchedule(true)
    try {
      await apiClient.patch(`/schedules/${editingSchedule.id}`, values)
      messageApi.success('Đã cập nhật lịch học.')
      setEditingSchedule(null)
      setReloadKey((key) => key + 1)
    } catch (error: unknown) {
      messageApi.error(getErrorMessage(error))
    } finally {
      setSavingSchedule(false)
    }
  }

  const moveSchedule = async (schedule: Schedule, dayOfWeek: number, timeSlotId: number) => {
    setDraggedScheduleId(null)
    setDropTargetKey(null)
    if (schedule.day_of_week === dayOfWeek && schedule.ca_hoc_id === timeSlotId) return
    const registration = registrations.find((item) => item.id === schedule.dang_ky_mon_hoc_id)
    if (!registration) {
      messageApi.error('Không tìm thấy đăng ký môn học liên kết với lịch này.')
      return
    }
    if (registration.hoc_ky_id === null) {
      messageApi.error('Đăng ký môn học chưa được gán học kỳ nên không thể cập nhật lịch.')
      return
    }

    setMovingScheduleId(schedule.id)
    const currentRoom = rooms.find((item) => item.id === schedule.phong_hoc_id)
    const alternatives = rooms
      .filter((room) =>
        room.id !== schedule.phong_hoc_id &&
        room.capacity >= (registration?.so_luong ?? 0) &&
        (!schedule.is_thuc_hanh || room.is_thuc_hanh),
      )
      .sort((left, right) => {
        const leftCampusPenalty = left.campus_id === currentRoom?.campus_id ? 0 : 1
        const rightCampusPenalty = right.campus_id === currentRoom?.campus_id ? 0 : 1
        return leftCampusPenalty - rightCampusPenalty || left.capacity - right.capacity
      })
    let allocatedRoom: RoomOption | undefined
    let lastConflict: unknown
    try {
      const updateSchedule = (roomId: number) => apiClient.patch(`/schedules/${schedule.id}`, {
        hoc_ky_id: registration.hoc_ky_id,
        day_of_week: dayOfWeek,
        ca_hoc_id: timeSlotId,
        phong_hoc_id: roomId,
      })
      try {
        await updateSchedule(schedule.phong_hoc_id)
      } catch (error: unknown) {
        if (!axios.isAxiosError(error) || error.response?.status !== 409) throw error
        lastConflict = error
        for (const room of alternatives) {
          try {
            await updateSchedule(room.id)
            allocatedRoom = room
            break
          } catch (alternativeError: unknown) {
            if (!axios.isAxiosError(alternativeError) || alternativeError.response?.status !== 409) {
              throw alternativeError
            }
            lastConflict = alternativeError
          }
        }
        if (!allocatedRoom) throw lastConflict
      }
      messageApi.success(
        allocatedRoom
          ? `Đã chuyển lịch và tự đổi sang phòng ${allocatedRoom.name}`
          : schedule.hoc_ky_id !== registration.hoc_ky_id
            ? 'Đã đồng bộ học kỳ lịch theo đăng ký và chuyển sang thứ/ca mới'
            : 'Đã chuyển lịch sang thứ/ca học mới',
      )
      setReloadKey((key) => key + 1)
    } catch (error: unknown) {
      messageApi.error(getErrorMessage(error))
    } finally {
      setMovingScheduleId(null)
    }
  }

  return (
    <Space direction="vertical" size="large" style={{ display: 'flex' }}>
      {contextHolder}
      <Flex align="center" justify="space-between" wrap="wrap" gap={12}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>Thời khóa biểu</Typography.Title>
          <Typography.Text type="secondary">
            Xem lịch học theo tuần, học kỳ, khoa, ngành và phòng.
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
            <Typography.Text strong>Khoa</Typography.Text>
            <SearchFilterSelect
              aria-label="Lọc theo khoa"
              allowClear
              value={facultyId}
              options={faculties.map((faculty) => ({
                value: faculty.id,
                label: faculty.name,
              }))}
              placeholder="Tất cả khoa"
              style={{ width: '100%', marginTop: 6 }}
              onChange={(value: number | undefined) => {
                setFacultyId(value)
                setMajorId(undefined)
              }}
            />
          </div>
          <div style={{ minWidth: 200, flex: '1 1 200px' }}>
            <Typography.Text strong>Ngành</Typography.Text>
            <SearchFilterSelect
              aria-label="Lọc theo ngành"
              allowClear
              value={majorId}
              options={availableMajors.map((major) => ({
                value: major.id,
                label: major.name,
              }))}
              placeholder="Tất cả ngành"
              style={{ width: '100%', marginTop: 6 }}
              onChange={(value: number | undefined) => setMajorId(value)}
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
            <Tag color="blue" style={{ marginInlineEnd: 0 }}>Lý thuyết</Tag>
            <Tag color="purple" style={{ marginInlineEnd: 0 }}>Thực hành</Tag>
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
              <Typography.Text type="secondary" style={{ display: 'block', margin: '0 0 10px 4px' }}>
                Chọn một lịch để chỉnh sửa, hoặc kéo thả lịch sang ô khác để đổi thứ/ca. Khi ô sáng xanh, thả lịch để lưu.
              </Typography.Text>
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
                  draggedScheduleId={draggedScheduleId}
                  dropTargetKey={dropTargetKey}
                  movingScheduleId={movingScheduleId}
                  onDragStart={(scheduleId) => {
                    setDraggedScheduleId(scheduleId)
                    setDropTargetKey(null)
                  }}
                  onDragEnd={() => {
                    setDraggedScheduleId(null)
                    setDropTargetKey(null)
                  }}
                  onDragEnter={setDropTargetKey}
                  onDrop={moveSchedule}
                  onClickSchedule={openScheduleEditor}
                />
              ))}
            </div>
          </div>
        )}
      </Card>
      <Modal
        title="Chỉnh sửa lịch học"
        open={editingSchedule !== null}
        onCancel={() => setEditingSchedule(null)}
        onOk={() => editForm.submit()}
        okText="Lưu thay đổi"
        cancelText="Hủy"
        confirmLoading={savingSchedule}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={saveSchedule}>
          <Form.Item
            name="dang_ky_mon_hoc_id"
            label="Đăng ký môn học"
            rules={[{ required: true, message: 'Vui lòng chọn đăng ký môn học' }]}
          >
            <SearchFilterSelect
              options={registrations.map((registration) => {
                const schoolClass = classes.find((item) => item.id === registration.lop_id)
                const subject = subjects.find((item) => item.id === registration.mon_id)
                return {
                  value: registration.id,
                  label: `${schoolClass?.name ?? `Lớp ${registration.lop_id}`} · ${subject?.name ?? `Môn ${registration.mon_id}`}`,
                }
              })}
            />
          </Form.Item>
          <Flex gap={12} wrap="wrap">
            <Form.Item
              name="hoc_ky_id"
              label="Học kỳ"
              rules={[{ required: true, message: 'Vui lòng chọn học kỳ' }]}
              style={{ flex: '1 1 180px' }}
            >
              <SearchFilterSelect
                options={semesters.map((semester) => ({
                  value: semester.id,
                  label: semester.name,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="day_of_week"
              label="Thứ"
              rules={[{ required: true, message: 'Vui lòng chọn thứ' }]}
              style={{ flex: '1 1 150px' }}
            >
              <SearchFilterSelect
                options={DAY_NAMES.map((name, index) => ({
                  value: index + 2,
                  label: name,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="ca_hoc_id"
              label="Ca học"
              rules={[{ required: true, message: 'Vui lòng chọn ca học' }]}
              style={{ flex: '1 1 180px' }}
            >
              <SearchFilterSelect
                options={timeSlots.map((slot) => ({
                  value: slot.id,
                  label: `${slot.name} (${formatTime(slot.start_time)}–${formatTime(slot.end_time)})`,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="phong_hoc_id"
              label="Phòng học"
              rules={[{ required: true, message: 'Vui lòng chọn phòng' }]}
              style={{ flex: '1 1 180px' }}
            >
              <SearchFilterSelect
                options={rooms.map((room) => ({
                  value: room.id,
                  label: `${room.name}${room.building ? ` · ${room.building}` : ''}${room.is_thuc_hanh ? ' · Phòng thực hành' : ''}`,
                }))}
              />
            </Form.Item>
          </Flex>
          <Flex gap={12} wrap="wrap">
            <Form.Item
              name="start_date"
              label="Ngày bắt đầu"
              rules={[{ required: true, message: 'Vui lòng chọn ngày bắt đầu' }]}
              style={{ flex: '1 1 180px' }}
            >
              <Input type="date" />
            </Form.Item>
            <Form.Item
              name="end_date"
              label="Ngày kết thúc"
              rules={[{ required: true, message: 'Vui lòng chọn ngày kết thúc' }]}
              style={{ flex: '1 1 180px' }}
            >
              <Input type="date" />
            </Form.Item>
          </Flex>
          <Form.Item name="teacher_name" label="Giảng viên">
            <Input maxLength={120} placeholder="Tên giảng viên" />
          </Form.Item>
          <Form.Item
            name="is_thuc_hanh"
            label="Lớp thực hành"
            valuePropName="checked"
          >
            <Switch checkedChildren="Thực hành" unCheckedChildren="Lý thuyết" />
          </Form.Item>
        </Form>
      </Modal>
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
  draggedScheduleId: number | null
  dropTargetKey: string | null
  movingScheduleId: number | null
  onDragStart: (scheduleId: number) => void
  onDragEnd: () => void
  onDragEnter: (targetKey: string) => void
  onDrop: (schedule: Schedule, dayOfWeek: number, timeSlotId: number) => void
  onClickSchedule: (schedule: Schedule) => void
}

function FragmentRow({
  slot,
  weekDays,
  schedules,
  classes,
  subjects,
  rooms,
  campuses,
  draggedScheduleId,
  dropTargetKey,
  movingScheduleId,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDrop,
  onClickSchedule,
}: FragmentRowProps) {
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
        const targetKey = `${slot.id}:${day.dayOfWeek}`
        const isDropTarget = draggedScheduleId !== null && dropTargetKey === targetKey
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
              padding: 7,
              borderBottom: '1px solid #e8edf3',
              borderRight: '1px solid #e8edf3',
              background: isDropTarget ? '#e6f4ff' : draggedScheduleId !== null ? '#f8fbff' : undefined,
              outline: isDropTarget ? '2px dashed #1677ff' : undefined,
              outlineOffset: -3,
              transition: 'background-color 160ms ease, outline-color 160ms ease',
            }}
            onDragEnter={() => onDragEnter(targetKey)}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(event) => {
              event.preventDefault()
              const scheduleId = Number(event.dataTransfer.getData('text/plain'))
              const schedule = schedules.find((item) => item.id === scheduleId)
              if (schedule) onDrop(schedule, day.dayOfWeek, slot.id)
            }}
          >
            {items.map((schedule) => {
              const schoolClass = classes.find((item) => item.id === schedule.lop_id)
              const subject = subjects.find((item) => item.id === schedule.mon_hoc_id)
              const room = rooms.find((item) => item.id === schedule.phong_hoc_id)
              const campus = campuses.find((item) => item.id === room?.campus_id)
              const practiceStyle = schedule.is_thuc_hanh
                ? { color: '#531dab', backgroundColor: '#efdbff', borderColor: '#9254de' }
                : { color: '#0958d9', backgroundColor: '#e6f4ff', borderColor: '#69b1ff' }
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
                    hoverable
                    styles={{ body: { padding: 9, backgroundColor: practiceStyle.backgroundColor } }}
                    draggable={movingScheduleId === null}
                    role="button"
                    tabIndex={0}
                    aria-label={`Chỉnh sửa lịch ${subject?.name ?? ''} của ${schoolClass?.name ?? ''}`}
                    onDragStart={(event) => {
                      event.stopPropagation()
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', String(schedule.id))
                      onDragStart(schedule.id)
                    }}
                    onDragEnd={onDragEnd}
                    onClick={() => onClickSchedule(schedule)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onClickSchedule(schedule)
                      }
                    }}
                    style={{
                      marginBottom: 7,
                      borderLeft: `3px solid ${practiceStyle.color}`,
                      borderColor: practiceStyle.borderColor,
                      backgroundColor: practiceStyle.backgroundColor,
                      cursor: movingScheduleId === schedule.id
                        ? 'wait'
                        : draggedScheduleId === schedule.id
                          ? 'grabbing'
                          : 'grab',
                      opacity: draggedScheduleId === schedule.id || movingScheduleId === schedule.id ? 0.55 : 1,
                      boxShadow: '0 2px 7px rgba(15, 23, 42, 0.08)',
                      transition: 'box-shadow 160ms ease, transform 160ms ease, opacity 160ms ease',
                    }}
                  >
                    <Typography.Text strong ellipsis style={{ display: 'block', width: '100%' }}>
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
                    <Flex align="center" justify="space-between" gap={6} style={{ marginTop: 7 }}>
                      <Tag
                        color={schedule.is_thuc_hanh ? 'purple' : 'blue'}
                        style={{ marginInlineEnd: 0, flexShrink: 0 }}
                      >
                        {schedule.is_thuc_hanh ? 'Thực hành' : 'Lý thuyết'}
                      </Tag>
                      <Flex align="center" gap={4} style={{ color: '#64748b', fontSize: 12 }}>
                        <EditOutlined aria-hidden="true" />
                        <span>Chỉnh sửa</span>
                      </Flex>
                    </Flex>
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
