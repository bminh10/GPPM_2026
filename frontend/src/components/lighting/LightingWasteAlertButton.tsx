// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Empty, Flex, Popover, Switch, Tag, Typography } from 'antd'
import { AlertFilled, BulbFilled, SettingOutlined } from '@ant-design/icons'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ROUTE_PATHS } from '../../routes/menuConfig'
import { localDate, useLightingWasteAlerts, type LightingWasteAlert } from '../../hooks/useLightingWasteAlerts'
import { commandLight, lightAddress } from '../../services/LightingService'
import { getErrorMessage } from '../../services/apiClient'
import { getAppRole } from '../../routes/roleAccess'
import { useAuth } from '../../store/authStore'

const AUTO_OFF_COUNTDOWN_SECONDS = 15
const AUTO_OFF_STORAGE_KEY = 'lighting-auto-shutdown-enabled'
const countdownKey = (alert: LightingWasteAlert) => JSON.stringify([alert.campusId, alert.roomName])
type AutomationView = {
  deadlines: Record<string, number>
  sendingRooms: ReadonlySet<string>
  completedLights: ReadonlySet<string>
}

export default function LightingWasteAlertButton() {
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [autoEnabled, setAutoEnabled] = useState(
    () => window.localStorage.getItem(AUTO_OFF_STORAGE_KEY) === 'true',
  )
  const [countdownNow, setCountdownNow] = useState(() => Date.now())
  const [automationView, setAutomationView] = useState<AutomationView>({
    deadlines: {}, sendingRooms: new Set(), completedLights: new Set(),
  })
  const [automationErrors, setAutomationErrors] = useState<Readonly<Record<string, string>>>({})
  const deadlinesRef = useRef<Record<string, number>>({})
  const completedLights = useRef(new Set<string>())
  const sendingRoomsRef = useRef(new Set<string>())
  const { alerts, error, isLoading } = useLightingWasteAlerts()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const canControlLights = ['admin', 'super_admin', 'technician'].includes(getAppRole(user?.role))

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCountdownNow(Date.now())
      setAutomationView({
        deadlines: { ...deadlinesRef.current },
        sendingRooms: new Set(sendingRoomsRef.current),
        completedLights: new Set(completedLights.current),
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === AUTO_OFF_STORAGE_KEY) setAutoEnabled(event.newValue === 'true')
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    if (!autoEnabled || !canControlLights) {
      completedLights.current.clear()
      deadlinesRef.current = {}
      return
    }
    if (error || isLoading) {
      deadlinesRef.current = {}
      return
    }

    const activeLightKeys = new Set(alerts.flatMap((alert) =>
      alert.lights.map((light) => lightAddress(light.campus_id, light.room_id, light.light_id)),
    ))
    for (const key of completedLights.current) {
      if (!activeLightKeys.has(key)) completedLights.current.delete(key)
    }
    const now = Date.now()
    const nextDeadlines: Record<string, number> = {}
    for (const alert of alerts) {
      const key = countdownKey(alert)
      if (deadlinesRef.current[key] !== undefined) {
        nextDeadlines[key] = deadlinesRef.current[key]
      } else if (alert.lights.some((light) =>
        !completedLights.current.has(lightAddress(light.campus_id, light.room_id, light.light_id)),
      )) {
        nextDeadlines[key] = now + AUTO_OFF_COUNTDOWN_SECONDS * 1000
      }
    }
    deadlinesRef.current = nextDeadlines
  }, [alerts, autoEnabled, canControlLights, error, isLoading])

  useEffect(() => {
    if (!autoEnabled || !canControlLights || error || isLoading) return
    const dueAlerts = alerts.filter((alert) => {
      const deadline = deadlinesRef.current[countdownKey(alert)]
      return deadline !== undefined && deadline <= countdownNow &&
        !sendingRoomsRef.current.has(countdownKey(alert))
    })
    if (dueAlerts.length === 0) return

    for (const alert of dueAlerts) {
      const roomKey = countdownKey(alert)
      sendingRoomsRef.current.add(roomKey)
      const candidates = alert.lights.filter((light) =>
        light.reported_on === true && !light.pending && light.online &&
        !completedLights.current.has(lightAddress(light.campus_id, light.room_id, light.light_id)),
      )
      const inactiveCount = alert.lights.length - candidates.length

      void Promise.allSettled(candidates.map(async (light) => {
        await commandLight(light, false)
        completedLights.current.add(lightAddress(light.campus_id, light.room_id, light.light_id))
      })).then((results) => {
        const failures = results.filter((result) => result.status === 'rejected')
        const remaining = alert.lights.some((light) =>
          !completedLights.current.has(lightAddress(light.campus_id, light.room_id, light.light_id)),
        )
        if (failures.length > 0) {
          const failure = failures[0]
          const description = failure.status === 'rejected'
            ? `Không tắt được đèn: ${getErrorMessage(failure.reason)}`
            : 'Không tắt được đèn.'
          setAutomationErrors((previous) => ({ ...previous, [roomKey]: description }))
        } else if (inactiveCount > 0 && remaining) {
          setAutomationErrors((previous) => ({
            ...previous,
            [roomKey]: 'Một số đèn đang ngoại tuyến hoặc chờ xác nhận; sẽ thử lại sau.',
          }))
        } else {
          setAutomationErrors((previous) => {
            const next = { ...previous }
            delete next[roomKey]
            return next
          })
        }
        if (remaining) {
          const next = {
            ...deadlinesRef.current,
            [roomKey]: Date.now() + AUTO_OFF_COUNTDOWN_SECONDS * 1000,
          }
          deadlinesRef.current = next
        } else {
          const next = { ...deadlinesRef.current }
          delete next[roomKey]
          deadlinesRef.current = next
        }
        sendingRoomsRef.current.delete(roomKey)
        void queryClient.invalidateQueries({ queryKey: ['lighting-waste-alerts'] })
      })
    }
  }, [alerts, autoEnabled, canControlLights, countdownNow, error, isLoading, queryClient])

  const openRoomOnMap = (campusId: string, roomName: string) => {
    const params = new URLSearchParams({
      campus: campusId,
      room: roomName,
      date: localDate(new Date()),
    })
    setOpen(false)
    navigate(`${ROUTE_PATHS.map}?${params.toString()}`)
  }

  const toggleAutomation = (enabled: boolean) => {
    window.localStorage.setItem(AUTO_OFF_STORAGE_KEY, String(enabled))
    setAutoEnabled(enabled)
    setAutomationErrors({})
    setSettingsOpen(false)
    if (enabled && alerts.length > 0) setOpen(true)
  }
  const deadlineFor = (alert: LightingWasteAlert) => {
    if (!autoEnabled || !canControlLights || error || isLoading) return undefined
    const key = countdownKey(alert)
    return automationView.deadlines[key] ??
      (alert.lights.some((light) =>
        !automationView.completedLights.has(lightAddress(light.campus_id, light.room_id, light.light_id)),
      )
        ? countdownNow + AUTO_OFF_COUNTDOWN_SECONDS * 1000
        : undefined)
  }
  const nextDeadline = alerts
    .map(deadlineFor)
    .filter((deadline): deadline is number => deadline !== undefined)
    .sort((left, right) => left - right)[0]
  const nextCountdown = nextDeadline === undefined
    ? null
    : Math.max(0, Math.ceil((nextDeadline - countdownNow) / 1000))

  const content = (
    <Flex vertical style={{ maxWidth: '80vw' }}>
      
      <Flex align="center" justify="space-between">
        <Typography.Text strong>Cảnh báo</Typography.Text>
        {/* {alerts.length > 0 && <Tag color="warning">{alerts.length} phòng</Tag>} */}
        <Popover
          content={
            <Flex vertical gap={10} style={{ minWidth: 240 }}>
              <Typography.Text strong>Cài đặt đèn tự động</Typography.Text>
              <Flex align="center" justify="space-between" gap={16}>
                <Typography.Text>Tự tắt đèn ngoài giờ học</Typography.Text>
                <Switch
                  checked={autoEnabled}
                  disabled={!canControlLights}
                  aria-label="Bật hoặc tắt chế độ tự động tắt đèn"
                  onChange={toggleAutomation}
                />
              </Flex>
              <Typography.Text type="secondary">
                Khi phòng không có ca học đang diễn ra và đèn đang bật, hệ thống cảnh báo rồi đếm ngược {AUTO_OFF_COUNTDOWN_SECONDS} giây trước khi gửi lệnh tắt.
              </Typography.Text>
              <Typography.Text type="secondary">
                Tự động chỉ hoạt động khi ứng dụng đang mở và kết nối được API.
              </Typography.Text>
              {!canControlLights && (
                <Typography.Text type="secondary">Bạn cần quyền quản trị hoặc kỹ thuật để thay đổi cài đặt.</Typography.Text>
              )}
            </Flex>
          }
          trigger="click"
          placement="bottomRight"
          arrow={false}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        >
          <Button
            type="text"
            aria-label="Cài đặt tự động bật tắt đèn"
            icon={<SettingOutlined />}
          >
          </Button>
        </Popover>
      </Flex>

      {autoEnabled && (
        <Typography.Text type="secondary">
          Tự động tắt đang bật · đếm ngược {AUTO_OFF_COUNTDOWN_SECONDS} giây
        </Typography.Text>
      )}
      {error ? (
        <Typography.Text type="danger">Không thể tải cảnh báo: {error}</Typography.Text>
      ) : isLoading ? (
        <Typography.Text type="secondary">Đang tải cảnh báo...</Typography.Text>
      ) : alerts.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có cảnh báo lãng phí" />
      ) : (
        <Flex vertical gap={8} style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          {alerts.map((alert) => (
            <Button
              key={`${alert.campusId}-${alert.roomName}`}
              type="text"
              block
              aria-label={`Mở phòng ${alert.roomName} trên bản đồ`}
              onClick={() => openRoomOnMap(alert.campusId, alert.roomName)}
              style={{ height: 'auto', textAlign: 'left' }}
            >
              <Flex align="center" gap={8}>
                <BulbFilled style={{ color: '#d48806' }} />
                <Flex vertical style={{ minWidth: 0, flex: 1 }}>
                  <Typography.Text strong ellipsis>{alert.roomName}</Typography.Text>
                  <Typography.Text type="secondary" ellipsis>{alert.campusName}</Typography.Text>
                </Flex>
                <Flex vertical align="end">
                  <Tag color="warning">{alert.lightCount} đèn</Tag>
                  {deadlineFor(alert) !== undefined && (
                    <Typography.Text type="danger" style={{ fontSize: 12 }}>
                      {automationView.sendingRooms.has(countdownKey(alert))
                        ? 'Đang gửi lệnh tắt'
                        : `Tắt sau ${Math.max(0, Math.ceil(((deadlineFor(alert) ?? countdownNow) - countdownNow) / 1000))} giây`}
                    </Typography.Text>
                  )}
                  {automationErrors[countdownKey(alert)] && (
                    <Typography.Text type="danger" style={{ fontSize: 12 }}>
                      {automationErrors[countdownKey(alert)]}
                    </Typography.Text>
                  )}
                </Flex>
              </Flex>
            </Button>
          ))}
        </Flex>
      )}
    </Flex>
  )

  return (
    <Flex align="center" gap={4}>
      <Popover
        content={content}
        trigger="click"
        placement="bottomRight"
        arrow={false}
        open={open}
        onOpenChange={setOpen}
      >
        <Badge count={alerts.length} size="small" overflowCount={99}>
          <Button
            type="text"
            aria-label={alerts.length
              ? `Cảnh báo, ${alerts.length} phòng bật đèn ngoài giờ học${nextCountdown === null ? '' : `, tự tắt sau ${nextCountdown} giây`}`
              : 'Cảnh báo'}
            icon={<AlertFilled style={{ color: alerts.length ? '#d48806' : undefined }} />}
          >
            Cảnh báo
            {nextCountdown !== null && <Tag color="error" style={{ marginInlineStart: 8 }}>{nextCountdown}s</Tag>}
          </Button>
        </Badge>
      </Popover>
    </Flex>
  )
}
