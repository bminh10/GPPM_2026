import { Button, Card, Descriptions, Flex, Progress, Switch, Tag, Typography } from 'antd'
import { BulbFilled, CloseOutlined } from '@ant-design/icons'
import { ROOM_STATE_META, getRoomState, type Room } from '../../data/campusData'
import { colors } from '../../theme/colors'
import type { LightStatus } from '../../services/LightingService'

type Props = {
  room: Room
  buildingName: string
  onClose: () => void
  isLightOn: (lightId: string) => boolean
  onToggleLight: (lightId: string) => void
  getLightStatus: (lightId: string) => LightStatus | undefined
  isSending: (lightId: string) => boolean
  canControl: boolean
}

export default function RoomDetailCard({
  room, buildingName, onClose, isLightOn, onToggleLight, getLightStatus, isSending, canControl,
}: Props) {
  const state = getRoomState(room)
  const meta = ROOM_STATE_META[state]
  const rate = Math.round((room.occupancy / room.capacity) * 100)

  return (
    <Card
      className="glass"
      size="small"
      title={
        <Flex align="center" gap={8}>
          <Typography.Text strong>{room.code}</Typography.Text>
          <Tag color={meta.color}>{meta.label}</Tag>
        </Flex>
      }
      extra={<Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />}
    >
      <Typography.Paragraph style={{ marginBottom: 8 }}>{room.name}</Typography.Paragraph>
      {room.lights.length === 0 && (
        <Typography.Paragraph type="secondary">Chưa cấu hình đèn cho phòng này.</Typography.Paragraph>
      )}
      {room.lights.map((light) => {
        const lightOn = isLightOn(light.id)
        const status = getLightStatus(light.id)
        const label = !status ? 'Chưa đăng ký thiết bị'
          : !status.online ? 'Mất kết nối · Trạng thái cuối đã biết'
          : status.timed_out ? 'Quá hạn xác nhận · Lệnh vẫn đang chờ'
          : status.pending || isSending(light.id) ? 'Đang chờ thiết bị xác nhận'
          : status.reported_on === null ? 'Chưa có xác nhận'
          : 'Đã xác nhận từ ESP32 · Mô phỏng'
        return (
      <Flex
        key={light.id}
        align="center"
        justify="space-between"
        style={{
          padding: 12,
          marginBottom: 12,
          borderRadius: 8,
          background: lightOn ? colors.warning.light : colors.bg.subtle,
        }}
      >
        <Flex align="center" gap={8}>
          <BulbFilled style={{ fontSize: 24, color: lightOn ? colors.warning.dark : colors.text.muted }} />
          <Flex vertical>
            <Typography.Text strong>{light.name} · {room.code}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {label}
              {!canControl && ' · Chỉ quản trị viên được điều khiển'}
            </Typography.Text>
          </Flex>
        </Flex>
        <Switch
          aria-label={`${light.name} phòng ${room.code}`}
          checked={lightOn}
          disabled={!canControl || !status?.online || status.pending || status.reported_on === null}
          loading={isSending(light.id) || (status?.online && status.pending && !status.timed_out)}
          checkedChildren="Bật"
          unCheckedChildren="Tắt"
          onChange={() => onToggleLight(light.id)}
        />
      </Flex>
        )
      })}
      <Descriptions
        size="small"
        column={1}
        items={[
          { key: 'building', label: 'Tòa', children: buildingName },
          { key: 'floor', label: 'Tầng', children: `Tầng ${room.floor}` },
          { key: 'capacity', label: 'Sức chứa', children: `${room.occupancy}/${room.capacity} chỗ` },
          {
            key: 'equipment',
            label: 'Thiết bị',
            children: (
              <Flex gap={4} wrap>
                {room.equipment.map((e) => (
                  <Tag key={e}>{e}</Tag>
                ))}
              </Flex>
            ),
          },
        ]}
      />
      <Progress percent={rate} strokeColor={meta.color} />
    </Card>
  )
}
