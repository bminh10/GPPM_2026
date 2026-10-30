import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Input, Modal, Space, Table, Tag, Typography, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CheckOutlined, CloseOutlined, ReloadOutlined } from '@ant-design/icons'
import { apiClient, getErrorMessage } from '../../services/apiClient'
import { useAuth } from '../../store/authStore'
import { getAppRole } from '../../routes/roleAccess'

type ChangeApproval = {
  id: string
  status: 'pending' | 'processing' | 'approved' | 'rejected' | 'failed'
  method: string
  path: string
  payload: Record<string, unknown>
  requester_id: number
  requester_name: string | null
  requester_email: string | null
  reviewer_id: number | null
  review_note: string | null
  error: string | null
  created_at: string
  reviewed_at: string | null
}

const statusLabels: Record<ChangeApproval['status'], string> = {
  pending: 'Chờ duyệt',
  processing: 'Đang xử lý',
  approved: 'Đã duyệt',
  rejected: 'Đã từ chối',
  failed: 'Không áp dụng được',
}

const statusColors: Record<ChangeApproval['status'], string> = {
  pending: 'gold',
  processing: 'blue',
  approved: 'green',
  rejected: 'red',
  failed: 'volcano',
}

export default function ChangeApprovalsPage() {
  const { user } = useAuth()
  const isAdmin = ['admin', 'super_admin'].includes(getAppRole(user?.role))
  const [approvals, setApprovals] = useState<ChangeApproval[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<ChangeApproval | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [messageApi, contextHolder] = message.useMessage()

  const fetchApprovals = useCallback(async () => {
    const { data } = await apiClient.get<ChangeApproval[]>('/approvals/changes')
    return data
  }, [])

  const loadApprovals = useCallback(async () => {
    try {
      setApprovals(await fetchApprovals())
      setLoadError(null)
    } catch (error: unknown) {
      setLoadError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [fetchApprovals])

  useEffect(() => {
    let active = true
    fetchApprovals()
      .then((data) => {
        if (active) {
          setApprovals(data)
          setLoadError(null)
        }
      })
      .catch((error: unknown) => {
        if (active) setLoadError(getErrorMessage(error))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [fetchApprovals])

  const review = useCallback(async (approval: ChangeApproval, decision: 'approve' | 'reject') => {
    setReviewing(approval.id)
    try {
      await apiClient.post(`/approvals/changes/${approval.id}/${decision}`,
        decision === 'reject' ? { note: rejectNote || null } : undefined,
      )
      messageApi.success(
        decision === 'approve'
          ? 'Đã duyệt và áp dụng yêu cầu chỉnh sửa.'
          : 'Đã từ chối yêu cầu chỉnh sửa.',
      )
      setRejecting(null)
      setRejectNote('')
      setLoading(true)
      await loadApprovals()
    } catch (error: unknown) {
      messageApi.error(getErrorMessage(error))
      setLoading(true)
      await loadApprovals()
    } finally {
      setReviewing(null)
    }
  }, [loadApprovals, messageApi, rejectNote])

  const columns = useMemo<ColumnsType<ChangeApproval>>(
    () => [
      {
        title: 'Người gửi',
        key: 'requester',
        render: (_, item) => (
          <Space direction="vertical" size={0}>
            <span>{item.requester_name ?? `Người dùng #${item.requester_id}`}</span>
            <Typography.Text type="secondary">{item.requester_email}</Typography.Text>
          </Space>
        ),
      },
      { title: 'Thao tác', dataIndex: 'method', width: 100 },
      { title: 'Dữ liệu', dataIndex: 'path' },
      {
        title: 'Nội dung đề nghị',
        dataIndex: 'payload',
        render: (payload: Record<string, unknown>) => (
          <Typography.Text>
            {Object.entries(payload)
              .map(([key, value]) => `${key}: ${String(value)}`)
              .join(' · ')}
          </Typography.Text>
        ),
      },
      {
        title: 'Gửi lúc',
        dataIndex: 'created_at',
        width: 170,
        render: (value: string) => new Date(value).toLocaleString('vi-VN'),
      },
      {
        title: 'Trạng thái',
        dataIndex: 'status',
        width: 150,
        render: (value: ChangeApproval['status'], item) => (
          <Space direction="vertical" size={2}>
            <Tag color={statusColors[value]}>{statusLabels[value]}</Tag>
            {item.error && <Typography.Text type="danger">{item.error}</Typography.Text>}
            {item.review_note && <Typography.Text type="secondary">{item.review_note}</Typography.Text>}
          </Space>
        ),
      },
      ...(isAdmin
        ? [
            {
              title: 'Duyệt',
              key: 'actions',
              width: 170,
              render: (_: unknown, item: ChangeApproval) =>
                item.status === 'pending' ? (
                  <Space>
                    <Button
                      type="primary"
                      size="small"
                      icon={<CheckOutlined />}
                      loading={reviewing === item.id}
                      onClick={() => void review(item, 'approve')}
                    >
                      Duyệt
                    </Button>
                    <Button
                      danger
                      size="small"
                      icon={<CloseOutlined />}
                      disabled={reviewing === item.id}
                      onClick={() => setRejecting(item)}
                    >
                      Từ chối
                    </Button>
                  </Space>
                ) : null,
            },
          ]
        : []),
    ],
    [isAdmin, reviewing, review],
  )

  return (
    <>
      {contextHolder}
      <Card
        title={isAdmin ? 'Hàng chờ duyệt chỉnh sửa' : 'Yêu cầu chỉnh sửa của tôi'}
        extra={
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setLoading(true)
              void loadApprovals()
            }}
            loading={loading}
          >
            Tải lại
          </Button>
        }
      >
        {loadError && <Alert type="error" showIcon message={loadError} style={{ marginBottom: 16 }} />}
        <Table
          rowKey="id"
          columns={columns}
          dataSource={approvals}
          loading={loading}
          pagination={{ pageSize: 10 }}
          expandable={{
            expandedRowRender: (item) => (
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(item.payload, null, 2)}
              </pre>
            ),
          }}
        />
      </Card>
      <Modal
        title="Từ chối yêu cầu chỉnh sửa"
        open={rejecting !== null}
        okText="Xác nhận từ chối"
        cancelText="Hủy"
        okButtonProps={{ danger: true, loading: rejecting !== null && reviewing === rejecting.id }}
        onCancel={() => {
          setRejecting(null)
          setRejectNote('')
        }}
        onOk={() => rejecting && void review(rejecting, 'reject')}
      >
        <Typography.Paragraph>
          Yêu cầu {rejecting?.path} sẽ không được áp dụng.
        </Typography.Paragraph>
        <Typography.Text type="secondary">
          Lý do từ chối (không bắt buộc)
        </Typography.Text>
        <Input.TextArea
          value={rejectNote}
          onChange={(event) => setRejectNote(event.target.value)}
          maxLength={1000}
          rows={3}
          style={{ marginTop: 8 }}
        />
      </Modal>
    </>
  )
}
