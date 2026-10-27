// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { useEffect, useState } from 'react'
import { Alert, Button, Card, Descriptions, Flex, Tag, Typography } from 'antd'
import { EyeInvisibleOutlined, EyeOutlined, ScanOutlined } from '@ant-design/icons'
import { apiClient, getErrorMessage } from '../../services/apiClient'
import AttendancePanel from './AttendancePanel'
import smartouLogo from '../../assets/smartou-logo.png'
import contactlessIcon from '../../assets/smartou-contactless.png'

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

const VISIBLE_DIGITS = 5

function MssvCard({ mssv }: { mssv: string | null }) {
  const [visible, setVisible] = useState(false)
  const shown = !mssv
    ? '----------'
    : visible
      ? mssv
      : mssv.slice(0, VISIBLE_DIGITS) + '*'.repeat(mssv.length - VISIBLE_DIGITS)
  return (
    <Flex vertical align="center" gap={8}>
      <div style={{
        position: 'relative', overflow: 'hidden', width: '100%', maxWidth: 420, aspectRatio: '1.6',
        borderRadius: 16, boxSizing: 'border-box', padding: '18px 24px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        background: 'linear-gradient(90deg, #000b3d 0%, #00119e 40%, #0008c4 65%, #140f7a 100%)',
        boxShadow: '0 8px 24px rgba(0, 16, 77, 0.25)', color: '#fff',
      }}>
        <svg viewBox="0 0 300 190" preserveAspectRatio="none" aria-hidden style={{ position: 'absolute', left: 0, top: 0, width: '60%', height: '100%', opacity: 0.55 }}>
          <g stroke="rgba(190, 210, 255, 0.35)" strokeWidth="0.8" fill="none">
            <path d="M10 20 L60 60 L120 40 L170 110 L95 150 L30 170 L10 120 Z" />
            <path d="M60 60 L30 110 L95 150 M120 40 L140 10 M170 110 L230 130 L250 60 L190 30 L140 10" />
            <path d="M0 80 L40 95 L80 85 M10 170 L70 150 M120 40 L170 60 L230 130" />
          </g>
          <g fill="rgba(210, 225, 255, 0.6)">
            {[[10, 20], [60, 60], [120, 40], [170, 110], [95, 150], [30, 170], [10, 120], [30, 110], [140, 10], [230, 130], [250, 60], [190, 30], [170, 60], [80, 85]].map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="2.2" />
            ))}
          </g>
        </svg>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 30, fontWeight: 500, letterSpacing: 0.5 }}>Smart</span>
          <span style={{ fontSize: 36, fontWeight: 900, letterSpacing: 1 }}>OU</span>
        </div>

        <img src={smartouLogo} alt="" aria-hidden style={{ position: 'absolute', right: '8%', top: '24%', width: '28%' }} />

        <Flex align="center" gap={10} style={{ position: 'relative' }}>
          <img src={contactlessIcon} alt="" aria-hidden style={{ height: 40, width: 'auto' }} />
          <span style={{ fontSize: 26, letterSpacing: 2.5, fontWeight: 500, color: '#fff', fontFamily: "'Segoe UI', Arial, sans-serif" }}>{shown}</span>
        </Flex>
      </div>
      <Button
        size="small"
        icon={visible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
        disabled={!mssv}
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? 'Ẩn MSSV' : 'Hiện MSSV'}
      </Button>
    </Flex>
  )
}

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
        <Flex vertical gap={12}>
          <MssvCard mssv={scan?.mssv ?? null} />
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
            {!scan.mssv && (
              <Typography.Text type="warning">
                {scan.read_status === 'ok'
                  ? 'Không tìm thấy MSSV đúng định dạng trong khối 4.'
                  : 'Chưa đọc được MSSV: không đọc được dữ liệu khối thẻ.'}
              </Typography.Text>
            )}
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
        </Flex>
        <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
          {lastChecked ? `API được kiểm tra lúc ${new Date(lastChecked).toLocaleTimeString('vi-VN')}. ` : ''}
          Dữ liệu bên trên là lần quét cuối đã lưu, không phải bằng chứng đầu đọc đang online.
        </Typography.Paragraph>
      </Card>
    </Flex>
  )
}
