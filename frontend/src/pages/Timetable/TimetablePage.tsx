import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  EditOutlined,
  LeftOutlined,
  ReloadOutlined,
  RightOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import axios from 'axios'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
type SubjectOption = NamedOption & {
  code: string
  is_thuc_hanh: boolean
}
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
type AutomaticScheduleMode = 'missing' | 'all'
type AutomaticScheduleScope = 'all' | 'faculty' | 'registrations'
type UnscheduledRequirement = {
  label: string
  meeting_type: string
  reason: string
}
type AutomaticScheduleResult = {
  message: string
  solver_status: string
  relative_gap: number
  unscheduled_count: number
  unscheduled_requirements: UnscheduledRequirement[]
  scheduled_count: number
  replaced_count: number
}
type ScheduleOptimizationJob = {
  job_id: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  result: AutomaticScheduleResult | null
  error: string | null
}

const DAY_NAMES = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']
const EMPTY_CLASSES: ClassOption[] = []
const EMPTY_REGISTRATIONS: RegistrationOption[] = []
const EMPTY_SUBJECTS: SubjectOption[] = []
const EMPTY_ROOMS: RoomOption[] = []
const EMPTY_CAMPUSES: CampusOption[] = []
const EMPTY_SEMESTERS: SemesterOption[] = []
const EMPTY_TIME_SLOTS: TimeSlotOption[] = []
const EMPTY_FACULTIES: FacultyOption[] = []
const EMPTY_MAJORS: MajorOption[] = []
const EMPTY_SCHEDULES: Schedule[] = []

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

function hasScheduleCoverage(
  schedules: Schedule[],
  startDate: string,
  endDate: string,
  hasPractice: boolean,
) {
  const requiredTypes = hasPractice ? [false, true] : [false]
  return requiredTypes.every((isPractice) =>
    schedules.some(
      (schedule) =>
        schedule.is_thuc_hanh === isPractice &&
        schedule.start_date <= startDate &&
        schedule.end_date >= endDate,
    ),
  )
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
  const queryClient = useQueryClient()
  const [semesterId, setSemesterId] = useState<number>()
  const [campusId, setCampusId] = useState<number>()
  const [facultyId, setFacultyId] = useState<number>()
  const [majorId, setMajorId] = useState<number>()
  const [roomId, setRoomId] = useState<number>()
  const [weekAnchor, setWeekAnchor] = useState(() => toDateString(new Date()))
  const [draggedScheduleId, setDraggedScheduleId] = useState<number | null>(null)
  const [movingScheduleId, setMovingScheduleId] = useState<number | null>(null)
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [automaticScheduleOpen, setAutomaticScheduleOpen] = useState(false)
  const [automaticScheduleLoading, setAutomaticScheduleLoading] = useState(false)
  const [automaticScheduleMode, setAutomaticScheduleMode] =
    useState<AutomaticScheduleMode>('missing')
  const [automaticScheduleScope, setAutomaticScheduleScope] =
    useState<AutomaticScheduleScope>('all')
  const [automaticScheduleFacultyIds, setAutomaticScheduleFacultyIds] = useState<number[]>([])
  const [automaticScheduleRegistrationIds, setAutomaticScheduleRegistrationIds] =
    useState<number[]>([])
  const [confirmScheduleReplacement, setConfirmScheduleReplacement] = useState(false)
  const [automaticScheduleCampusId, setAutomaticScheduleCampusId] = useState<number>()
  const [automaticScheduleError, setAutomaticScheduleError] = useState<string | null>(null)
  const [automaticScheduleJobId, setAutomaticScheduleJobId] = useState<string | null>(null)
  const handledOptimizationJobId = useRef<string | null>(null)
  const [editForm] = Form.useForm<ScheduleEditValues>()
  const editingRegistrationId = Form.useWatch('dang_ky_mon_hoc_id', editForm)
  const editingIsPractice = Form.useWatch('is_thuc_hanh', editForm)
  const [messageApi, contextHolder] = message.useMessage()
  const optimizationJobQuery = useQuery({
    queryKey: ['optimization', 'schedule-job', automaticScheduleJobId],
    queryFn: async () => {
      const { data } = await apiClient.get<ScheduleOptimizationJob>(
        `/optimization/schedule/jobs/${automaticScheduleJobId}`,
      )
      return data
    },
    enabled: automaticScheduleJobId !== null,
    refetchInterval: (query) =>
      query.state.data?.status === 'pending' || query.state.data?.status === 'running'
        ? 1000
        : false,
  })
  useEffect(() => {
    const job = optimizationJobQuery.data
    if (
      !job ||
      job.status !== 'completed' ||
      !job.result ||
      handledOptimizationJobId.current === job.job_id
    ) {
      return
    }

    handledOptimizationJobId.current = job.job_id
    void queryClient.invalidateQueries({ queryKey: ['schedules'] })
    void queryClient.invalidateQueries({ queryKey: ['analytics'] })
    if (job.result.unscheduled_count === 0) {
      messageApi.success(job.result.message)
    }
  }, [
    messageApi,
    optimizationJobQuery.data,
    optimizationJobQuery.error,
    optimizationJobQuery.isError,
    queryClient,
  ])
  const displayedAutomaticScheduleError =
    automaticScheduleError ??
    (optimizationJobQuery.isError
      ? getErrorMessage(optimizationJobQuery.error)
      : optimizationJobQuery.data?.status === 'failed'
        ? optimizationJobQuery.data.error ??
          'Đã xảy ra lỗi trong quá trình phân bổ lịch. Vui lòng thử lại.'
        : null)
  const automaticScheduleResult =
    optimizationJobQuery.data?.status === 'completed'
      ? optimizationJobQuery.data.result
      : null
  const automaticScheduleIsRunning =
    automaticScheduleJobId !== null &&
    !optimizationJobQuery.isError &&
    (
      optimizationJobQuery.data === undefined ||
      optimizationJobQuery.data.status === 'pending' ||
      optimizationJobQuery.data.status === 'running'
    )

  const referencesQuery = useQuery({
    queryKey: ['timetable', 'references'],
    queryFn: async () => {
      const [
        classesResult,
        registrationsResult,
        subjectsResult,
        roomsResult,
        campusesResult,
        semestersResult,
        slotsResult,
        facultiesResult,
        majorsResult,
      ] = await Promise.all([
        apiClient.get<ClassOption[]>('/classes'),
        apiClient.get<RegistrationOption[]>('/course-registrations'),
        apiClient.get<SubjectOption[]>('/subjects'),
        apiClient.get<RoomOption[]>('/rooms'),
        apiClient.get<CampusOption[]>('/campus/all'),
        apiClient.get<SemesterOption[]>('/semesters'),
        apiClient.get<TimeSlotOption[]>('/time-slots'),
        apiClient.get<FacultyOption[]>('/faculties'),
        apiClient.get<MajorOption[]>('/majors'),
      ])
      return {
        classes: classesResult.data,
        registrations: registrationsResult.data,
        subjects: subjectsResult.data,
        rooms: roomsResult.data,
        campuses: campusesResult.data,
        semesters: semestersResult.data,
        timeSlots: slotsResult.data,
        faculties: facultiesResult.data,
        majors: majorsResult.data,
      }
    },
  })
  const classes = referencesQuery.data?.classes ?? EMPTY_CLASSES
  const registrations = referencesQuery.data?.registrations ?? EMPTY_REGISTRATIONS
  const subjects = referencesQuery.data?.subjects ?? EMPTY_SUBJECTS
  const rooms = referencesQuery.data?.rooms ?? EMPTY_ROOMS
  const campuses = referencesQuery.data?.campuses ?? EMPTY_CAMPUSES
  const semesters = referencesQuery.data?.semesters ?? EMPTY_SEMESTERS
  const timeSlots = referencesQuery.data?.timeSlots ?? EMPTY_TIME_SLOTS
  const faculties = referencesQuery.data?.faculties ?? EMPTY_FACULTIES
  const majors = referencesQuery.data?.majors ?? EMPTY_MAJORS
  const referencesLoading = referencesQuery.isLoading
  const referencesError = referencesQuery.error
    ? getErrorMessage(referencesQuery.error)
    : null
  const editingSubjectHasPractice = subjects.find(
    (subject) =>
      subject.id ===
      registrations.find((registration) => registration.id === editingRegistrationId)?.mon_id,
  )?.is_thuc_hanh

  const selectedSemesterId = semesterId ?? semesters[0]?.id

  const scheduleParams = useMemo(() => ({
    ...(selectedSemesterId !== undefined ? { semester_id: selectedSemesterId } : {}),
    ...(facultyId !== undefined ? { khoa_id: facultyId } : {}),
    ...(majorId !== undefined ? { nganh_id: majorId } : {}),
    ...(roomId !== undefined ? { room_id: roomId } : {}),
  }), [facultyId, majorId, roomId, selectedSemesterId])
  const schedulesQuery = useQuery({
    queryKey: ['schedules', scheduleParams],
    queryFn: async () => {
      const { data } = await apiClient.get<Schedule[]>('/schedules', {
        params: scheduleParams,
      })
      return data
    },
    enabled: selectedSemesterId !== undefined,
  })
  const allSemesterSchedulesQuery = useQuery({
    queryKey: ['schedules', { semester_id: selectedSemesterId }],
    queryFn: async () => {
      if (selectedSemesterId === undefined) return []
      const { data } = await apiClient.get<Schedule[]>('/schedules', {
        params: { semester_id: selectedSemesterId },
      })
      return data
    },
    enabled: automaticScheduleOpen && selectedSemesterId !== undefined,
    staleTime: 15_000,
  })
  const schedules = schedulesQuery.data ?? EMPTY_SCHEDULES
  const scheduleLoading = schedulesQuery.isFetching
  const scheduleError = schedulesQuery.error
    ? getErrorMessage(schedulesQuery.error)
    : null

  const weekStart = useMemo(() => startOfWeek(weekAnchor), [weekAnchor])
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart])
  const weekEnd = weekDays[6].date
  const weekLabel = `${formatDate(weekDays[0].date)} – ${formatDate(weekEnd)}`

  const visibleSchedules = useMemo(
    () => schedules.filter((schedule) =>
      (campusId === undefined ||
        rooms.find((room) => room.id === schedule.phong_hoc_id)?.campus_id === campusId) &&
      weekDays.some((day) =>
        day.dayOfWeek === schedule.day_of_week &&
        day.date >= schedule.start_date &&
        day.date <= schedule.end_date,
      ),
    ),
    [campusId, rooms, schedules, weekDays],
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

  const selectedSemester = semesters.find((semester) => semester.id === selectedSemesterId)
  const availableMajors = majors.filter(
    (major) => facultyId === undefined || major.khoa_id === facultyId,
  )
  const semesterRegistrations = registrations.filter(
    (registration) => registration.hoc_ky_id === selectedSemesterId,
  )
  const scopedSemesterRegistrations = semesterRegistrations.filter((registration) => {
    if (automaticScheduleScope === 'all') return true
    if (automaticScheduleScope === 'registrations') {
      return automaticScheduleRegistrationIds.includes(registration.id)
    }
    const schoolClass = classes.find((item) => item.id === registration.lop_id)
    const major = majors.find((item) => item.id === schoolClass?.nganh_id)
    return major?.khoa_id !== null &&
      major?.khoa_id !== undefined &&
      automaticScheduleFacultyIds.includes(major.khoa_id)
  })
  const allocationStartDate = selectedSemester
    ? selectedSemester.start_date > toDateString(new Date())
      ? selectedSemester.start_date
      : toDateString(new Date())
    : toDateString(new Date())
  const scheduledRegistrationIds = new Set(
    semesterRegistrations
      .filter((registration) => {
        if (automaticScheduleCampusId === undefined) return false
        const registrationSchedules = (allSemesterSchedulesQuery.data ?? []).filter(
          (schedule) =>
            schedule.dang_ky_mon_hoc_id === registration.id &&
            rooms.find((room) => room.id === schedule.phong_hoc_id)?.campus_id ===
              automaticScheduleCampusId,
        )
        const subject = subjects.find((item) => item.id === registration.mon_id)
        return hasScheduleCoverage(
          registrationSchedules,
          allocationStartDate,
          selectedSemester?.end_date ?? allocationStartDate,
          subject?.is_thuc_hanh ?? false,
        )
      })
      .map((registration) => registration.id),
  )
  const automaticScheduleRegistrations =
    automaticScheduleMode === 'all'
      ? scopedSemesterRegistrations
      : scopedSemesterRegistrations.filter(
        (registration) => !scheduledRegistrationIds.has(registration.id),
      )
  const allScopedRegistrationIds = scopedSemesterRegistrations.map(
    (registration) => registration.id,
  )
  const selectedCampusRooms = rooms.filter(
    (room) => room.campus_id === automaticScheduleCampusId,
  )
  const openAutomaticSchedule = async () => {
    if (selectedSemesterId === undefined) {
      messageApi.error('Vui lòng chọn học kỳ trước khi tự động xếp lịch.')
      return
    }
    setAutomaticScheduleLoading(true)
    try {
      await queryClient.fetchQuery({
        queryKey: ['schedules', { semester_id: selectedSemesterId }],
        queryFn: async () => {
          const { data } = await apiClient.get<Schedule[]>('/schedules', {
            params: { semester_id: selectedSemesterId },
          })
          return data
        },
        staleTime: 0,
      })
      setAutomaticScheduleMode('missing')
      setAutomaticScheduleScope('all')
      setAutomaticScheduleFacultyIds([])
      setAutomaticScheduleRegistrationIds([])
      setConfirmScheduleReplacement(false)
      setAutomaticScheduleCampusId(undefined)
      setAutomaticScheduleError(null)
      setAutomaticScheduleJobId(null)
      setAutomaticScheduleOpen(true)
    } catch (error: unknown) {
      messageApi.error(getErrorMessage(error))
    } finally {
      setAutomaticScheduleLoading(false)
    }
  }

  const runAutomaticSchedule = async () => {
    if (selectedSemesterId === undefined || automaticScheduleCampusId === undefined) return
    setAutomaticScheduleLoading(true)
    setAutomaticScheduleError(null)
    try {
      const { data } = await apiClient.post<Pick<ScheduleOptimizationJob, 'job_id' | 'status'>>(
        '/optimization/schedule',
        {
          hoc_ky_id: selectedSemesterId,
          campus_id: automaticScheduleCampusId,
          mode: automaticScheduleMode,
          ...(automaticScheduleScope === 'faculty'
            ? { khoa_ids: automaticScheduleFacultyIds }
            : { registration_ids: allScopedRegistrationIds }),
        },
      )
      setAutomaticScheduleJobId(data.job_id)
    } catch (error: unknown) {
      setAutomaticScheduleError(getErrorMessage(error))
    } finally {
      setAutomaticScheduleLoading(false)
    }
  }

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
      void queryClient.invalidateQueries({ queryKey: ['schedules'] })
      void queryClient.invalidateQueries({ queryKey: ['analytics'] })
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
      void queryClient.invalidateQueries({ queryKey: ['schedules'] })
      void queryClient.invalidateQueries({ queryKey: ['analytics'] })
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
            Xem lịch học theo tuần, học kỳ, cơ sở, khoa, ngành và phòng.
          </Typography.Text>
        </div>
        <Space wrap>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={() => void openAutomaticSchedule()}
            loading={automaticScheduleLoading}
            disabled={referencesLoading || selectedSemesterId === undefined}
          >
            Tự động xếp lịch
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ['schedules'] })
              void queryClient.invalidateQueries({ queryKey: ['timetable', 'references'] })
            }}
            loading={scheduleLoading || referencesLoading}
          >
            Tải lại
          </Button>
        </Space>
      </Flex>

      {referencesError && <Alert type="error" showIcon message={referencesError} />}
      {scheduleError && (
        <Alert
          type="error"
          showIcon
          message={scheduleError}
          action={
            <Button
              size="small"
              onClick={() => void schedulesQuery.refetch()}
            >
              Thử lại
            </Button>
          }
        />
      )}

      <Card>
        <Flex gap={12} wrap="wrap" align="end">
          <div style={{ minWidth: 220, flex: '1 1 220px' }}>
            <Typography.Text strong>Học kỳ</Typography.Text>
            <SearchFilterSelect
              aria-label="Lọc theo học kỳ"
              value={selectedSemesterId}
              options={semesters.map((semester) => ({ value: semester.id, label: semester.name }))}
              placeholder="Chọn học kỳ"
              style={{ width: '100%', marginTop: 6 }}
              onChange={(value: number | undefined) => {
                setSemesterId(value)
                const semester = semesters.find((item) => item.id === value)
                if (semester) setWeekAnchor(semester.start_date)
              }}
            />
          </div>
          <div style={{ minWidth: 200, flex: '1 1 200px' }}>
            <Typography.Text strong>Cơ sở</Typography.Text>
            <SearchFilterSelect
              aria-label="Lọc theo cơ sở"
              allowClear
              value={campusId}
              options={campuses.map((campus) => ({
                value: campus.id,
                label: campus.name,
              }))}
              placeholder="Tất cả cơ sở"
              style={{ width: '100%', marginTop: 6 }}
              onChange={(value: number | undefined) => setCampusId(value)}
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
        ) : !selectedSemesterId ? (
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
        title={`Tự động xếp lịch${selectedSemester ? ` · ${selectedSemester.name}` : ''}`}
        open={automaticScheduleOpen}
        onCancel={() => {
          setAutomaticScheduleOpen(false)
          setAutomaticScheduleError(null)
          setAutomaticScheduleJobId(null)
        }}
        onOk={() => void runAutomaticSchedule()}
        okText="Bắt đầu xếp lịch"
        cancelText="Hủy"
        confirmLoading={
          automaticScheduleLoading ||
          automaticScheduleIsRunning
        }
        okButtonProps={{
          disabled:
            automaticScheduleRegistrations.length === 0 ||
            automaticScheduleCampusId === undefined ||
            automaticScheduleIsRunning ||
            (automaticScheduleMode === 'all' && !confirmScheduleReplacement),
        }}
        width={640}
        destroyOnHidden
      >
        <Space direction="vertical" size="middle" style={{ display: 'flex' }}>
          {displayedAutomaticScheduleError && (
            <Alert
              type="error"
              showIcon
              message="Không thể hoàn thành phân bổ"
              description={
                <div style={{ whiteSpace: 'pre-line' }}>{displayedAutomaticScheduleError}</div>
              }
            />
          )}
          {automaticScheduleIsRunning && (
            <Alert
              type="info"
              showIcon
              message="Đang tối ưu lịch"
              description="Tác vụ đang chạy ở chế độ nền. Bạn có thể chờ kết quả tại đây."
            />
          )}
          {automaticScheduleResult && (
            <Alert
              type={automaticScheduleResult.unscheduled_count > 0 ? 'warning' : 'success'}
              showIcon
              message={automaticScheduleResult.message}
              description={
                <div>
                  <div>
                    Trạng thái solver: {automaticScheduleResult.solver_status}; khoảng cách tối ưu
                    phòng: {(automaticScheduleResult.relative_gap * 100).toFixed(1)}%.
                  </div>
                  {automaticScheduleResult.unscheduled_count > 0 && (
                    <>
                      <ul style={{ marginBottom: 0, paddingInlineStart: 20 }}>
                        {automaticScheduleResult.unscheduled_requirements
                          .slice(0, 20)
                          .map((requirement) => (
                            <li key={requirement.meeting_type + requirement.label}>
                              {requirement.label} ({requirement.meeting_type}): {requirement.reason}
                            </li>
                          ))}
                      </ul>
                      {automaticScheduleResult.unscheduled_count > 20 && (
                        <div>
                          Còn {automaticScheduleResult.unscheduled_count - 20} buổi chưa được liệt kê.
                        </div>
                      )}
                    </>
                  )}
                </div>
              }
            />
          )}
          <div>
            <Typography.Text strong>Cơ sở đào tạo</Typography.Text>
            <SearchFilterSelect
              aria-label="Chọn cơ sở để tự động phân bổ phòng"
              value={automaticScheduleCampusId}
              options={campuses.map((campus) => ({
                value: campus.id,
                label: campus.name,
              }))}
              placeholder="Chọn cơ sở"
              disabled={automaticScheduleIsRunning}
              style={{ width: '100%', marginTop: 6 }}
              onChange={(value: number | undefined) => {
                setAutomaticScheduleCampusId(value)
                setConfirmScheduleReplacement(false)
                setAutomaticScheduleError(null)
                setAutomaticScheduleJobId(null)
              }}
            />
            {automaticScheduleCampusId !== undefined && (
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: 6 }}>
                Cơ sở này có {selectedCampusRooms.length} phòng; solver chỉ sử dụng các phòng
                thuộc cơ sở đã chọn.
              </Typography.Text>
            )}
          </div>
          <div>
            <Typography.Text strong>Phạm vi đăng ký cần phân bổ</Typography.Text>
            <Radio.Group
              value={automaticScheduleScope}
              disabled={automaticScheduleIsRunning}
              onChange={(event) => {
                setAutomaticScheduleScope(event.target.value)
                setConfirmScheduleReplacement(false)
                setAutomaticScheduleError(null)
                setAutomaticScheduleJobId(null)
              }}
              style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}
              options={[
                // { value: 'all', label: 'Toàn bộ đăng ký trong kỳ' },
                { value: 'faculty', label: 'Theo khoa' },
                // { value: 'registrations', label: 'Chọn lớp / môn' },
              ]}
            />
            {automaticScheduleScope === 'faculty' && (
              <>
                <Select
                  mode="multiple"
                  aria-label="Chọn khoa cần phân bổ"
                  placeholder="Chọn một hoặc nhiều khoa"
                  disabled={automaticScheduleIsRunning}
                  value={automaticScheduleFacultyIds}
                  options={faculties.map((faculty) => ({
                    value: faculty.id,
                    label: faculty.name,
                  }))}
                  onChange={(values: number[]) => {
                    setAutomaticScheduleFacultyIds(values)
                    setConfirmScheduleReplacement(false)
                    setAutomaticScheduleError(null)
                    setAutomaticScheduleJobId(null)
                  }}
                  style={{ width: '100%', marginTop: 8 }}
                  optionFilterProp="label"
                />
                <Typography.Text type="secondary">
                  Hệ thống tự suy ra đăng ký qua lớp → ngành → khoa và chỉ đưa các môn thuộc
                  khoa đã chọn vào bộ xếp lịch tại cơ sở ở trên.
                  {` Tìm thấy ${scopedSemesterRegistrations.length} đăng ký trong học kỳ.`}
                </Typography.Text>
              </>
            )}
            {automaticScheduleScope === 'registrations' && (
              <Select
                mode="multiple"
                aria-label="Chọn đăng ký lớp và môn học"
                placeholder="Chọn lớp / môn học"
                disabled={automaticScheduleIsRunning}
                value={automaticScheduleRegistrationIds}
                options={semesterRegistrations.map((registration) => {
                  const schoolClass = classes.find((item) => item.id === registration.lop_id)
                  const subject = subjects.find((item) => item.id === registration.mon_id)
                  return {
                    value: registration.id,
                    label: `${schoolClass?.name ?? `Lớp ${registration.lop_id}`} · ${
                      subject?.name ?? `Môn ${registration.mon_id}`
                    }`,
                  }
                })}
                onChange={(values: number[]) => {
                  setAutomaticScheduleRegistrationIds(values)
                  setConfirmScheduleReplacement(false)
                  setAutomaticScheduleError(null)
                  setAutomaticScheduleJobId(null)
                }}
                style={{ width: '100%', marginTop: 8 }}
                optionFilterProp="label"
              />
            )}
          </div>
          <Typography.Text>
            Mỗi đăng ký được xếp lịch cố định hằng tuần trong học kỳ. Môn được cấu hình là thực
            hành sẽ có một lịch lý thuyết và một lịch thực hành riêng; lịch thực hành dùng phòng
            thực hành, còn lịch lý thuyết dùng phòng thường.
          </Typography.Text>
          <Typography.Text type="secondary">
            Nếu đăng ký trong phạm vi chọn đang có lịch tương lai ở cơ sở khác, lịch đó sẽ được
            thay bằng lịch tại cơ sở đã chọn.
          </Typography.Text>
          <Radio.Group
            value={automaticScheduleMode}
            disabled={automaticScheduleIsRunning}
            optionType="button"
            buttonStyle="solid"
            options={[
              { value: 'missing', label: 'Chỉ xếp môn chưa có lịch' },
              { value: 'all', label: 'Phân bổ lại phạm vi đã chọn' },
            ]}
            onChange={(event) => {
              setAutomaticScheduleMode(event.target.value)
              setConfirmScheduleReplacement(false)
              setAutomaticScheduleError(null)
              setAutomaticScheduleJobId(null)
            }}
          />
          {automaticScheduleMode === 'all' && (
            <>
              <Alert
                type="warning"
                showIcon
                message={`Các lịch tương lai của ${allScopedRegistrationIds.length} đăng ký trong phạm vi sẽ được thay thế.`}
                description="Lịch đã qua được giữ nguyên. Lịch cũ chỉ được xóa khi phương án mới giải được và giao dịch lưu thành công; nếu solver hoặc cơ sở dữ liệu lỗi, giao dịch rollback để giữ lịch cũ."
              />
              <Checkbox
                checked={confirmScheduleReplacement}
                disabled={automaticScheduleIsRunning}
                onChange={(event) => setConfirmScheduleReplacement(event.target.checked)}
              >
                Tôi xác nhận phân bổ lại các đăng ký trong phạm vi đã chọn
              </Checkbox>
            </>
          )}
          <div>
            <Typography.Text strong>Phân loại lịch theo môn học</Typography.Text>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
              Phân loại thực hành lấy từ danh sách mã môn cấu hình ở backend, không chọn thủ công
              tại đây.
            </Typography.Text>
            {automaticScheduleRegistrations.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="Không có đăng ký môn học cần xếp lịch"
              />
            ) : (
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
                <Space direction="vertical" size={10} style={{ display: 'flex' }}>
                  {automaticScheduleRegistrations.map((registration) => {
                    const schoolClass = classes.find((item) => item.id === registration.lop_id)
                    const subject = subjects.find((item) => item.id === registration.mon_id)
                    const roomTypes = subject?.is_thuc_hanh ? [false, true] : [false]
                    const missingRoomTypes = roomTypes.filter((isPractice) =>
                      !selectedCampusRooms.some(
                        (room) =>
                          room.capacity >= registration.so_luong &&
                          room.is_thuc_hanh === isPractice,
                      ),
                    )
                    return (
                      <Flex key={registration.id} vertical gap={4}>
                        <Flex align="center" gap={8} wrap="wrap">
                          {schoolClass?.name ?? `Lớp ${registration.lop_id}`}
                          {' · '}
                          {subject?.name ?? `Môn ${registration.mon_id}`}
                          {' · '}
                          {registration.so_luong} sinh viên
                          <Tag color={subject?.is_thuc_hanh ? 'purple' : 'blue'}>
                          {subject?.is_thuc_hanh ? 'Lý thuyết + thực hành' : 'Lý thuyết'}
                          </Tag>
                        </Flex>
                        {automaticScheduleCampusId !== undefined &&
                          missingRoomTypes.map((isPractice) => (
                          <Typography.Text key={String(isPractice)} type="danger">
                            {isPractice
                              ? 'Thiếu phòng thực hành đủ sức chứa tại cơ sở này.'
                              : selectedCampusRooms.some(
                                    (room) => room.capacity >= registration.so_luong,
                                  )
                                ? 'Không có phòng thường đủ sức chứa; phòng thực hành không dùng cho lý thuyết.'
                                : `Không có phòng đủ ${registration.so_luong} chỗ tại cơ sở này.`}
                          </Typography.Text>
                          ))}
                      </Flex>
                    )
                  })}
                </Space>
              </div>
            )}
          </div>
        </Space>
      </Modal>
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
              disabled
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
                disabled
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
                options={rooms
                  .filter((room) =>
                    room.is_thuc_hanh === Boolean(editingIsPractice) &&
                    room.capacity >= (
                      registrations.find((registration) => registration.id === editingRegistrationId)
                        ?.so_luong ?? 0
                    ),
                  )
                  .map((room) => ({
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
            <Switch
              disabled={!editingSubjectHasPractice && !editingSchedule?.is_thuc_hanh}
              checkedChildren="Thực hành"
              unCheckedChildren="Lý thuyết"
            />
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
  subjects: SubjectOption[]
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
