import { Button, Flex, Layout, Space } from 'antd'
import { LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { ROUTE_PATHS } from '../../routes/menuConfig'
import { logOut } from '../../services/AuthService'
import UserMenu from './UserMenu'
import Logo from '../logo/Logo';

type AppHeaderProps = {
  collapsed: boolean
  onToggle: () => void
}

export default function AppHeader({ collapsed, onToggle }: AppHeaderProps) {
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logOut().catch(() => undefined)
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
          <UserMenu />
          <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout}>
            Đăng xuất
          </Button>
        </Space>
      </Flex>
    </Layout.Header>
  )
}
