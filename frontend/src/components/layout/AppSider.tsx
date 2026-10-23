import { Layout, Menu, Flex, Typography } from 'antd'
import { BankOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { menuItems } from '../../routes/menuConfig'
import { useAuth } from '../../store/authStore'

type AppSiderProps = {
  collapsed: boolean
  onCollapse: (collapsed: boolean) => void
}

export default function AppSider({ collapsed, onCollapse }: AppSiderProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user } = useAuth()
  const isAdmin = ['admin', 'superadmin'].includes(user?.role?.trim().toLowerCase() ?? '')
  const visibleMenuItems = menuItems.filter(
    (item) => item?.key !== '/admin/users' || isAdmin,
  )

  return (
    <Layout.Sider
      collapsible
      collapsed={collapsed}
      onCollapse={onCollapse}
      width={240}
      breakpoint="lg"
      style={{ minHeight: '100vh', position: 'sticky', top: 0, height: '100vh' }}
    >
      <Flex align="center" justify="center" gap={10} style={{ height: 64 }}>
        <BankOutlined style={{ fontSize: 24, color: '#fff' }} />
        {!collapsed && (
          <Typography.Title level={4} style={{ margin: 0, color: '#fff' }}>
            CampusOpt
          </Typography.Title>
        )}
      </Flex>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[pathname]}
        items={visibleMenuItems}
        onClick={({ key }) => navigate(key)}
      />
    </Layout.Sider>
  )
}
