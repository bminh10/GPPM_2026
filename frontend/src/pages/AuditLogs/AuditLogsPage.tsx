import { useCallback, useEffect, useState } from 'react'
import { Alert, Card, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { apiClient, getErrorMessage } from '../../services/apiClient'

type AuditLogRecord = {
  id: number
  method: string
  path: string
  status_code: number
  details: Record<string, unknown> | null
  created_at: string
}

const LOG_LIMIT = 500

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    const { data } = await apiClient.get<AuditLogRecord[]>('/audit-logs', {
      params: { limit: LOG_LIMIT },
    })
    return data
  }, [])

  useEffect(() => {
    let active = true
    void fetchLogs()
      .then((data) => {
        if (active) setLogs(data)
      })
      .catch((loadError: unknown) => {
        if (active) setError(getErrorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [fetchLogs])

  const columns: ColumnsType<AuditLogRecord> = [
    {
      title: 'Thời gian',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm:ss'),
    },
    {
      title: 'Phương thức',
      dataIndex: 'method',
      key: 'method',
      width: 120,
      render: (method: string) => <Tag>{method}</Tag>,
    },
    {
      title: 'Đường dẫn',
      dataIndex: 'path',
      key: 'path',
      width: 280,
      render: (path: string) => <Typography.Text code>{path}</Typography.Text>,
    },
    {
      title: 'Mã trạng thái',
      dataIndex: 'status_code',
      key: 'status_code',
      width: 130,
      render: (status: number) => (
        <Tag color={status >= 200 && status < 400 ? 'success' : 'error'}>{status}</Tag>
      ),
    },
    {
      title: 'Chi tiết',
      dataIndex: 'details',
      key: 'details',
      render: (details: AuditLogRecord['details']) => (
        details ? (
          <Typography.Text style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {JSON.stringify(details)}
          </Typography.Text>
        ) : '—'
      ),
    },
  ]

  return (
    <Space direction="vertical" size="large" style={{ display: 'flex' }}>
      <div>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>Nhật ký hệ thống</Typography.Title>
        <Typography.Text type="secondary">
          Theo dõi tối đa {LOG_LIMIT} hoạt động gần nhất.
        </Typography.Text>
      </div>
      <Card title="Lịch sử hoạt động">
        {error && (
          <Alert
            type="error"
            showIcon
            message="Không tải được nhật ký"
            description={error}
            style={{ marginBottom: 16 }}
          />
        )}
        <Table<AuditLogRecord>
          rowKey="id"
          columns={columns}
          dataSource={logs}
          loading={loading}
          scroll={{ x: 900 }}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            showTotal: (total) => `${total} hoạt động`,
          }}
        />
      </Card>
    </Space>
  )
}
