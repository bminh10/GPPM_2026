import { Button, Card, Descriptions, Flex, Progress, Switch, Tag, Typography } from 'antd'
import { BulbFilled, CloseOutlined } from '@ant-design/icons'
import { ROOM_STATE_META, getRoomState, type Room } from '../../data/campusData'
import { colors } from '../../theme/colors'

type Props = {
  room: Room
  buildingName: string
  onClose: () => void
  isLightOn: (lightId: string) => boolean
  onToggleLight: (lightId: string) => void
}

export default function RoomDetailCard({ room, buildingName, onClose, isLightOn, onToggleLight }: Props) {
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
              Mô phỏng web · Chưa kết nối Wokwi
            </Typography.Text>
          </Flex>
        </Flex>
        <Switch
          aria-label={`${light.name} phòng ${room.code}`}
          checked={lightOn}
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
