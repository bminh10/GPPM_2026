import { useEffect, useMemo, useRef, useState } from 'react'
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
  ReloadOutlined,
  ScheduleOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { BarChart, HeatmapChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import { init, use as registerEChartsModules } from 'echarts/core'
import type { ECharts, EChartsCoreOption } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { apiClient, getErrorMessage } from '../../services/apiClient'
import SearchFilterSelect from '../../components/common/SearchFilterSelect'
import SearchableTable from '../../components/common/SearchableTable'

registerEChartsModules([BarChart, HeatmapChart, GridComponent, TooltipComponent, VisualMapComponent, CanvasRenderer])

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
  const [utilization, setUtilization] = useState<RoomUtilizationResponse | null>(null)
  const [demand, setDemand] = useState<RoomDemandResponse | null>(null)
  const [underutilized, setUnderutilized] = useState<UnderutilizedRoomsResponse | null>(null)
  const [majors, setMajors] = useState<MajorOption[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [semesters, setSemesters] = useState<SemesterOption[]>([])
  const [campuses, setCampuses] = useState<CampusOption[]>([])
  const [rooms, setRooms] = useState<RoomOption[]>([])
  const [filters, setFilters] = useState<{
    majorId: number | null
    classId: number | null
    semesterId: number | null
    week: WeekOption | null
    campusId: number | null
    building: string | null
  }>({ majorId: null, classId: null, semesterId: null, week: null, campusId: null, building: null })
  const [loading, setLoading] = useState(true)
  const [filtersLoading, setFiltersLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtersError, setFiltersError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true

    Promise.all([
      apiClient.get<MajorOption[]>('/majors'),
      apiClient.get<ClassOption[]>('/classes'),
      apiClient.get<SemesterOption[]>('/semesters'),
      apiClient.get<CampusOption[]>('/campus/all'),
      apiClient.get<RoomOption[]>('/rooms'),
    ])
      .then(([majorsResponse, classesResponse, semestersResponse, campusesResponse, roomsResponse]) => {
        if (!active) return
        setMajors(majorsResponse.data)
        setClasses(classesResponse.data)
        setSemesters(semestersResponse.data)
        setCampuses(campusesResponse.data)
        setRooms(roomsResponse.data)
        const campusesWithRooms = campusesResponse.data.filter((campus) =>
          roomsResponse.data.some((room) => room.campus_id === campus.id),
        )
        setFilters((current) => ({
          ...current,
          campusId: campusesWithRooms[0]?.id ?? null,
        }))
      })
      .catch((requestError: unknown) => {
        if (active) setFiltersError(getErrorMessage(requestError))
      })
      .finally(() => {
        if (active) setFiltersLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const selectedSemester = semesters.find((semester) => semester.id === filters.semesterId)
  const campusesWithRooms = useMemo(
    () => campuses.filter((campus) => rooms.some((room) => room.campus_id === campus.id)),
    [campuses, rooms],
  )
  const availableBuildings = useMemo(
    () => [...new Set(rooms
      .filter((room) => filters.campusId === null || room.campus_id === filters.campusId)
      .map((room) => room.building)
      .filter((building): building is string => Boolean(building)))].sort(),
    [filters.campusId, rooms],
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
    ...(filters.campusId !== null ? { campus_id: filters.campusId } : {}),
    ...(filters.building !== null ? { building: filters.building } : {}),
    ...(filters.week
      ? { start_date: filters.week.start_date, end_date: filters.week.end_date }
      : selectedSemester
        ? { start_date: selectedSemester.start_date, end_date: selectedSemester.end_date }
        : {}),
  }), [filters, selectedSemester])

  useEffect(() => {
    let active = true

    Promise.all([
      apiClient.get<RoomUtilizationResponse>('/analytics/room-utilization', { params: analyticsParams }),
      apiClient.get<RoomDemandResponse>('/analytics/room-demand', { params: analyticsParams }),
      apiClient.get<UnderutilizedRoomsResponse>('/analytics/underutilized-rooms', { params: analyticsParams }),
    ])
      .then(([utilizationResponse, demandResponse, underutilizedResponse]) => {
        if (!active) return
        setUtilization(utilizationResponse.data)
        setDemand(demandResponse.data)
        setUnderutilized(underutilizedResponse.data)
      })
      .catch((requestError: unknown) => {
        if (active) setError(getErrorMessage(requestError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [analyticsParams, refreshKey])

  const refresh = () => {
    setLoading(true)
    setError(null)
    setRefreshKey((key) => key + 1)
  }

  const updateFilters = (updates: Partial<typeof filters>) => {
    setLoading(true)
    setError(null)
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
    grid: { left: 16, right: 32, top: 12, bottom: 24, containLabel: true },
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
        label: { show: true, position: 'right', formatter: '{c}%' },
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
      grid: { left: 16, right: 16, top: 12, bottom: 28, containLabel: true },
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
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
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
    <Flex vertical gap={20}>
      <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>Tổng quan phân tích</Typography.Title>
          <Typography.Text type="secondary">Dữ liệu từ {period}</Typography.Text>
        </div>
        <Button
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={refresh}
        >
          Làm mới
        </Button>
      </Flex>

      <Card size="small">
        <Space wrap style={{ width: '100%' }} size={[12, 12]}>
          <SearchFilterSelect
            aria-label="Lọc theo cơ sở"
            placeholder="Tất cả cơ sở"
            allowClear
            showSearch
            optionFilterProp="label"
            loading={filtersLoading}
            style={{ width: 220 }}
            value={filters.campusId ?? undefined}
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
            placeholder="Cả khoảng thời gian"
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
        {filtersError && (
          <Alert
            style={{ marginTop: 12 }}
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
            <Card>
              <Statistic
                title="Tổng số phòng"
                value={utilization?.rooms.length ?? 0}
                prefix={<ApartmentOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card>
              <Statistic
                title="Tỷ lệ sử dụng trung bình"
                value={averageUtilization}
                precision={1}
                suffix="%"
                prefix={<TeamOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card>
              <Statistic
                title="Lượt sử dụng phòng"
                value={utilization?.rooms.reduce((total, room) => total + room.occupied_slots, 0) ?? 0}
                prefix={<ScheduleOutlined />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} xl={6}>
            <Card>
              <Statistic
                title={`Phòng sử dụng dưới ${((underutilized?.threshold ?? 0.2) * 100).toFixed(0)}%`}
                value={underutilized?.rooms.length ?? 0}
                prefix={<WarningOutlined />}
                valueStyle={{ color: underutilized?.rooms.length ? '#d97706' : undefined }}
              />
            </Card>
          </Col>

          <Col xs={24} xl={12}>
            <Card
              title={[
                'Tỷ lệ sử dụng theo phòng',
                campusesWithRooms.find((campus) => campus.id === filters.campusId)?.name,
                filters.building,
              ].filter(Boolean).join(' · ')}
            >
              {utilization?.rooms.length ? (
                <EChart option={utilizationOption} />
              ) : (
                <Empty description="Chưa có dữ liệu sử dụng phòng" />
              )}
            </Card>
          </Col>
          <Col xs={24} xl={12}>
            <Card title="Nhu cầu phòng theo ngày và ca học (số lượng buổi trong học kỳ)">
              {demand?.demand.length ? (
                <EChart option={demandOption} />
              ) : (
                <Empty description="Chưa có dữ liệu nhu cầu phòng" />
              )}
            </Card>
          </Col>
          <Col span={24}>
            <Card title="Phòng có tỷ lệ sử dụng thấp">
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
    </Flex>
  )
}

function EChart({ option }: { option: EChartsCoreOption }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const chart = init(containerRef.current)
    chartRef.current = chart
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true })
  }, [option])

  return <div ref={containerRef} style={{ width: '100%', height: 350 }} />
}
