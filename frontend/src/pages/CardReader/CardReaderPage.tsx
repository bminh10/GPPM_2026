import { useEffect, useState } from 'react'
import { Alert, Card, Descriptions, Flex, Tag, Typography } from 'antd'
import { ScanOutlined } from '@ant-design/icons'
import { apiClient, getErrorMessage } from '../../services/apiClient'
import AttendancePanel from './AttendancePanel'

type Scan = {
  uid: string
  card_type: string
  read_status: 'ok' | 'uid_only' | 'read_error'
  block: number
  data_hex: string | null
  data_text: string
  mssv: string | null
  detail: string
  received_at: number
  student_verified: false
  attendance: {
    status: 'recorded' | 'duplicate' | 'outside' | 'invalid'
    message: string
    campus_name: string | null
  } | null
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
      <div>
        <Typography.Title level={3} style={{ marginBottom: 4 }}>Đọc thẻ</Typography.Title>
        <Typography.Text type="secondary">
          Đọc mã số sinh viên và theo dõi điểm danh bằng thẻ.
        </Typography.Text>
      </div>
      <AttendancePanel />
      {error && <Alert showIcon type="error" title="Không tải được dữ liệu đầu đọc" description={error} />}
      <Card
        id="reader-latest-scan"
        title={
          <Flex align="center" gap={12}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 11, background: '#d6eaf6', color: '#12658d', fontSize: 17 }}>
              <ScanOutlined />
            </span>
            <Typography.Text strong style={{ color: '#164d6b', fontSize: 14 }}>
              {data ? `Trạm ${data.reader_id}` : 'Đang kết nối API'}
            </Typography.Text>
          </Flex>
        }
        styles={{ header: { background: 'linear-gradient(105deg, #eaf4fb, #f7fbfe)', borderBottomColor: '#dbe9f3' } }}
      >
        {!scan ? (
          <Typography.Paragraph>Chưa nhận được lần quét nào. Vui lòng mở đầu đọc và chạm thẻ.</Typography.Paragraph>
        ) : (
          <Flex vertical gap={12}>
            {scan.attendance && <Alert showIcon
              type={error ? 'warning' : scan.attendance.status === 'recorded' ? 'success' : 'warning'}
              title={`${error ? 'Kết quả lần quét cũ · ' : ''}${scan.attendance.message}`}
              description={scan.attendance.campus_name
                ? `Cơ sở: ${scan.attendance.campus_name}. Kết quả của lần quét gần nhất, không phải trạng thái phiên hiện tại.`
                : 'Chưa có phiên điểm danh. Đây là kết quả của lần quét gần nhất.'} />}
            <Card
              id="reader-scan-mssv"
              size="small"
              title={<Typography.Text strong style={{ color: '#164d6b' }}>Mã số sinh viên trên thẻ</Typography.Text>}
              styles={{ header: { background: 'linear-gradient(105deg, #eaf4fb, #f7fbfe)', borderBottomColor: '#dbe9f3' } }}
            >
              {scan.mssv ? (
                <Typography.Title level={2} style={{ margin: 0, color: '#12658d' }}>
                  <Typography.Text copyable style={{ color: '#12658d' }}>{scan.mssv}</Typography.Text>
                </Typography.Title>
              ) : (
                <Typography.Text type="warning">
                  {scan.read_status === 'ok'
                    ? 'Không tìm thấy MSSV đúng định dạng trong khối 4.'
                    : 'Chưa đọc được MSSV: không đọc được dữ liệu khối thẻ.'}
                </Typography.Text>
              )}
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                {error ? 'Dữ liệu lần quét cũ · Mất kết nối API. ' : ''}
                MSSV đọc từ thẻ, chưa đối chiếu danh sách sinh viên. Xem kết quả điểm danh của lần quét ở thông báo bên trên.
              </Typography.Paragraph>
            </Card>
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
