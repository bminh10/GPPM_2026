import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Row,
  Space,
  Spin,
  Statistic,
  Typography,
} from 'antd'
import {
  ApartmentOutlined,
  BarChartOutlined,
  CalendarOutlined,
  FilterOutlined,
  ScheduleOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import type { EChartsCoreOption } from 'echarts/core'
import { apiClient, getErrorMessage } from '../../services/apiClient'
import EChart from '../../components/charts/EChart'
import EnergyDashboard from '../../components/energy/EnergyDashboard'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import SearchFilterSelect from '../../components/common/SearchFilterSelect'
import SearchableTable from '../../components/common/SearchableTable'
import './Dashboard.css'

type RoomUtilization = {
  room_id: number
  room_name: string
  occupied_slots: number
  available_slots: number
  utilization_rate: number
}

type RoomUtilizationResponse = {
  start_date: string
  end_date: string
  rooms: RoomUtilization[]
}

type RoomDemand = {
  day_of_week: number
  time_slot_id: number
  time_slot_name: string
  schedule_count: number
}

type RoomDemandResponse = {
  start_date: string
  end_date: string
  demand: RoomDemand[]
}

type UnderutilizedRoomsResponse = {
  start_date: string
  end_date: string
  threshold: number
  rooms: RoomUtilization[]
}

type MajorOption = { id: number; name: string }
type ClassOption = { id: number; name: string; nganh_id: number }
type SemesterOption = { id: number; name: string; start_date: string; end_date: string }
type WeekOption = { start_date: string; end_date: string; label: string }
type CampusOption = { id: number; name: string }
type RoomOption = { id: number; building: string | null; campus_id: number }

const EMPTY_MAJORS: MajorOption[] = []
const EMPTY_CLASSES: ClassOption[] = []
const EMPTY_SEMESTERS: SemesterOption[] = []
const EMPTY_CAMPUSES: CampusOption[] = []
const EMPTY_ROOMS: RoomOption[] = []
const dayNames = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN').format(new Date(`${value}T00:00:00`))
}

function toDateString(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getWeeks(semester: SemesterOption | undefined): WeekOption[] {
  if (!semester) return []
  const semesterStart = new Date(`${semester.start_date}T00:00:00`)
  const semesterEnd = new Date(`${semester.end_date}T00:00:00`)
  const cursor = new Date(semesterStart)
  cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7))
  const weeks: WeekOption[] = []

  while (cursor <= semesterEnd) {
    const weekStart = new Date(Math.max(cursor.getTime(), semesterStart.getTime()))
    const sunday = new Date(cursor)
    sunday.setDate(sunday.getDate() + 6)
    const weekEnd = new Date(Math.min(sunday.getTime(), semesterEnd.getTime()))
    weeks.push({
      start_date: toDateString(weekStart),
      end_date: toDateString(weekEnd),
      label: `${formatDate(toDateString(weekStart))} – ${formatDate(toDateString(weekEnd))}`,
    })
    cursor.setDate(cursor.getDate() + 7)
  }

  return weeks
}

export default function Dashboard() {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<{
    majorId: number | null
    classId: number | null
    semesterId: number | null
    week: WeekOption | null
    campusId: number | null | undefined
    building: string | null
  }>({ majorId: null, classId: null, semesterId: null, week: null, campusId: undefined, building: null })
  const referencesQuery = useQuery({
    queryKey: ['dashboard', 'references'],
    queryFn: async () => {
      const [majorsResponse, classesResponse, semestersResponse, campusesResponse, roomsResponse] =
        await Promise.all([
          apiClient.get<MajorOption[]>('/majors'),
          apiClient.get<ClassOption[]>('/classes'),
          apiClient.get<SemesterOption[]>('/semesters'),
          apiClient.get<CampusOption[]>('/campus/all'),
          apiClient.get<RoomOption[]>('/rooms'),
        ])
      return {
        majors: majorsResponse.data,
        classes: classesResponse.data,
        semesters: semestersResponse.data,
        campuses: campusesResponse.data,
        rooms: roomsResponse.data,
      }
    },
  })
  const majors = referencesQuery.data?.majors ?? EMPTY_MAJORS
  const classes = referencesQuery.data?.classes ?? EMPTY_CLASSES
  const semesters = referencesQuery.data?.semesters ?? EMPTY_SEMESTERS
  const campuses = referencesQuery.data?.campuses ?? EMPTY_CAMPUSES
  const rooms = referencesQuery.data?.rooms ?? EMPTY_ROOMS
  const filtersLoading = referencesQuery.isLoading
  const filtersError = referencesQuery.error
    ? getErrorMessage(referencesQuery.error)
    : null

  const campusesWithRooms = useMemo(
    () => campuses.filter((campus) => rooms.some((room) => room.campus_id === campus.id)),
    [campuses, rooms],
  )
  const campusId = filters.campusId === undefined
    ? campusesWithRooms[0]?.id ?? null
    : filters.campusId
  const selectedSemester = semesters.find((semester) => semester.id === filters.semesterId)
  const availableBuildings = useMemo(
    () => [...new Set(rooms
      .filter((room) => campusId === null || room.campus_id === campusId)
      .map((room) => room.building)
      .filter((building): building is string => Boolean(building)))].sort(),
    [campusId, rooms],
  )
  const weeks = useMemo(() => getWeeks(selectedSemester), [selectedSemester])
  const availableClasses = useMemo(
    () => classes.filter((schoolClass) => filters.majorId === null || schoolClass.nganh_id === filters.majorId),
    [classes, filters.majorId],
  )

  const analyticsParams = useMemo(() => ({
    ...(filters.classId !== null ? { lop_id: filters.classId } : {}),
    ...(filters.majorId !== null ? { nganh_id: filters.majorId } : {}),
    ...(filters.semesterId !== null ? { hoc_ky_id: filters.semesterId } : {}),
    ...(campusId !== null ? { campus_id: campusId } : {}),
    ...(filters.building !== null ? { building: filters.building } : {}),
    ...(filters.week
      ? { start_date: filters.week.start_date, end_date: filters.week.end_date }
      : selectedSemester
        ? { start_date: selectedSemester.start_date, end_date: selectedSemester.end_date }
        : {}),
  }), [campusId, filters, selectedSemester])

  const analyticsQuery = useQuery({
    queryKey: ['analytics', analyticsParams],
    queryFn: async () => {
      const [utilizationResponse, demandResponse, underutilizedResponse] = await Promise.all([
        apiClient.get<RoomUtilizationResponse>('/analytics/room-utilization', { params: analyticsParams }),
        apiClient.get<RoomDemandResponse>('/analytics/room-demand', { params: analyticsParams }),
        apiClient.get<UnderutilizedRoomsResponse>('/analytics/underutilized-rooms', { params: analyticsParams }),
      ])
      return {
        utilization: utilizationResponse.data,
        demand: demandResponse.data,
        underutilized: underutilizedResponse.data,
      }
    },
    enabled: referencesQuery.isSuccess,
  })
  const utilization = analyticsQuery.data?.utilization ?? null
  const demand = analyticsQuery.data?.demand ?? null
  const underutilized = analyticsQuery.data?.underutilized ?? null
  const loading = analyticsQuery.isFetching
  const error = analyticsQuery.error ? getErrorMessage(analyticsQuery.error) : null

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['analytics'] })
  }

  const updateFilters = (updates: Partial<typeof filters>) => {
    setFilters((current) => ({ ...current, ...updates }))
  }

  const averageUtilization = useMemo(() => {
    if (!utilization?.rooms.length) return 0
    return (
      (utilization.rooms.reduce((total, room) => total + room.utilization_rate, 0) /
        utilization.rooms.length) *
      100
    )
  }, [utilization])

  const utilizationOption = useMemo<EChartsCoreOption>(() => ({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (value: unknown) => `${Number(value).toFixed(1)}%`,
    },
    grid: { left: 16, right: 32, top: 12, bottom: 88, containLabel: true },
    yAxis: {
      type: 'value',
      max: 100,
      axisLabel: { formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#edf1f5' } },
    },
    xAxis: {
      type: 'category',
      data: [...(utilization?.rooms ?? [])].reverse().map((room) => room.room_name),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: {
        interval: 0,
        rotate: 35,
        hideOverlap: false,
        fontSize: 10,
        width: 110,
        overflow: 'break',
      },
    },
    series: [
      {
        type: 'bar',
        data: [...(utilization?.rooms ?? [])]
          .reverse()
          .map((room) => Number((room.utilization_rate * 100).toFixed(1))),
        barMaxWidth: 22,
        showBackground: true,
        backgroundStyle: { color: '#f1f5f9', borderRadius: 5 },
        itemStyle: { color: '#1687d9', borderRadius: [0, 5, 5, 0] },
        label: { show: true, position: 'top', formatter: '{c}%' },
      },
    ],
  }), [utilization])

  const demandOption = useMemo<EChartsCoreOption>(() => {
    const slots = [...new Set((demand?.demand ?? []).map((item) => item.time_slot_name))]
    const values = (demand?.demand ?? []).map((item) => [
      slots.indexOf(item.time_slot_name),
      item.day_of_week - 2,
      item.schedule_count,
    ])

    return {
      tooltip: {
        position: 'top',
        formatter: (params: unknown) => {
          if (!params || typeof params !== 'object') return ''
          const item = Array.isArray(params) ? params[0] : params
          if (
            !item ||
            typeof item !== 'object' ||
            !('value' in item) ||
            !Array.isArray(item.value)
          ) return ''
          const [slotIndex, dayIndex, count] = item.value.map(Number)
          return `${dayNames[dayIndex]}<br/>${slots[slotIndex]}: ${count} buổi`
        },
      },
      grid: { left: 16, right: 72, top: 12, bottom: 78, containLabel: true },
      xAxis: {
        type: 'category',
        data: slots,
        splitArea: { show: true },
        axisTick: { show: false },
        axisLine: { show: false },
      },
      yAxis: {
        type: 'category',
        data: dayNames,
        splitArea: { show: true },
        axisTick: { show: false },
        axisLine: { show: false },
      },
      visualMap: {
        min: 0,
        max: Math.max(1, ...(demand?.demand ?? []).map((item) => item.schedule_count)),
        orient: 'vertical',
        right: 4,
        top: 'middle',
        itemHeight: 120,
        itemWidth: 10,
        textStyle: { fontSize: 10, color: '#64748b' },
        inRange: { color: ['#eaf4fc', '#84c5f4', '#1687d9', '#07508d'] },
      },
      series: [
        {
          type: 'heatmap',
          data: values,
          label: { show: true, color: '#16324f' },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.2)',
            },
          },
        },
      ],
    }
  }, [demand])

  const period = utilization
    ? `${formatDate(utilization.start_date)} – ${formatDate(utilization.end_date)}`
    : 'Đang tải khoảng thời gian...'

  return (
    <Flex vertical gap={20} className="dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-hero-content">
          <span className="dashboard-eyebrow">
            <BarChartOutlined />
            TRUNG TÂM PHÂN TÍCH
          </span>
          <Typography.Title level={2} className="dashboard-title">
            Tổng quan phân tích
          </Typography.Title>
          <Typography.Text className="dashboard-subtitle">
            Theo dõi hiệu quả khai thác phòng học và nhu cầu sử dụng trên toàn hệ thống.
          </Typography.Text>
          <span className="dashboard-period">
            <CalendarOutlined />
            Dữ liệu từ {period}
          </span>
        </div>
        <div className="dashboard-hero-decoration" aria-hidden="true" />
      </section>

      <Card className="dashboard-filter-panel">
        <Flex vertical gap={16}>
          <Flex align="center" justify="space-between" wrap="wrap" gap={12}>
            <Flex align="center" gap={12}>
              <span className="dashboard-filter-icon"><FilterOutlined /></span>
              <div className="dashboard-filter-heading">
                <Typography.Text strong>Bộ lọc dữ liệu</Typography.Text>
                <Typography.Text type="secondary">
                  Tùy chỉnh phạm vi báo cáo theo cơ sở, lớp học và thời gian
                </Typography.Text>
              </div>
            </Flex>
            <span className="dashboard-filter-hint">Các biểu đồ và chỉ số sẽ được cập nhật theo bộ lọc</span>
          </Flex>
          <Space wrap className="dashboard-filter-controls" size={[12, 12]}>
            <SearchFilterSelect
              aria-label="Lọc theo cơ sở"
              placeholder="Tất cả cơ sở"
              allowClear
              showSearch
              optionFilterProp="label"
              loading={filtersLoading}
              style={{ width: 220 }}
              value={campusId ?? undefined}
              options={campusesWithRooms.map((campus) => ({ value: campus.id, label: campus.name }))}
              onChange={(campusId: number | undefined) =>
                updateFilters({
                  campusId: campusId ?? null,
                  building: null,
                })
              }
            />
            <SearchFilterSelect
              aria-label="Lọc theo tòa"
              placeholder="Tất cả tòa"
              allowClear
              showSearch
              optionFilterProp="label"
              disabled={availableBuildings.length === 0}
              style={{ width: 200 }}
              value={filters.building ?? undefined}
              options={availableBuildings.map((building) => ({ value: building, label: building }))}
              onChange={(building: string | undefined) =>
                updateFilters({ building: building ?? null })
              }
            />
            <SearchFilterSelect
              aria-label="Lọc theo ngành"
              placeholder="Tất cả ngành"
              allowClear
              showSearch
              optionFilterProp="label"
              loading={filtersLoading}
              style={{ width: 220 }}
              value={filters.majorId ?? undefined}
              options={majors.map((major) => ({ value: major.id, label: major.name }))}
              onChange={(majorId: number | undefined) =>
                updateFilters({
                  majorId: majorId ?? null,
                  classId: null,
                })
              }
            />
            <SearchFilterSelect
              aria-label="Lọc theo lớp"
              placeholder="Tất cả lớp"
              allowClear
              showSearch
              optionFilterProp="label"
              loading={filtersLoading}
              style={{ width: 220 }}
              value={filters.classId ?? undefined}
              options={availableClasses.map((schoolClass) => ({
                value: schoolClass.id,
                label: schoolClass.name,
              }))}
              onChange={(classId: number | undefined) => updateFilters({ classId: classId ?? null })}
            />
            <SearchFilterSelect
              aria-label="Lọc theo học kỳ"
              placeholder="Tất cả học kỳ"
              allowClear
              showSearch
              optionFilterProp="label"
              loading={filtersLoading}
              style={{ width: 220 }}
              value={filters.semesterId ?? undefined}
              options={semesters.map((semester) => ({ value: semester.id, label: semester.name }))}
              onChange={(semesterId: number | undefined) =>
                updateFilters({ semesterId: semesterId ?? null, week: null })
              }
            />
            <SearchFilterSelect
              aria-label="Lọc theo tuần"
              placeholder="Chọn tuần"
              allowClear
              disabled={filters.semesterId === null}
              style={{ width: 260 }}
              value={filters.week?.start_date}
              options={weeks.map((week) => ({ value: week.start_date, label: week.label }))}
              onChange={(startDate: string | undefined) =>
                updateFilters({ week: weeks.find((week) => week.start_date === startDate) ?? null })
              }
            />
          </Space>
        </Flex>
        {filtersError && (
          <Alert
            className="dashboard-filter-error"
            type="error"
            showIcon
            message="Không thể tải danh sách bộ lọc"
            description={filtersError}
          />
        )}
      </Card>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Không thể tải dữ liệu phân tích"
          description={error}
          action={
            <Button size="small" onClick={refresh}>
              Thử lại
            </Button>
          }
        />
      )}

      <Spin spinning={loading && !utilization}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} xl={6}>
            <Card className="dashboard-stat-card">
              <div className="dashboard-stat-heading">
                <span className="dashboard-stat-icon tone-blue"><ApartmentOutlined /></span>
                <Typography.Text type="secondary">Tổng số phòng</Typography.Text>
              </div>
              <Statistic className="dashboard-statistic" value={utilization?.rooms.length ?? 0} />
              <Typography.Text className="dashboard-stat-caption">Trong phạm vi lọc hiện tại</Typography.Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card className="dashboard-stat-card">
              <div className="dashboard-stat-heading">
                <span className="dashboard-stat-icon tone-green"><TeamOutlined /></span>
                <Typography.Text type="secondary">Tỷ lệ sử dụng trung bình</Typography.Text>
              </div>
              <Statistic className="dashboard-statistic" value={averageUtilization} precision={1} suffix="%" />
              <Typography.Text className="dashboard-stat-caption">Tính trên các phòng trong kỳ</Typography.Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card className="dashboard-stat-card">
              <div className="dashboard-stat-heading">
                <span className="dashboard-stat-icon tone-violet"><ScheduleOutlined /></span>
                <Typography.Text type="secondary">Lượt sử dụng phòng</Typography.Text>
              </div>
              <Statistic
                className="dashboard-statistic"
                value={utilization?.rooms.reduce((total, room) => total + room.occupied_slots, 0) ?? 0}
              />
              <Typography.Text className="dashboard-stat-caption">Tổng lượt sử dụng trong kỳ</Typography.Text>
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card className="dashboard-stat-card">
              <div className="dashboard-stat-heading">
                <span className="dashboard-stat-icon tone-amber"><WarningOutlined /></span>
                <Typography.Text type="secondary">
                  Phòng sử dụng dưới {((underutilized?.threshold ?? 0.2) * 100).toFixed(0)}%
                </Typography.Text>
              </div>
              <Statistic
                className="dashboard-statistic"
                value={underutilized?.rooms.length ?? 0}
                valueStyle={{ color: underutilized?.rooms.length ? '#c76c0a' : undefined }}
              />
              <Typography.Text className="dashboard-stat-caption">Cần lưu ý về hiệu suất khai thác</Typography.Text>
            </Card>
          </Col>
        </Row>
      </Spin>

      <EnergyDashboard>
        {({ summary, comparison, roomTable }) => (
          <>
            {summary}
            <Spin spinning={loading && !utilization}>
              <Row gutter={[16, 16]}>
                <Col xs={24} xl={12}>
                  <Card
                    className="dashboard-panel"
                    title={<div className="dashboard-panel-title">
                      <span className="dashboard-panel-icon"><ApartmentOutlined /></span>
                      <div>
                        <Typography.Text strong>Tỷ lệ sử dụng theo phòng</Typography.Text>
                        <Typography.Text type="secondary">
                          {[
                            campusesWithRooms.find((campus) => campus.id === campusId)?.name,
                            filters.building,
                          ].filter(Boolean).join(' · ') || 'Tất cả cơ sở và tòa nhà'}
                        </Typography.Text>
                      </div>
                    </div>}
                  >
                    {utilization?.rooms.length ? (
                      <EChart option={utilizationOption} />
                    ) : (
                      <Empty description="Chưa có dữ liệu sử dụng phòng" />
                    )}
                  </Card>
                </Col>
                <Col xs={24} xl={12}>
                  {comparison}
                </Col>
              </Row>
              <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col span={24}>
                  <Card
                    className="dashboard-panel"
                    title={<div className="dashboard-panel-title">
                      <span className="dashboard-panel-icon"><ScheduleOutlined /></span>
                      <div>
                        <Typography.Text strong>Nhu cầu phòng theo ngày và ca học</Typography.Text>
                        <Typography.Text type="secondary">Số buổi theo thời gian đã chọn</Typography.Text>
                      </div>
                    </div>}
                  >
                    {demand?.demand.length ? (
                      <EChart option={demandOption} height={390} />
                    ) : (
                      <Empty description="Chưa có dữ liệu nhu cầu phòng" />
                    )}
                  </Card>
                </Col>
                <Col span={24}>
                  <Card
                    className="dashboard-panel dashboard-panel-warning"
                    title={<div className="dashboard-panel-title">
                      <span className="dashboard-panel-icon dashboard-panel-icon-warning"><WarningOutlined /></span>
                      <div>
                        <Typography.Text strong>Phòng có tỷ lệ sử dụng thấp</Typography.Text>
                        <Typography.Text type="secondary">Danh sách phòng dưới ngưỡng sử dụng hiện tại</Typography.Text>
                      </div>
                    </div>}
                  >
                    <SearchableTable<RoomUtilization>
                      rowKey={(room) => room.room_id}
                      size="small"
                      pagination={{ pageSize: 5, hideOnSinglePage: true }}
                      dataSource={underutilized?.rooms ?? []}
                      searchPlaceholder="Tìm phòng..."
                      getSearchText={(room) => room.room_name}
                      emptyText="Không có phòng nào dưới ngưỡng sử dụng"
                      columns={[
                        { title: 'Phòng', dataIndex: 'room_name', key: 'room_name' },
                        { title: 'Lượt sử dụng', dataIndex: 'occupied_slots', key: 'occupied_slots' },
                        {
                          title: 'Lượt còn trống',
                          dataIndex: 'available_slots',
                          key: 'available_slots',
                        },
                        {
                          title: 'Tỷ lệ sử dụng',
                          dataIndex: 'utilization_rate',
                          key: 'utilization_rate',
                          render: (rate: number) => `${(rate * 100).toFixed(1)}%`,
                        },
                      ]}
                    />
                  </Card>
                </Col>
              </Row>
            </Spin>
            {roomTable}
          </>
        )}
      </EnergyDashboard>
    </Flex>
  )
}
