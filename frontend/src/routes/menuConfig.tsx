// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import {
  AppstoreOutlined,
  AuditOutlined,
  CalendarOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  EnvironmentOutlined,
  HomeOutlined,
  IdcardOutlined,
  TeamOutlined,
  EditOutlined,
  EditFilled,
  BankFilled,
  BarsOutlined
} from '@ant-design/icons'
import { Badge } from 'antd'
import type { MenuProps } from 'antd'
import type { AppRole } from './roleAccess'

export const ROUTE_PATHS = {
  home: '/home',
  dashboard: '/dashboard',
  map: '/map',
  cardReader: '/card-reader',
  cardWriter: '/card-writer',
  timetable: '/timetable',
  dataManagement: '/admin/data',
  courseRegistrations: '/admin/registrations',
  userManagement: '/admin/users',
  auditLogs: '/admin/logs',
  changeApprovals: '/admin/change-approvals',
  profile: '/profile',
  documentation: '/guide',
  signIn: '/sign-in',
  signUp: '/sign-up',
} as const

export type AppMenuItem = Required<MenuProps>['items'][number]

export function getMenuItems(role: AppRole, pendingApprovalCount = 0): AppMenuItem[] {
  if (role === 'staff') {
    return [
      { key: ROUTE_PATHS.home, icon: <HomeOutlined />, label: 'Trang chủ' },
      {
        key: 'data-management-group',
        icon: <DatabaseOutlined />,
        label: 'Quản lý dữ liệu',
        children: [
          { key: ROUTE_PATHS.dataManagement, icon: <AppstoreOutlined />, label: 'Danh mục hệ thống' },
          { key: ROUTE_PATHS.courseRegistrations, icon: <EditOutlined />, label: 'Đăng ký môn học' },
          { key: ROUTE_PATHS.timetable, icon: <CalendarOutlined />, label: 'Thời khóa biểu' },
          {
            key: ROUTE_PATHS.changeApprovals,
            icon: <Badge count={pendingApprovalCount} size="small"><EditOutlined /></Badge>,
            label: 'Yêu cầu chỉnh sửa của tôi',
          },
        ],
      },
    ]
  }

  if (role === 'technician') {
    return [
      { key: ROUTE_PATHS.dashboard, icon: <DashboardOutlined />, label: 'Tổng quan' },
      {
        key: 'infrastructure-management-group',
        icon: <EnvironmentOutlined />,
        label: 'Quản lý hạ tầng',
        children: [
          { key: ROUTE_PATHS.map, label: 'Sơ đồ' },
          {
            key: 'electronic-card',
            icon: <IdcardOutlined />,
            label: 'Thẻ điện tử',
            children: [
              { key: ROUTE_PATHS.cardReader, label: 'Đọc thẻ' },
              { key: ROUTE_PATHS.cardWriter, label: 'Ghi thẻ' },
            ],
          },
        ],
      },
    ]
  }

  if (role === 'admin' || role === 'super_admin') {
    return [
      { key: ROUTE_PATHS.dashboard, icon: <DashboardOutlined />, label: 'Tổng quan' },
      {
        key: 'data-management-group',
        icon: <DatabaseOutlined />,
        label: 'Quản lý dữ liệu',
        children: [
          { key: ROUTE_PATHS.dataManagement, icon: <AppstoreOutlined />, label: 'Danh mục hệ thống' },
          { key: ROUTE_PATHS.courseRegistrations, icon: <EditFilled />, label: 'Đăng ký môn học' },
          { key: ROUTE_PATHS.timetable, icon: <CalendarOutlined />, label: 'Thời khóa biểu' },
          { key: ROUTE_PATHS.userManagement, icon: <TeamOutlined />, label: 'Tài khoản' },
        ],
      },
      {
        key: 'infrastructure-management-group',
        icon: <EnvironmentOutlined />,
        label: 'Quản lý hạ tầng',
        children: [
          { key: ROUTE_PATHS.map, label: 'Sơ đồ', icon: <BankFilled /> },
          {
            key: 'electronic-card',
            icon: <IdcardOutlined />,
            label: 'Thẻ điện tử',
            children: [
              { key: ROUTE_PATHS.cardReader, label: 'Đọc thẻ' },
              { key: ROUTE_PATHS.cardWriter, label: 'Ghi thẻ' },
            ],
          },
        ],
      },
      {
        key: ROUTE_PATHS.changeApprovals,
        icon: <Badge count={pendingApprovalCount} size="small"><AuditOutlined /></Badge>,
        label: 'Duyệt chỉnh sửa',
      },
      { key: ROUTE_PATHS.auditLogs, icon: <BarsOutlined />, label: 'Xem log' },
    ]
  }

  return []
}
