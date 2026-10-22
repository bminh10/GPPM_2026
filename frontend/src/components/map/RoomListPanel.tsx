import { useMemo, useState } from 'react'
import { Card, Empty, Flex, Input, Progress, Tag, Typography } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { ROOM_STATE_META, getRoomState, type Building, type Room } from '../../data/campusData'

type Props = {
  rooms: Room[]
  buildings: Building[]
  selectedRoomId: string | null
  onSelectRoom: (roomId: string) => void
}

export default function RoomListPanel({ rooms: allRooms, buildings, selectedRoomId, onSelectRoom }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return allRooms.filter((r) => !q || `${r.code} ${r.name}`.toLowerCase().includes(q))
  }, [query, allRooms])

  return (
    <Card
      className="glass"
      size="small"
      title="Danh sách phòng"
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      styles={{ body: { flex: 1, minHeight: 0, overflowY: 'auto' } }}
    >
      <Flex vertical gap={8}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Tìm phòng theo mã hoặc tên..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {filtered.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có phòng" />}
        {filtered.map((room) => {
          const state = getRoomState(room)
          const meta = ROOM_STATE_META[state]
          const rate = Math.round((room.occupancy / room.capacity) * 100)
          return (
            <Card
              key={room.id}
              size="small"
              hoverable
              onClick={() => onSelectRoom(room.id)}
              style={{
                borderColor: room.id === selectedRoomId ? 'var(--color-primary)' : undefined,
                borderLeft: `5px solid ${meta.color}`,
              }}
            >
              <Flex justify="space-between" align="center">
                <Typography.Text strong>{room.code}</Typography.Text>
                <Flex gap={4}>
                  <Tag color="blue" variant="filled">
                    {buildings.find((b) => b.id === room.buildingId)?.name} · T{room.floor}
                  </Tag>
                </Flex>
              </Flex>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {room.name}
              </Typography.Text>
              <Progress percent={rate} size="small" strokeColor={meta.color} format={(p) => `${p}%`} />
            </Card>
          )
        })}
      </Flex>
    </Card>
  )
}
