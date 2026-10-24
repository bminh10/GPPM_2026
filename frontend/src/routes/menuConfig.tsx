import { CalendarOutlined, DashboardOutlined, DatabaseOutlined, EnvironmentOutlined, SettingOutlined, TeamOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'

export const ROUTE_PATHS = {
  dashboard: '/dashboard',
  map: '/map',
  cardReader: '/card-reader',
  timetable: '/timetable',
  dataManagement: '/admin/data',
  userManagement: '/admin/users',
  profile: '/profile',
  settings: '/settings',
  signIn: '/sign-in',
  signUp: '/sign-up',
} as const

export type AppMenuItem = Required<MenuProps>['items'][number]

export const menuItems: AppMenuItem[] = [
  { key: ROUTE_PATHS.cardReader, icon: <DatabaseOutlined />, label: 'Đọc thẻ' },
  {
    key: ROUTE_PATHS.dashboard,
    icon: <DashboardOutlined />,
    label: 'Tổng quan',
  },
  {
    key: ROUTE_PATHS.map,
    icon: <EnvironmentOutlined />,
    label: 'Bản đồ',
  },
  {
    key: ROUTE_PATHS.timetable,
    icon: <CalendarOutlined />,
    label: 'Thời khóa biểu',
  },
  {
    key: ROUTE_PATHS.dataManagement,
    icon: <DatabaseOutlined />,
    label: 'Quản lý dữ liệu',
  },
  {
    key: ROUTE_PATHS.userManagement,
    icon: <TeamOutlined />,
    label: 'Quản lý tài khoản',
  },
  {
    key: ROUTE_PATHS.settings,
    icon: <SettingOutlined />,
    label: 'Cài đặt',
  },
]
