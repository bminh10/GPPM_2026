import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Card, Checkbox, Descriptions, Flex, Input, Tag, Typography } from 'antd'
import { apiClient, getErrorMessage } from '../../services/apiClient'

type Job = {
  id: string; uid: string; mssv: string; state: string; detail: string; created_at: number
}
type Station = {
  writer_id: string; uid: string | null; card_type: string; seen_at: number; online: boolean; fresh_card: boolean; job: Job | null
}
const states: Record<string, string> = {
  pending: 'Chờ chạm lại đúng thẻ (ủy quyền 120 giây)',
  writing: 'Đã cấp lệnh ghi · Chưa có xác nhận đọc lại',
  succeeded: 'Đã ghi và đọc lại đúng MSSV',
  failed: 'Ghi thất bại · Kiểm tra thẻ trước khi thử lại',
  expired: 'Hết hạn · Không cấp lệnh ghi',
  cancelled: 'Đã hủy trước khi cấp lệnh ghi',
  unknown: 'Đã đóng · Kết quả vật lý không xác định, phải kiểm tra thẻ',
}

export default function CardWriterPage() {
  return <App><WriterStationPage /></App>
}

function WriterStationPage() {
  const { modal, message } = App.useApp()
  const client = useQueryClient()
  const [mssv, setMssv] = useState('')
  const [consentUid, setConsentUid] = useState<string | null>(null)
  const initialSeenAtRef = useRef<number | null>(null)
  const initialJobIdRef = useRef<string | null>(null)

  const query = useQuery({
    queryKey: ['card-writer'],
    queryFn: async () => (await apiClient.get<Station>('/card-writer')).data,
    refetchInterval: 1500,
    retry: false,
  })
  const data = query.data

  if (data && initialSeenAtRef.current === null) {
    initialSeenAtRef.current = data.seen_at ?? 0
    initialJobIdRef.current = data.job?.id ?? null
  }

  const isNewCard = Boolean(
    data?.uid &&
    initialSeenAtRef.current !== null &&
    (data.seen_at ?? 0) > initialSeenAtRef.current
  )
  const activeUid: string | null = isNewCard ? (data?.uid ?? null) : null
  const activeCardType = isNewCard ? (data?.card_type || 'Chưa nhận diện') : 'Chưa nhận diện'
  const activeSeenAt = isNewCard ? (data?.seen_at ?? null) : null

  const job = data?.job
  const busy = job?.state === 'pending' || job?.state === 'writing'
  const showJob = Boolean(job && (busy || job.id !== initialJobIdRef.current))
  const freshCard = isNewCard && data?.fresh_card === true

  const mutation = useMutation({
    mutationFn: async (action: { path: string; payload: object }) => {
      await apiClient.post(action.path, action.payload)
    },
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['card-writer'] }) },
    onError: (error) => { void message.error(getErrorMessage(error)) },
  })
  const authorize = () => {
    if (!activeUid) return
    const uid = activeUid
    modal.confirm({
      title: `Ghi MSSV ${mssv} vào thẻ ${uid}?`,
      content: 'Chỉ dùng thẻ trắng/thẻ mẫu thuộc quyền của bạn. Thao tác thay nội dung khối 4, không phải xác minh sinh viên. Sau khi xác nhận, nhấc và chạm lại đúng thẻ.',
      okText: 'Ủy quyền ghi một lần', cancelText: 'Quay lại',
      onOk: () => mutation.mutateAsync({
        path: '/card-writer/jobs', payload: { uid, mssv, confirm_owned_card: true },
      }),
    })
  }
  const closeJob = () => {
    if (!job) return
    modal.confirm({
      title: job.state === 'writing' ? 'Đóng kết quả chưa xác định?' : 'Hủy lệnh chưa ghi?',
      content: job.state === 'writing'
        ? 'Chỉ thao tác sau 120 giây: dừng/restart board writer và kiểm tra thẻ bằng đầu đọc. Thẻ có thể đã bị ghi dù chưa có xác nhận. Đóng lệnh không khôi phục dữ liệu thẻ.'
        : 'Nếu thiết bị đã nhận lệnh ghi thì không thể hủy bằng thao tác này.',
      onOk: () => mutation.mutateAsync({
        path: `/card-writer/jobs/${job.id}/close`,
        payload: { acknowledge_uncertain: job.state === 'writing' },
      }),
    })
  }
  return (
    <Flex vertical gap={16}>
      <div>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>Cấp thẻ · Ghi MSSV</Typography.Title>
        <Typography.Text type="secondary">
          Ghi mã số sinh viên lên thẻ trắng hoặc thẻ mẫu được phép sử dụng.
        </Typography.Text>
      </div>
      <Alert type="warning" showIcon title="Chỉ nhân sự được phân quyền · Chỉ thẻ trắng/thẻ mẫu được phép ghi"
        description="Chưa đối chiếu danh sách sinh viên, chưa xác minh hoặc điểm danh. RC522 sẽ kiểm tra loại thẻ và khối 4 trước khi ghi. Không dùng thẻ trường có dữ liệu sẵn." />
      {query.error && <Alert type="error" showIcon title="Không kết nối được API trạm ghi" description={getErrorMessage(query.error)} />}
      <Card
        id="writer-card-status"
        title={<Typography.Text strong style={{ color: '#164d6b' }}>1. Chạm thẻ lên trạm ghi để xem UID</Typography.Text>}
        styles={{ header: { background: 'linear-gradient(105deg, #eaf4fb, #f7fbfe)', borderBottomColor: '#dbe9f3' } }}
      >
        <Tag color={!query.error && data?.online ? 'green' : 'default'}>
          {!query.error && data?.online ? 'Writer đang liên lạc' : 'Chưa có kết nối writer được xác nhận'}
        </Tag>
        <Descriptions column={1} items={[
          { key: 'station', label: 'Trạm', children: data?.writer_id ?? 'Đang tải' },
          { key: 'uid', label: 'UID thẻ cuối', children: activeUid ?? 'Chưa có thẻ tương thích' },
          { key: 'type', label: 'Loại', children: activeCardType },
          { key: 'time', label: 'Nhận diện lúc', children: activeSeenAt ? new Date(activeSeenAt * 1000).toLocaleString('vi-VN') : 'Chưa có' },
        ]} />
      </Card>
      <Card
        id="writer-authorization-form"
        title={<Typography.Text strong style={{ color: '#164d6b' }}>2. Nhập MSSV, xác nhận rồi chạm lại đúng thẻ</Typography.Text>}
        styles={{ header: { background: 'linear-gradient(105deg, #eaf4fb, #f7fbfe)', borderBottomColor: '#dbe9f3' } }}
      >
        <Flex vertical gap={12}>
          <Typography.Text>MSSV gồm 10 chữ số, bắt đầu bằng 245101. Không tự tăng số hay gán sinh viên.</Typography.Text>
          <Input id="writer-mssv-input" aria-label="MSSV cần ghi" placeholder="245101xxxx" maxLength={10}
            value={mssv} onChange={(event) => setMssv(event.target.value)}
            disabled={busy || mutation.isPending} style={{ maxWidth: 320 }} />
          {mssv && !/^245101[0-9]{4}$/.test(mssv) && <Typography.Text type="danger">
            MSSV chưa hợp lệ: nhập đủ 10 chữ số, bắt đầu bằng 245101, ví dụ 2451010001.
          </Typography.Text>}
          <Checkbox id="writer-card-confirmation" checked={!!activeUid && consentUid === activeUid}
            disabled={!activeUid || busy || mutation.isPending}
            onChange={(event) => setConsentUid(event.target.checked ? activeUid : null)}>
            Tôi xác nhận thẻ UID đang hiển thị là thẻ của tôi và cho phép thay nội dung khối 4.
          </Checkbox>
          {!activeUid && <Alert type="info" showIcon title="Chưa thể xác nhận: hệ thống chưa nhận được UID thẻ"
            description="Cấu hình Wi-Fi và địa chỉ backend cho writer, nạp lại firmware rồi chạm thẻ lên RC522. Khi UID xuất hiện ở bước 1, ô xác nhận mới được mở." />}
          {activeUid && !freshCard && <Typography.Text type="secondary">Nhấc thẻ rồi chạm lại để lấy UID mới (có hiệu lực 60 giây).</Typography.Text>}
          <Button id="writer-authorize" type="primary" onClick={authorize} loading={mutation.isPending}
            disabled={!!query.error || !data?.online || !freshCard || busy || !activeUid || consentUid !== activeUid || !/^245101[0-9]{4}$/.test(mssv)}>
            Xác nhận MSSV và ủy quyền ghi
          </Button>
        </Flex>
      </Card>
      {showJob && job && <Card
        id="writer-job-result"
        title={<Typography.Text strong style={{ color: '#164d6b' }}>Kết quả lệnh ghi gần nhất</Typography.Text>}
        styles={{ header: { background: 'linear-gradient(105deg, #eaf4fb, #f7fbfe)', borderBottomColor: '#dbe9f3' } }}
      >
        <Flex vertical gap={8}>
          <Typography.Text strong>{states[job.state] ?? job.state}</Typography.Text>
          <Typography.Text>MSSV: {job.mssv} · UID: {job.uid}</Typography.Text>
          <Typography.Text>{job.detail}</Typography.Text>
          {busy && <Button danger onClick={closeJob} loading={mutation.isPending}>
            {job.state === 'pending' ? 'Hủy lệnh chờ' : 'Xử lý kết quả chưa xác định'}
          </Button>}
        </Flex>
      </Card>}
    </Flex>
  )
}
