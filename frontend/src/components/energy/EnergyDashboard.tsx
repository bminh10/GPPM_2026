import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Col, Empty, Flex, Row, Select, Spin, Statistic, Table, Tooltip, Typography } from 'antd'
import { InfoCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import type { EChartsCoreOption } from 'echarts/core'
import { loadCampusDataset, type CampusDataset } from '../../data/campusData'
import { useEnergy } from '../../hooks/useEnergy'
import { ENERGY_EXPLANATION, formatEnergy, type RoomEnergy } from '../../services/EnergyService'
import { getErrorMessage } from '../../services/apiClient'
import { colors } from '../../theme/colors'
import EChart from '../charts/EChart'

export default function EnergyDashboard() {
  const [days, setDays] = useState(7)
  const [campus, setCampus] = useState<string | undefined>()
  const [dataset, setDataset] = useState<CampusDataset | null>(null)
  const [datasetError, setDatasetError] = useState<string | null>(null)
  const { data, error, refresh } = useEnergy(days, campus)

  useEffect(() => {
    let active = true
    loadCampusDataset().then((value) => { if (active) setDataset(value) })
      .catch((cause: unknown) => { if (active) setDatasetError(getErrorMessage(cause)) })
    return () => { active = false }
  }, [])

  const option = useMemo<EChartsCoreOption>(() => ({
    legend: { data: ['Tổng điện năng', 'Trung bình/phòng'] },
    tooltip: {
      trigger: 'axis', renderMode: 'richText',
      valueFormatter: (value: unknown) => value === null || value === undefined || value === '-'
        ? 'Chưa có dữ liệu' : `${Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 6 })} kWh`,
    },
    grid: { left: 16, right: 20, top: 50, bottom: 28, containLabel: true },
    xAxis: { type: 'category', data: data?.daily.map((day) => day.date.slice(5).split('-').reverse().join('/')) ?? [] },
    yAxis: { type: 'value', name: 'kWh', min: 0 },
    series: [
      { name: 'Tổng điện năng', type: 'bar', data: data?.daily.map((day) => day.energy_kwh) ?? [], itemStyle: { color: colors.primary.DEFAULT }, barMaxWidth: 30 },
      { name: 'Trung bình/phòng', type: 'bar', data: data?.daily.map((day) => day.average_kwh) ?? [], itemStyle: { color: colors.success.DEFAULT }, barMaxWidth: 30 },
    ],
  }), [data])

  const campusName = (id: string) => dataset?.campuses.find((item) => item.id === id)?.name ?? id

  return <Card title={<Flex gap={8} align="center">
    <span>Điện năng</span>
    <Tooltip title={ENERGY_EXPLANATION}><InfoCircleOutlined aria-label="Cách tính điện năng" /></Tooltip>
  </Flex>} extra={<Button size="small" icon={<ReloadOutlined />} onClick={refresh}>Làm mới điện năng</Button>}>
    <Flex vertical gap={16}>
      <Flex gap={12} wrap align="center">
        <Select aria-label="Cơ sở theo dõi điện năng" placeholder="Tất cả cơ sở theo dõi" allowClear
          value={campus} onChange={setCampus} style={{ width: 260 }}
          options={dataset?.campuses.map((item) => ({ label: item.name, value: item.id })) ?? []} />
        <Select aria-label="Khoảng ngày điện năng" value={days} onChange={setDays} style={{ width: 160 }}
          options={[{ value: 7, label: '7 ngày gần nhất' }, { value: 30, label: '30 ngày gần nhất' }]} />
      </Flex>
      <Typography.Text type="secondary">
        Chỉ tổng hợp đèn đã cấu hình theo dõi · Bộ lọc riêng với phân tích lịch học · Giờ Việt Nam
      </Typography.Text>
      {datasetError && <Alert type="error" title="Không tải được danh sách cơ sở điện năng" description={datasetError} />}
      {error && <Alert type="error" showIcon title="Không tải được điện năng" description={error} />}
      {!data && !error && <Spin />}
      {data && <>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}><Statistic title="Tổng điện năng" value={formatEnergy(data.energy_kwh)} /></Col>
          <Col xs={24} md={8}><Statistic title="Trung bình mỗi phòng có dữ liệu" value={formatEnergy(data.average_kwh)} /></Col>
          <Col xs={24} md={8}><Statistic title="Phòng có dữ liệu / đã cấu hình" value={`${data.rooms_with_data} / ${data.configured_rooms}`} /></Col>
        </Row>
        <Typography.Text type="secondary">
          {data.start_date} – {data.end_date} · Cập nhật {new Date(data.as_of * 1000).toLocaleTimeString('vi-VN')}
        </Typography.Text>
        {data.unknown_seconds > 0 && <Alert type="warning" showIcon
          title="Có khoảng thời gian thiếu dữ liệu"
          description="Tổng chỉ gồm phần ghi nhận được. Trung bình dùng số phòng có dữ liệu trong khoảng tương ứng; không coi phòng chưa có dữ liệu là 0." />}
        <Typography.Title level={5} style={{ margin: 0 }}>Điện năng từng ngày</Typography.Title>
        {data.rooms_with_data > 0 ? <EChart option={option} label="Biểu đồ điện năng từng ngày" /> : <Empty description="Chưa có dữ liệu điện năng. Chạy thiết bị; điện năng sẽ tự tích lũy khi đèn bật." />}
        <Typography.Text type="secondary">
          Ngày chưa có dữ liệu không có cột; ngày hiện tại đang được tích lũy. Không tạo dữ liệu cho những ngày trước khi bắt đầu theo dõi.
        </Typography.Text>
        <Table<RoomEnergy> size="small" dataSource={data.rooms}
          rowKey={(room) => JSON.stringify([room.campus_id, room.room_id])}
          locale={{ emptyText: 'Chưa có phòng được cấu hình theo dõi điện năng' }}
          pagination={{ pageSize: 5, hideOnSinglePage: true }}
          columns={[
            { title: 'Cơ sở', dataIndex: 'campus_id', render: campusName },
            { title: 'Phòng', dataIndex: 'room_id' },
            { title: 'Điện năng', render: (_, room) => formatEnergy(room.known_seconds > 0 ? room.energy_kwh : null) },
            { title: 'Dữ liệu', render: (_, room) => room.unknown_seconds > 0 ? 'Có thời gian thiếu dữ liệu' : room.known_seconds > 0 ? 'Đã ghi nhận' : 'Chưa có xác nhận' },
          ]}
        />
      </>}
    </Flex>
  </Card>
}
