import { Layout, Menu, Flex, Typography } from 'antd'
import { BankOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { menuItems, ROUTE_PATHS } from '../../routes/menuConfig'
import Logo from '../logo/Logo'

type AppSiderProps = {
  collapsed: boolean
  onCollapse: (collapsed: boolean) => void
}

export default function AppSider({ collapsed, onCollapse }: AppSiderProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  let size = 0;
  if(collapsed){
    size = 36;
  }

  return (
    <Layout.Sider
      collapsible
      collapsed={collapsed}
      onCollapse={onCollapse}
      width={240}
      breakpoint="lg"
      style={{ minHeight: '100vh', position: 'sticky', top: 0, height: '100vh' }}
    >
      <Flex  align="center" justify="center" gap={10} style={{ height: 64, display: 'flex' }}>
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
        defaultOpenKeys={pathname.startsWith(`${ROUTE_PATHS.administration}/`) ? [ROUTE_PATHS.administration] : []}
        items={menuItems}
        onClick={({ key }) => navigate(key)}
      />
    </Layout.Sider>
  )
}
