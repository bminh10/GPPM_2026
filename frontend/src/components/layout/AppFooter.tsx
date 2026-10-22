import { Layout, Typography } from 'antd'

export default function AppFooter() {
  return (
    <Layout.Footer style={{ textAlign: 'center', background: 'transparent' }}>
      <Typography.Text type="secondary">
        CampusOpt © {new Date().getFullYear()} — Smart Campus, Đại học Mở TP.HCM
      </Typography.Text>
    </Layout.Footer>
  )
}
