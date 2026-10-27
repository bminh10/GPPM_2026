// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
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
        <Layout.Content id="app-page-tour" style={{ margin: 16 }}>
          <Outlet />
        </Layout.Content>
        <AppFooter />
      </Layout>
    </Layout>
  )
}
