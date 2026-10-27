import { Button, Card, Descriptions, Flex, Progress, Switch, Tag, Typography, Collapse, Tooltip, Alert, Spin } from 'antd'
import { BulbFilled, CloseOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { ROOM_STATE_META, getRoomState, type Room } from '../../data/campusData'
import { colors } from '../../theme/colors'
import { ENERGY_EXPLANATION, formatEnergy } from '../../services/EnergyService'
import type { LightStatus } from '../../services/LightingService'
// import RoomEnergyPanel from './RoomEnergyPanel'
import { useEnergy } from '../../hooks/useEnergy'

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
  const { data, error } = useEnergy(1, room.campusId, room.id)
  const summary = data?.rooms[0]
  const completePower = summary && summary.configured_lights === room.lights.length
    && summary.online_lights === summary.configured_lights
  return (
    <Card
      style={{
        width: '100%',
        maxHeight: '85vh',
        overflowY: 'auto',
      }}
      title={
        <Flex align="center" gap={8}>
          <Typography.Text strong>{room.code}</Typography.Text>
          <Tag color={meta.color}>{meta.label}</Tag>
        </Flex>
      }
      extra={<Button type="text" size="small" icon={<CloseOutlined />} onClick={onClose} />}
    >
      <Typography.Paragraph style={{ marginBottom: 8 }}>{room.name}</Typography.Paragraph>
      <Typography.Text strong>Chi tiết phòng</Typography.Text>
      <Descriptions
        size="small"
        column={1}
        style={{ marginBottom: 12 }}
        items={[
          { key: 'building', label: 'Tòa', children: activeClass?.room_building || buildingName },
          { key: 'floor', label: 'Tầng', children: `Tầng ${room.floor}` },
          { key: 'capacity', label: 'Số sinh viên / sức chứa', children: `${occupancy}/${roomCapacity} chỗ` },
        ]}
      />
      {scheduleError ? (
        <Typography.Text type="danger">Không tải được lịch của phòng: {scheduleError}</Typography.Text>
      ) : scheduleLoading && currentClasses.length === 0 ? (
        <Typography.Text type="secondary">Đang tải lịch học trong ngày đã chọn…</Typography.Text>
      ) : currentClasses.length > 0 ? (
        <Flex
          vertical
          gap={4}
          style={{ marginBottom: 12, paddingLeft: 10, borderLeft: '3px solid #1677ff' }}
        >
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
        </Flex>
      ) : (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          {scheduleLoading ? 'Đang tải lịch học trong ngày đã chọn…' : 'Phòng không có lớp học trong ngày đã chọn.'}
        </Typography.Paragraph>
      )}
      <Descriptions
        size="small"
        column={1}
        style={{ marginBottom: 12 }}
        items={[{
          key: 'equipment',
          label: 'Thiết bị',
          children: (
            <Flex gap={4} wrap>
              {room.equipment.map((e) => (
                <Tag key={e}>{e}</Tag>
              ))}
            </Flex>
          ),
        }]}
      />
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
              background: 'transparent',
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
        {room.lights.length > 0 && <Collapse ghost size="small" items={[{
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

      <Progress percent={rate} strokeColor={meta.color} />
    </Card>
  )
}
