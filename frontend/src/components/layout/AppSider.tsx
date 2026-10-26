import { Layout, Menu, Flex, Typography } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import { getMenuItems, ROUTE_PATHS } from '../../routes/menuConfig'
import { getAppRole } from '../../routes/roleAccess'
import { useAuth } from '../../store/authStore'
import Logo from '../logo/Logo'

type AppSiderProps = {
  collapsed: boolean
  onCollapse: (collapsed: boolean) => void
}



export default function AppSider({ collapsed, onCollapse }: AppSiderProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user } = useAuth()
  const role = getAppRole(user?.role)
  const size = collapsed ? 36 : 0
  return (
    <Layout.Sider
      id="app-sidebar-tour"
      collapsible
      collapsed={collapsed}
      onCollapse={onCollapse}
      width={240}
      breakpoint="lg"
      style={{ minHeight: '100vh', position: 'sticky', top: 0, height: '100vh' }}
    >
      <Flex align="center" justify="center" gap={10} style={{ height: 64, display: 'flex' }}>
        <Logo size={size} />
        {!collapsed && (
          <Typography.Title level={4} style={{ margin: 0, color: '#fff' }}>
            SmartOU
          </Typography.Title>
        )}
      </Flex>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[pathname]}
        items={getMenuItems(role)}
        defaultOpenKeys={[
          ...(pathname.startsWith('/admin/') ||
            pathname === ROUTE_PATHS.dataManagement ||
            pathname === ROUTE_PATHS.courseRegistrations ||
            pathname === ROUTE_PATHS.userManagement ||
            pathname === ROUTE_PATHS.timetable
            ? ['data-management-group']
            : []),
          ...(pathname === ROUTE_PATHS.map || pathname === ROUTE_PATHS.cardReader || pathname === ROUTE_PATHS.cardWriter
            ? ['infrastructure-management-group', 'electronic-card']
            : []),
        ]}
        onClick={({ key }) => {
          if (key.startsWith('/')) navigate(key)
        }}
      />
    </Layout.Sider>
  )
}
