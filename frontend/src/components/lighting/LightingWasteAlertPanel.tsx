// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { Alert, Button, Card, Empty, Flex, Spin, Tag, Typography } from 'antd'
import { BulbFilled, AlertFilled } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { ROUTE_PATHS } from '../../routes/menuConfig'
import { localDate, useLightingWasteAlerts } from '../../hooks/useLightingWasteAlerts'

function checkedAt(value: Date) {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(value)
}

export default function LightingWasteAlertPanel() {
  const { alerts, error, isLoading, now } = useLightingWasteAlerts()
  const navigate = useNavigate()

  const openRoomOnMap = (campusId: string, roomName: string) => {
    const params = new URLSearchParams({
      campus: campusId,
      room: roomName,
      date: localDate(now),
    })
    navigate(`${ROUTE_PATHS.map}?${params.toString()}`)
  }

  return (
    <Card
      className="dashboard-panel dashboard-panel-warning"
      title={
        <Flex align="center" gap={10}>
          <span className="dashboard-panel-icon dashboard-panel-icon-warning">
            <AlertFilled />
          </span>
          <Flex vertical>
            <Typography.Text strong>Cảnh báo lãng phí điện</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Đèn đang bật ngoài giờ ca học hôm nay · Cập nhật {checkedAt(now)}
            </Typography.Text>
          </Flex>
        </Flex>
      }
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          message="Không thể tải dữ liệu cảnh báo"
          description={error}
        />
      ) : isLoading ? (
        <Flex justify="center" style={{ padding: 20 }}><Spin /></Flex>
      ) : alerts.length === 0 ? (
        <Empty description="Hiện không có phòng nào bật đèn ngoài giờ ca học" />
      ) : (
        <Flex vertical gap={8}>
          <Alert
            type="warning"
            showIcon
            message={`${alerts.length} phòng đang bật đèn ngoài giờ học`}
            description="Các phòng dưới đây hiện không trong giờ của ca học hôm nay và có đèn được thiết bị xác nhận đang bật."
          />
          {alerts.map((alert) => (
            <Button
              type="text"
              block
              aria-label={`Mở phòng ${alert.roomName} trên bản đồ`}
              key={`${alert.campusId}-${alert.roomName}`}
              onClick={() => openRoomOnMap(alert.campusId, alert.roomName)}
              style={{
                height: 'auto',
                padding: '8px 12px',
                border: '1px solid #ffe1b3',
                borderRadius: 8,
                textAlign: 'left',
              }}
            >
              <Flex align="center" justify="space-between" wrap="wrap" gap={8}>
                <Flex align="center" gap={8}>
                  <BulbFilled style={{ color: '#d48806' }} />
                  <Typography.Text strong>{alert.roomName}</Typography.Text>
                  <Typography.Text type="secondary">{alert.campusName}</Typography.Text>
                </Flex>
                <Tag color="warning">{alert.lightCount} đèn đang bật</Tag>
              </Flex>
            </Button>
          ))}
        </Flex>
      )}
    </Card>
  )
}
