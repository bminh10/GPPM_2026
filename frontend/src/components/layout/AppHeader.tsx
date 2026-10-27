// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { Button, Flex, Layout, Space } from 'antd'
import { BookOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { ROUTE_PATHS } from '../../routes/menuConfig'
import UserMenu from './UserMenu'
import PageHelpTour from './PageHelpTour'
import BugReportButton from './BugReportButton'
import LightingWasteAlertButton from '../lighting/LightingWasteAlertButton'
import { getAppRole } from '../../routes/roleAccess'
import { useAuth } from '../../store/authStore'

type AppHeaderProps = {
  collapsed: boolean
  onToggle: () => void
}

export default function AppHeader({ collapsed, onToggle }: AppHeaderProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user } = useAuth()
  const isStaff = getAppRole(user?.role) === 'staff'

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
        <Space>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={onToggle}
          />
          <BugReportButton />
        </Space>
        <Space>
          <PageHelpTour key={pathname} pathname={pathname} />
          {!isStaff && <LightingWasteAlertButton />}
          <Button
            type="text"
            icon={<BookOutlined />}
            id="app-documentation-tour"
            onClick={() => navigate(ROUTE_PATHS.documentation)}
          >
            Tài liệu
          </Button>
          <UserMenu />
        </Space>
      </Flex>
    </Layout.Header>
  )
}
