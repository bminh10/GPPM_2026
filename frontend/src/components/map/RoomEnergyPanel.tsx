import { Alert, Collapse, Flex, Spin, Tooltip, Typography } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import type { Room } from '../../data/campusData'
import { useEnergy } from '../../hooks/useEnergy'
import { ENERGY_EXPLANATION, formatEnergy } from '../../services/EnergyService'

export default function RoomEnergyPanel({ room }: { room: Room }) {
  const { data, error } = useEnergy(1, room.campusId, room.id)
  const summary = data?.rooms[0]
  const completePower = summary && summary.configured_lights === room.lights.length
    && summary.online_lights === summary.configured_lights

  return (
    <Flex vertical gap={8} style={{ marginBottom: 12 }}>
      <Flex justify="space-between">
        <Typography.Text strong>Điện năng</Typography.Text>
        <Tooltip title={ENERGY_EXPLANATION}>
          <InfoCircleOutlined aria-label="Cách tính điện năng" />
        </Tooltip>
      </Flex>
      {error && <Alert type="error" showIcon title="Không tải được điện năng" description={error} />}
      {!data && !error && <Spin size="small" />}
      {data && <>
        <Flex justify="space-between" wrap gap={4}>
          <Typography.Text>Hôm nay: <strong>{formatEnergy(data.energy_kwh)}</strong></Typography.Text>
          <Typography.Text>
            Công suất: <strong>{completePower ? `${summary.current_watts.toLocaleString('vi-VN')} W` : 'Chưa đủ dữ liệu'}</strong>
          </Typography.Text>
        </Flex>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {summary?.configured_lights ?? 0}/{room.lights.length} đèn được theo dõi · Tự tích lũy khi bật
        </Typography.Text>
        {data.unknown_seconds > 0 && <Typography.Text type="warning">
          Có thời gian thiếu dữ liệu; điện năng chỉ tính phần đã ghi nhận.
        </Typography.Text>}
        {room.lights.length > 0 && <Collapse size="small" items={[{
          key: 'lights',
          label: 'Chi tiết điện năng từng đèn',
          children: <Flex vertical gap={12}>
            {room.lights.map((light) => {
              const meter = data.lights.find((item) => item.light_id === light.id)
              return <Flex key={light.id} vertical gap={4}>
                <Typography.Text strong>{light.name}{meter ? ` · ${meter.watts} W` : ''}</Typography.Text>
                <Typography.Text type="secondary">
                  {meter
                    ? `${formatEnergy(meter.known_seconds > 0 ? meter.energy_kwh : null)} · Bật ${(meter.on_seconds / 60).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} phút`
                    : 'Chờ thiết bị kết nối để tự bắt đầu theo dõi'}
                </Typography.Text>
              </Flex>
            })}
          </Flex>,
        }]} />}
      </>}
    </Flex>
  )
}
