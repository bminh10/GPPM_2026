import { useEffect, useState } from 'react'
import { Alert, Card, Descriptions, Flex, Tag, Typography } from 'antd'
import { apiClient, getErrorMessage } from '../../services/apiClient'

type Scan = {
  uid: string
  card_type: string
  read_status: 'ok' | 'uid_only' | 'read_error'
  block: number
  data_hex: string | null
  data_text: string
  detail: string
  received_at: number
  student_verified: false
}
type ReaderResponse = { reader_id: string; scan: Scan | null }

export default function CardReaderPage() {
  const [data, setData] = useState<ReaderResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = useState<number | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const response = await apiClient.get<ReaderResponse>('/card-reader/latest', { signal: controller.signal })
        if (controller.signal.aborted) return
        setData(response.data)
        setError(null)
        setLastChecked(Date.now())
      } catch (cause) {
        if (!controller.signal.aborted) setError(getErrorMessage(cause))
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => { void poll() }, 1000)
      }
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [])

  const scan = data?.scan
  return (
    <Flex vertical gap={16}>
      <Typography.Title level={3}>Đọc thẻ</Typography.Title>
      <Alert showIcon type="info" title="Chẩn đoán dữ liệu thẻ · Chưa xác minh sinh viên, chưa điểm danh"
        description="Chỉ hiển thị dữ liệu thực tế thiết bị gửi về. Không ghi hoặc thay đổi thẻ. Dấu chấm trong bản xem ASCII đại diện byte không in được." />
      {error && <Alert showIcon type="error" title="Không tải được dữ liệu đầu đọc" description={error} />}
      <Card title={data ? `Trạm ${data.reader_id}` : 'Đang kết nối API'}>
        {!scan ? (
          <Typography.Paragraph>Chưa nhận được lần quét nào. Vui lòng mở đầu đọc và chạm thẻ.</Typography.Paragraph>
        ) : (
          <Flex vertical gap={12}>
            <Tag color={error ? 'default' : scan.read_status === 'ok' ? 'green' : 'orange'}>
              {error ? 'Dữ liệu cũ · Mất kết nối API' : scan.read_status === 'ok'
                ? 'Đã đọc khối dữ liệu và nhận tại API'
                : scan.read_status === 'uid_only' ? 'Chỉ đọc được UID' : 'Đọc UID được · Lỗi đọc bộ nhớ'}
            </Tag>
            <Descriptions bordered column={1} items={[
              { key: 'uid', label: 'UID', children: <Typography.Text copyable>{scan.uid}</Typography.Text> },
              { key: 'type', label: 'Loại thẻ', children: scan.card_type },
              { key: 'time', label: 'Lần quét gần nhất (giờ nhận tại server)', children: new Date(scan.received_at * 1000).toLocaleString('vi-VN') },
              { key: 'block', label: 'Khối thử đọc', children: scan.block },
              { key: 'hex', label: 'Dữ liệu HEX (16 byte)', children: scan.data_hex ?? 'Không đọc được / không hỗ trợ' },
              { key: 'text', label: 'Xem dạng ASCII — không mặc định là MSSV', children: <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{scan.data_text || 'Không có dữ liệu'}</pre> },
              { key: 'detail', label: 'Chi tiết từ thiết bị', children: scan.detail },
            ]} />
          </Flex>
        )}
        <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
          {lastChecked ? `API được kiểm tra lúc ${new Date(lastChecked).toLocaleTimeString('vi-VN')}. ` : ''}
          Dữ liệu bên trên là lần quét cuối đã lưu, không phải bằng chứng đầu đọc đang online.
        </Typography.Paragraph>
      </Card>
    </Flex>
  )
}
