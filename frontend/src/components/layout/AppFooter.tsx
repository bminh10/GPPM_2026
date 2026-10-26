import { Layout, Typography } from 'antd'

export default function AppFooter() {
  return (
    <Layout.Footer style={{ textAlign: 'center', background: 'transparent' }}>
      <Typography.Text type="secondary">
        SmartOU © {new Date().getFullYear()} — Smart Campus, Đại học Mở TP.HCM · v1.0.0
      </Typography.Text>
    </Layout.Footer>
  )
}
