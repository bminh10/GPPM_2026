// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { useState } from 'react'
import { Badge, Button, Empty, Flex, Popover, Tag, Typography } from 'antd'
import { AlertFilled, BellOutlined, BulbFilled } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { ROUTE_PATHS } from '../../routes/menuConfig'
import { localDate, useLightingWasteAlerts } from '../../hooks/useLightingWasteAlerts'

export default function LightingWasteAlertButton() {
  const [open, setOpen] = useState(false)
  const { alerts, error, isLoading } = useLightingWasteAlerts()
  const navigate = useNavigate()

  const openRoomOnMap = (campusId: string, roomName: string) => {
    const params = new URLSearchParams({
      campus: campusId,
      room: roomName,
      date: localDate(new Date()),
    })
    setOpen(false)
    navigate(`${ROUTE_PATHS.map}?${params.toString()}`)
  }



  const content = (
    <Flex vertical gap={12} style={{maxWidth: '80vw' }}>
      <Flex align="center" justify="space-between">
        <Typography.Text strong>Cảnh báo</Typography.Text>
        {alerts.length > 0 && <Tag color="warning">{alerts.length} phòng</Tag>}
      </Flex>
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
                <Tag color="warning">{alert.lightCount} đèn</Tag>
              </Flex>
            </Button>
          ))}
        </Flex>
      )}
    </Flex>
  )

  return (
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
          aria-label={alerts.length ? `Cảnh báo, ${alerts.length} phòng bật đèn ngoài giờ học` : 'Cảnh báo'}
          icon={<AlertFilled style={{ color: alerts.length ? '#d48806' : undefined }} />}
        >
          Cảnh báo
        </Button>
      </Badge>
    </Popover>
  )
}
