import { useMemo, useState } from 'react'
import { Card, Empty, Flex, Tag, Typography } from 'antd'
import {
  ROOM_STATE_META,
  normalizeRoomCode,
  type Building,
  type Room,
} from '../../data/campusData'
import SearchInput from '../common/SearchInput'

type Props = {
  rooms: Room[]
  buildings: Building[]
  scheduledRoomNames: string[]
  selectedRoomId: string | null
  onSelectRoom: (roomId: string) => void
}

export default function RoomListPanel({
  rooms: allRooms,
  buildings,
  scheduledRoomNames,
  selectedRoomId,
  onSelectRoom,
}: Props) {
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
      styles={{
        body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' },
      }}
    >
      <SearchInput
        placeholder="Tìm phòng theo mã hoặc tên..."
        value={query}
        onChange={setQuery}
      />
      <Flex vertical gap={8} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {filtered.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có phòng" />}
        {filtered.map((room) => {
          const hasSchedule = scheduledRoomNames.some(
            (name) => normalizeRoomCode(name) === normalizeRoomCode(room.code),
          )
          const color = hasSchedule ? '#1677ff' : ROOM_STATE_META.available.color
          return (
            <Card
              key={room.id}
              size="small"
              hoverable
              onClick={() => onSelectRoom(room.id)}
              style={{
                borderColor: room.id === selectedRoomId ? 'var(--color-primary)' : undefined,
                borderLeft: `5px solid ${color}`,
              }}
            >
              <Flex justify="space-between" align="center">
                <Typography.Text strong>{room.code}</Typography.Text>
                <Flex gap={4}>
                  <Tag color="blue" variant="filled">
                    {room.databaseBuilding || buildings.find((b) => b.id === room.buildingId)?.name} · T{room.floor}
                  </Tag>
                </Flex>
              </Flex>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {room.name}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Sức chứa: {room.capacity} chỗ
              </Typography.Text>
            </Card>
          )
        })}
      </Flex>
    </Card>
  )
}
