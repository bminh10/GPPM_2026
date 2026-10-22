import { Button, Card, Descriptions, Flex, Progress, Tag, Typography } from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import { ROOM_STATE_META, getRoomState, type Room } from '../../data/campusData'

type Props = {
  room: Room
  buildingName: string
  onClose: () => void
}

export default function RoomDetailCard({ room, buildingName, onClose }: Props) {
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
