import { Button, Flex, Layout, Space } from 'antd'
import { BookOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { ROUTE_PATHS } from '../../routes/menuConfig'
import { logOut } from '../../services/AuthService'
import UserMenu from './UserMenu'
import PageHelpTour from './PageHelpTour'

type AppHeaderProps = {
  collapsed: boolean
  onToggle: () => void
}

export default function AppHeader({ collapsed, onToggle }: AppHeaderProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const handleLogout = async () => {
    await logOut().catch(() => undefined)
    navigate(ROUTE_PATHS.signIn, { replace: true })
  }

  return (
    <Layout.Header
      id="app-header-tour"
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
          <PageHelpTour key={pathname} pathname={pathname} />
          <Button
            type="text"
            icon={<BookOutlined />}
            id="app-documentation-tour"
            onClick={() => navigate(ROUTE_PATHS.documentation)}
          >
            Tài liệu
          </Button>
          <UserMenu />
          <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout}>
            Đăng xuất
          </Button>
        </Space>
      </Flex>
    </Layout.Header>
  )
}
