import { useState } from 'react'
import { Layout } from 'antd'
import { Outlet } from 'react-router-dom'
import AppSider from './AppSider'
import AppHeader from './AppHeader'
import AppFooter from './AppFooter'

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AppSider collapsed={collapsed} onCollapse={setCollapsed} />
      <Layout>
        <AppHeader collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        <Layout.Content style={{ margin: 16 }}>
          <Outlet />
        </Layout.Content>
        <AppFooter />
      </Layout>
    </Layout>
  )
}
