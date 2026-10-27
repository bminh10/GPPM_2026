// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Alert, App, Button, Card, DatePicker, Flex, Input, InputNumber, Select, Switch, Table, Typography } from 'antd'
import { IdcardOutlined } from '@ant-design/icons'
import { apiClient, getErrorMessage } from '../../services/apiClient'
import { getAppRole } from '../../routes/roleAccess'
import { useAuth } from '../../store/authStore'

type Session = {
  id: string; campus_id: number; campus_name: string; reader_id: string
  started_at: number; ends_at: number | null; closed_at: number | null; is_open: boolean
}
type Status = { reader_id: string; current: Session | null; reader_session: Session | null; sessions: Session[] }
type Log = { id: number; mssv: string; reader_id: string; received_at: number }
type Campus = { id: number; name: string }
const date = (value: number) => new Date(value * 1000).toLocaleString('vi-VN')

export default function AttendancePanel() {
  const { user } = useAuth()
  if (!['admin', 'super_admin', 'technician'].includes(getAppRole(user?.role))) return null
  return <App><AttendanceControls /></App>
}

function AttendanceControls() {
  const { modal, message } = App.useApp()
  const client = useQueryClient()
  const [campusId, setCampusId] = useState<number>()
  const [timed, setTimed] = useState(true)
  const [minutes, setMinutes] = useState<number | null>(15)
  const [selected, setSelected] = useState<string>()
  const [page, setPage] = useState(1)
  const [mssvInput, setMssvInput] = useState('')
  const [day, setDay] = useState<string>()
  const status = useQuery({
    queryKey: ['card-attendance', campusId, day],
    queryFn: async () => (await apiClient.get<Status>('/card-attendance', { params: { campus_id: campusId, date: day } })).data,
    enabled: !!campusId,
    placeholderData: (previous) => previous,
    refetchInterval: 1500,
    retry: false,
  })
  const campuses = useQuery({
    queryKey: ['attendance-campuses'],
    queryFn: async () => (await apiClient.get<Campus[]>('/campus/all')).data,
  })

  // Tự động chọn Cơ sở 1 (hoặc cơ sở đầu tiên) làm mặc định khi mới vào trang
  useEffect(() => {
    if (!campusId && campuses.data && campuses.data.length > 0) {
      const defaultCampus =
        campuses.data.find(
          (c) => c.id === 1 || c.name.toLowerCase().includes('cơ sở 1') || c.name.toLowerCase().includes('cs1'),
        ) ?? campuses.data[0]
      if (defaultCampus) {
        setCampusId(defaultCampus.id)
      }
    }
  }, [campusId, campuses.data])
  const current = status.data?.current
  const readerSession = status.data?.reader_session
  const readerBusyElsewhere = readerSession?.campus_id !== campusId && !!readerSession?.is_open
  const sessions = status.data?.sessions ?? []
  // Khi lọc theo ngày, không rơi về phiên hiện tại (có thể thuộc ngày khác)
  const sessionId = sessions.find((item) => item.id === selected)?.id ?? (day ? sessions[0]?.id : current?.id)
  const logs = useQuery({
    queryKey: ['attendance-logs', sessionId],
    queryFn: async () => (await apiClient.get<{ total: number; session_total: number; items: Log[] }>(
      `/card-attendance/sessions/${sessionId}/logs`, { params: { limit: 1000 } },
    )).data,
    enabled: !!sessionId,
    placeholderData: (previous) => previous,
    refetchInterval: 1500,
    retry: false,
  })
  // Lọc tức thì trên client trong RAM: 0ms độ trễ, không bắn API khi gõ phím
  const filteredLogs = useMemo(() => {
    const items = logs.data?.items ?? []
    const keyword = mssvInput.trim()
    if (!keyword) return items
    return items.filter((item) => item.mssv.includes(keyword))
  }, [logs.data?.items, mssvInput])
  const mutation = useMutation({
    mutationFn: async (action: { path: string; payload: object }) => {
      await apiClient.post(action.path, action.payload)
    },
    onSuccess: () => {
      setSelected(undefined)
      setPage(1)
      setMssvInput('')
      void client.invalidateQueries({ queryKey: ['card-attendance'] })
      void client.invalidateQueries({ queryKey: ['attendance-logs'] })
    },
    onError: (error) => {
      void message.error(getErrorMessage(error))
      void client.invalidateQueries({ queryKey: ['card-attendance'] })
    },
  })
  const start = () => {
    if (readerBusyElsewhere && readerSession) {
      modal.warning({
        title: 'Bộ đọc đang được sử dụng',
        content: `Bộ đọc ${status.data?.reader_id} đang được ${readerSession.campus_name} sử dụng. Vui lòng đợi phiên đó kết thúc trước khi bắt đầu.`,
      })
      return
    }
    modal.confirm({
    title: `Bắt đầu điểm danh toàn ${campuses.data?.find((item) => item.id === campusId)?.name}?`,
    content: timed ? `Tự kết thúc sau ${minutes} phút theo giờ server. Mỗi MSSV ghi nhận một lần.`
      : 'Phiên mở đến khi quản trị kết thúc. Mỗi MSSV ghi nhận một lần.',
    okText: 'Bắt đầu', cancelText: 'Hủy',
    onOk: () => mutation.mutateAsync({
      path: '/card-attendance/sessions', payload: { campus_id: campusId, duration_minutes: timed ? minutes : null },
    }),
    })
  }
  const close = () => modal.confirm({
    title: 'Kết thúc phiên điểm danh?',
    content: 'Các lượt quét sau khi đóng sẽ báo “Đã quá giờ điểm danh”, không thêm log vào phiên.',
    okText: 'Kết thúc', cancelText: 'Quay lại',
    onOk: () => mutation.mutateAsync({ path: `/card-attendance/sessions/${current?.id}/close`, payload: {} }),
  })
  return (
    <Card
      id="reader-attendance-session"
      title={
        <Flex align="center" gap={12}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 11, background: '#d6eaf6', color: '#12658d', fontSize: 17 }}>
            <IdcardOutlined />
          </span>
          <Typography.Text strong style={{ color: '#164d6b', fontSize: 14 }}>Điểm danh bằng thẻ · Toàn cơ sở</Typography.Text>
        </Flex>
      }
      styles={{ header: { background: 'linear-gradient(105deg, #eaf4fb, #f7fbfe)', borderBottomColor: '#dbe9f3' } }}
    >
      <Flex vertical gap={12}>
        <Alert type="info" showIcon title="Chỉ ghi nhận MSSV đã quét, chưa xác minh danh tính"
          description="Không có bảng sinh viên hay danh sách vắng. Mỗi MSSV chỉ ghi nhận lần đầu trong phiên; lượt sau báo “Đã điểm danh”. Ngoài phiên báo “Đã quá giờ điểm danh”." />
        {status.error && <Alert type="error" title="Không tải được phiên điểm danh" description={getErrorMessage(status.error)} showIcon />}
        {campuses.error && <Alert type="error" title="Không tải được danh sách cơ sở" description={getErrorMessage(campuses.error)} showIcon />}
        <Typography.Text strong>
          {!campusId ? 'Chọn cơ sở để xem phiên điểm danh'
            : status.isPending ? 'Đang tải phiên của cơ sở đã chọn'
            : current?.is_open
            ? `Đang mở · ${current.campus_name} · Bắt đầu ${date(current.started_at)}`
            : 'Cơ sở đã chọn chưa có phiên đang mở'}
        </Typography.Text>
        {current?.is_open && <Typography.Text>
          {current.ends_at ? `Tự kết thúc lúc ${date(current.ends_at)} (giờ server)` : 'Kết thúc thủ công bởi quản trị'}
        </Typography.Text>}
        <Typography.Text>Trạm reader: {status.data?.reader_id ?? 'Chọn cơ sở để xem'}. Chọn cơ sở để xem và bắt đầu phiên:</Typography.Text>
        <Select id="reader-campus-select" aria-label="Cơ sở điểm danh" placeholder="Chọn cơ sở" value={campusId}
          options={campuses.data?.map((item) => ({ value: item.id, label: item.name }))}
          onChange={(value) => { setCampusId(value); setSelected(undefined); setPage(1); setMssvInput('') }}
          disabled={mutation.isPending} style={{ maxWidth: 440 }} />
        {readerBusyElsewhere && readerSession && <Alert type="warning" showIcon
          title={`Bộ đọc ${status.data?.reader_id} đang được ${readerSession.campus_name} sử dụng`}
          description="Vui lòng đợi phiên đó kết thúc trước khi bắt đầu. Chuyển cơ sở chỉ thay đổi thông tin đang xem, không chuyển bộ đọc hoặc kết thúc phiên đang chạy." />}
        {campuses.data?.length === 0 && <Typography.Text type="warning">
          Chưa có cơ sở trong database. Tạo cơ sở tại Quản lý dữ liệu trước khi mở phiên.
        </Typography.Text>}
        <Flex id="reader-session-duration" gap={12} align="center" wrap>
          <Switch aria-label="Tự kết thúc" checked={timed} onChange={setTimed} disabled={current?.is_open || mutation.isPending} />
          <Typography.Text>Tự kết thúc sau</Typography.Text>
          <InputNumber aria-label="Thời lượng điểm danh (phút)" min={1} max={1440} precision={0}
            value={minutes} onChange={setMinutes} disabled={!timed || current?.is_open || mutation.isPending} />
          <Typography.Text>phút (1–1440); tắt để kết thúc thủ công</Typography.Text>
        </Flex>
        <Flex id="reader-session-actions" gap={12} wrap>
          <Button type="primary" onClick={start} loading={mutation.isPending}
            disabled={!status.data || !!status.error || !!campuses.error || current?.is_open || !campusId ||
              (timed && (minutes === null || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440))}>
            Bắt đầu điểm danh bằng thẻ
          </Button>
          <Button danger onClick={close} loading={mutation.isPending} disabled={!current?.is_open || !!status.error}>
            Kết thúc điểm danh
          </Button>
        </Flex>
        <div id="reader-session-history">
        <Flex vertical gap={12}>
        <Typography.Text strong>Lịch sử của cơ sở đã chọn ({day ? 'theo ngày' : '50 phiên gần nhất'})</Typography.Text>
        <DatePicker aria-label="Lọc phiên theo ngày" placeholder="Chọn ngày điểm danh" format="DD/MM/YYYY"
          allowClear value={day ? dayjs(day) : null} disabled={!campusId} style={{ maxWidth: 440 }}
          disabledDate={(value) => value.isAfter(dayjs(), 'day')}
          onChange={(value) => { setDay(value ? value.format('YYYY-MM-DD') : undefined); setSelected(undefined); setPage(1) }} />
        {day && status.data && sessions.length === 0 && <Alert type="info" showIcon
          title={`Không có phiên điểm danh trong ngày ${dayjs(day).format('DD/MM/YYYY')}`} />}
        <Select aria-label="Phiên xem log" placeholder="Chưa có phiên" value={sessionId}
          options={sessions.map((item) => ({
            value: item.id, label: `${item.campus_name} · ${date(item.started_at)} · ${item.is_open ? 'Đang mở' : 'Đã kết thúc'}`,
          }))}
          onChange={(value) => { setSelected(value); setPage(1); setMssvInput('') }} />
        {logs.error && <Alert type="error" title="Không tải được log điểm danh" description={getErrorMessage(logs.error)} showIcon />}
        <Input.Search aria-label="Tìm MSSV trong phiên" placeholder="Tìm MSSV trong phiên (nhập toàn bộ hoặc một phần)" allowClear
          inputMode="numeric" maxLength={10} value={mssvInput} disabled={!sessionId} style={{ maxWidth: 440 }}
          onChange={(event) => {
            setMssvInput(event.target.value.replace(/\D/g, ''))
            setPage(1)
          }}
          onSearch={(value) => {
            setMssvInput(value.replace(/\D/g, ''))
            setPage(1)
          }} />
        <Typography.Text>
          {mssvInput
            ? `Tìm thấy ${filteredLogs.length} / ${logs.data?.items?.length ?? 0} MSSV khớp "${mssvInput}" trong phiên đang xem`
            : `Số MSSV đã ghi nhận trong phiên đang xem: ${logs.data?.items?.length ?? 0}`}
        </Typography.Text>
        <Table<Log> rowKey="id" dataSource={filteredLogs} loading={logs.isPending && !logs.data}
          scroll={{ x: 600 }} columns={[
            { title: 'Mã số sinh viên', dataIndex: 'mssv' },
            { title: 'Giờ nhận tại server', dataIndex: 'received_at', render: (value: number) => date(value) },
            { title: 'Trạm đọc', dataIndex: 'reader_id' },
          ]}
          pagination={{ current: page, pageSize: 50, total: filteredLogs.length, showSizeChanger: false, onChange: setPage }}
          locale={{ emptyText: mssvInput ? `Không có MSSV nào khớp "${mssvInput}" trong phiên` : 'Chưa có MSSV được ghi nhận trong phiên' }} />
        </Flex>
        </div>
      </Flex>
    </Card>
  )
}
