import { Button, Card, Descriptions, Flex, Progress, Switch, Tag, Typography } from 'antd'
import { BulbFilled, CloseOutlined } from '@ant-design/icons'
import { ROOM_STATE_META, getRoomState, type Room } from '../../data/campusData'
import { colors } from '../../theme/colors'
import type { LightStatus } from '../../services/LightingService'
import RoomEnergyPanel from './RoomEnergyPanel'

export type ActiveRoomClass = {
  room_id: number
  room_name: string
  campus_id: number
  room_building: string | null
  room_capacity: number
  class_name: string
  subject_name: string
  registered_students: number
  teacher_name: string | null
  start_time: string
  end_time: string
}

type Props = {
  room: Room
  buildingName: string
  currentClasses: ActiveRoomClass[]
  scheduleLoading: boolean
  scheduleError: string | null
  onClose: () => void
  isLightOn: (lightId: string) => boolean
  onToggleLight: (lightId: string) => void
  getLightStatus: (lightId: string) => LightStatus | undefined
  isSending: (lightId: string) => boolean
  canControl: boolean
}

export default function RoomDetailCard({
  room, buildingName, currentClasses, scheduleLoading, scheduleError, onClose, isLightOn, onToggleLight, getLightStatus, isSending, canControl,
}: Props) {
  const state = getRoomState(room)
  const activeClass = currentClasses[0]
  const meta = activeClass
    ? { label: 'Có lịch trong ngày', color: '#1677ff' }
    : ROOM_STATE_META[state]
  const roomCapacity = activeClass?.room_capacity ?? room.capacity
  const occupancy = activeClass?.registered_students ?? room.occupancy
  const rate = roomCapacity > 0
    ? Math.min(100, Math.round((occupancy / roomCapacity) * 100))
    : 0

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
      {scheduleError ? (
        <Typography.Text type="danger">Không tải được lịch của phòng: {scheduleError}</Typography.Text>
      ) : scheduleLoading && currentClasses.length === 0 ? (
        <Typography.Text type="secondary">Đang tải lịch học trong ngày đã chọn…</Typography.Text>
      ) : currentClasses.length > 0 ? (
        <Card size="small" style={{ marginBottom: 12, borderColor: '#1677ff' }}>
          <Flex vertical gap={4}>
            <Tag color="#1677ff" style={{ width: 'fit-content', marginInlineEnd: 0 }}>Có lịch trong ngày</Tag>
            {currentClasses.map((currentClass) => (
              <Flex key={`${currentClass.room_id}-${currentClass.start_time}-${currentClass.class_name}`} vertical>
                <Typography.Text strong>{currentClass.class_name} · {currentClass.subject_name}</Typography.Text>
                <Typography.Text type="secondary">
                  {currentClass.start_time.slice(0, 5)}–{currentClass.end_time.slice(0, 5)}
                  {currentClass.teacher_name ? ` · ${currentClass.teacher_name}` : ''}
                </Typography.Text>
                <Typography.Text type="secondary">
                  Sinh viên đăng ký: {currentClass.registered_students} · Sức chứa phòng: {currentClass.room_capacity}
                </Typography.Text>
              </Flex>
            ))}
          </Flex>
        </Card>
      ) : (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          {scheduleLoading ? 'Đang tải lịch học trong ngày đã chọn…' : 'Phòng không có lớp học trong ngày đã chọn.'}
        </Typography.Paragraph>
      )}
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
      <RoomEnergyPanel key={`${room.campusId}:${room.id}`} room={room} />
      <Descriptions
        size="small"
        column={1}
        items={[
          { key: 'building', label: 'Tòa', children: activeClass?.room_building || buildingName },
          { key: 'floor', label: 'Tầng', children: `Tầng ${room.floor}` },
          { key: 'capacity', label: 'Số sinh viên / sức chứa', children: `${occupancy}/${roomCapacity} chỗ` },
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
