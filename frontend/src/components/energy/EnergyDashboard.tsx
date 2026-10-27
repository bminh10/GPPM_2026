// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Button, Card, Col, Empty, Flex, Input, Row, Select, Spin, Statistic, Table, Tooltip, Typography } from 'antd'
import {
  ApartmentOutlined,
  InfoCircleOutlined,
  LeftOutlined,
  PieChartOutlined,
  RightOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import type { EChartsCoreOption } from 'echarts/core'
import { loadCampusDataset, type CampusDataset } from '../../data/campusData'
import { useEnergy } from '../../hooks/useEnergy'
import { ENERGY_EXPLANATION, formatEnergy, type RoomEnergy } from '../../services/EnergyService'
import { getErrorMessage } from '../../services/apiClient'
import { colors } from '../../theme/colors'
import EChart from '../charts/EChart'

function localDate(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-')
}

type EnergyDashboardSections = {
  summary: ReactNode
  comparison: ReactNode
  roomTable: ReactNode
}

export default function EnergyDashboard({
  children,
}: {
  children?: (sections: EnergyDashboardSections) => ReactNode
}) {
  const [selectedDate, setSelectedDate] = useState(() => localDate(new Date()))
  const [campus, setCampus] = useState<string | undefined>()
  const [dataset, setDataset] = useState<CampusDataset | null>(null)
  const [datasetError, setDatasetError] = useState<string | null>(null)
  const { data, error } = useEnergy(1, campus, undefined, selectedDate)
  const selectedDay = data?.daily.find((day) => day.date === selectedDate)

  useEffect(() => {
    let active = true
    loadCampusDataset().then((value) => { if (active) setDataset(value) })
      .catch((cause: unknown) => { if (active) setDatasetError(getErrorMessage(cause)) })
    return () => { active = false }
  }, [])

  const option = useMemo<EChartsCoreOption>(() => ({
    legend: {
      bottom: 0,
      formatter: (name: any) =>
        `${name}: ${formatEnergy(
          name === 'Tổng điện năng'
            ? selectedDay?.energy_kwh ?? null
            : selectedDay?.average_kwh ?? null,
        )}`,
    },
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const item = params as { name: string; data: { displayValue: string } }
        return `${item.name}<br/>${item.data.displayValue}`
      },
    },
    series: [
      {
        name: 'Điện năng',
        type: 'pie',
        radius: ['35%', '58%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 3 },
        label: {
          show: true,
          formatter: (params: any) => {
            const item = params as { name: string; data: { displayValue: string } }
            return `${item.name}\n${item.data.displayValue}`
          },
        },
        data: [
          {
            name: 'Tổng điện năng',
            value: selectedDay?.energy_kwh ?? 0,
            displayValue: formatEnergy(selectedDay?.energy_kwh ?? null),
            itemStyle: { color: colors.primary.DEFAULT },
          },
          {
            name: 'Trung bình mỗi phòng',
            value: selectedDay?.average_kwh ?? 0,
            displayValue: formatEnergy(selectedDay?.average_kwh ?? null),
            itemStyle: { color: colors.success.DEFAULT },
          },
        ],
      },
    ],
  }), [selectedDay])

  const campusName = (id: string) => dataset?.campuses.find((item) => item.id === id)?.name ?? id
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
      .format(new Date(`${value}T00:00:00`))
  const shiftDate = (amount: number) => {
    const date = new Date(`${selectedDate}T12:00:00`)
    date.setDate(date.getDate() + amount)
    setSelectedDate(localDate(date))
  }
  const today = localDate(new Date())

  const summary = (
    <Card
      className="dashboard-panel"
      title={
        <div className="dashboard-panel-title">
          <span className="dashboard-panel-icon"><ThunderboltOutlined /></span>
          <div>
            <Flex gap={8} align="center">
              <Typography.Text strong>Điện năng</Typography.Text>
              <Tooltip title={ENERGY_EXPLANATION}>
                <InfoCircleOutlined aria-label="Cách tính điện năng" />
              </Tooltip>
            </Flex>
            <Typography.Text type="secondary">
              Thống kê điện năng của các phòng có đèn theo dõi
            </Typography.Text>
          </div>
        </div>
      }
    >
      <Flex vertical gap={16}>
        <Flex gap={12} wrap align="center">
          <Select
            aria-label="Cơ sở theo dõi điện năng"
            placeholder="Tất cả cơ sở theo dõi"
            allowClear
            value={campus}
            onChange={setCampus}
            style={{ width: 260 }}
            options={dataset?.campuses.map((item) => ({ label: item.name, value: item.id })) ?? []}
          />
          <Flex align="center" gap={4}>
            <Button
              aria-label="Ngày trước"
              icon={<LeftOutlined />}
              onClick={() => shiftDate(-1)}
            />
            <Input
              aria-label="Chọn ngày xem điện năng"
              type="date"
              value={selectedDate}
              max={today}
              onChange={(event) => {
                if (event.target.value && event.target.value <= today) {
                  setSelectedDate(event.target.value)
                }
              }}
              style={{ width: 170 }}
            />
            <Button
              aria-label="Ngày tiếp theo"
              icon={<RightOutlined />}
              disabled={selectedDate >= today}
              onClick={() => shiftDate(1)}
            />
          </Flex>
        </Flex>
        {/* <Typography.Text type="secondary">
          Chỉ tổng hợp đèn đã cấu hình theo dõi · Bộ lọc riêng với phân tích lịch học · Giờ Việt Nam
        </Typography.Text> */}
        {datasetError && (
          <Alert
            type="error"
            title="Không tải được danh sách cơ sở điện năng"
            description={datasetError}
          />
        )}
        {error && <Alert type="error" showIcon title="Không tải được điện năng" description={error} />}
        {!data && !error && <Spin />}
        {data && (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <Statistic title="Tổng điện năng" value={formatEnergy(data.energy_kwh)} />
              </Col>
              <Col xs={24} md={8}>
                <Statistic
                  title="Trung bình mỗi phòng"
                  value={formatEnergy(data.average_kwh)}
                />
              </Col>
              <Col xs={24} md={8}>
                <Statistic
                  title="Phòng có dữ liệu / đã cấu hình"
                  value={`${data.rooms_with_data} / ${data.configured_rooms}`}
                />
              </Col>
            </Row>
            <Typography.Text type="secondary">
              {formatDate(selectedDate)} · Cập nhật{' '}
              {new Date(data.as_of * 1000).toLocaleTimeString('vi-VN')}
            </Typography.Text>
            {/* {data.unknown_seconds > 0 && (
              <Alert
                type="warning"
                showIcon
                title="Có khoảng thời gian thiếu dữ liệu"
                description="Tổng chỉ gồm phần ghi nhận được. Trung bình dùng số phòng có dữ liệu trong khoảng tương ứng; không coi phòng chưa có dữ liệu là 0."
              />
            )} */}
          </>
        )}
      </Flex>
    </Card>
  )

  const comparison = (
    <Card
      className="dashboard-panel"
      title={
        <div className="dashboard-panel-title">
          <span className="dashboard-panel-icon"><PieChartOutlined /></span>
          <div>
            <Typography.Text strong>Tỷ lệ điện năng tiêu thụ</Typography.Text>
            <Typography.Text type="secondary">
              Tổng và trung bình điện năng theo ngày
            </Typography.Text>
          </div>
        </div>
      }
    >
        <Flex vertical gap={12}>
          <Typography.Text type="secondary">
            Điện năng ghi nhận trong ngày {formatDate(selectedDate)}
          </Typography.Text>
          {!data && !error && <Spin />}
          {data &&
            (selectedDay &&
            (selectedDay.energy_kwh !== null || selectedDay.average_kwh !== null) ? (
              <EChart
                option={option}
                label="Biểu đồ tròn so sánh điện năng tổng và trung bình mỗi phòng"
              />
            ) : (
              <Empty description="Chưa có dữ liệu điện năng. Chạy thiết bị; điện năng sẽ tự tích lũy khi đèn bật." />
            ))}
        </Flex>
    </Card>
  )

  const roomTable = (
    <Card
      className="dashboard-panel"
      title={
        <div className="dashboard-panel-title">
          <span className="dashboard-panel-icon"><ApartmentOutlined /></span>
          <div>
            <Typography.Text strong>Điện năng theo phòng</Typography.Text>
            {/* <Typography.Text type="secondary">
              Chi tiết điện năng và trạng thái dữ liệu từng phòng
            </Typography.Text> */}
          </div>
        </div>
      }
    >
        {!data && !error && <Spin />}
        <Table<RoomEnergy>
          size="small"
          dataSource={data?.rooms ?? []}
          rowKey={(room) => JSON.stringify([room.campus_id, room.room_id])}
          locale={{ emptyText: 'Chưa có phòng được cấu hình theo dõi điện năng' }}
          pagination={{ pageSize: 5, hideOnSinglePage: true }}
          columns={[
            { title: 'Cơ sở', dataIndex: 'campus_id', render: campusName },
            { title: 'Phòng', dataIndex: 'room_id' },
            {
              title: 'Điện năng',
              render: (_, room) =>
                formatEnergy(room.known_seconds > 0 ? room.energy_kwh : null),
            },
          ]}
        />
    </Card>
  )

  if (children) return children({ summary, comparison, roomTable })

  return (
    <Flex vertical gap={16}>
      {summary}
      {comparison}
      {roomTable}
    </Flex>
  )
}
