import { Avatar, Button, Flex, Layout, Space, Typography } from 'antd'
import { LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, UserOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { ROUTE_PATHS } from '../../routes/menuConfig'
import { clearAuthentication } from '../../utils/auth'

type AppHeaderProps = {
  collapsed: boolean
  onToggle: () => void
}

export default function AppHeader({ collapsed, onToggle }: AppHeaderProps) {
  const navigate = useNavigate()

  const handleLogout = () => {
    clearAuthentication()
    navigate(ROUTE_PATHS.signIn, { replace: true })
  }

  return (
    <Layout.Header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        backdropFilter: 'blur(14px)',
        background: 'var(--color-glass-bg)',
        borderBottom: '1px solid var(--color-glass-border)',
      }}
    >
      <Flex align="center" justify="space-between" style={{ height: '100%' }}>
        <Button
          type="text"
          icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onToggle}
        />
        <Space>
          <Typography.Text strong>Admin</Typography.Text>
          <Avatar icon={<UserOutlined />} style={{ background: 'var(--color-primary)' }} />
          <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout}>
            Đăng xuất
          </Button>
        </Space>
      </Flex>
    </Layout.Header>
  )
}
