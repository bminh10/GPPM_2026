import { CalendarOutlined, DashboardOutlined, DatabaseOutlined, EnvironmentOutlined, SettingOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'

export const ROUTE_PATHS = {
  dashboard: '/dashboard',
  map: '/map',
  timetable: '/timetable',
  dataManagement: '/admin/data',
  settings: '/settings',
  signIn: '/sign-in',
  signUp: '/sign-up',
} as const

export type AppMenuItem = Required<MenuProps>['items'][number]

export const menuItems: AppMenuItem[] = [
  {
    key: ROUTE_PATHS.dashboard,
    icon: <DashboardOutlined />,
    label: 'Dashboard',
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
    key: ROUTE_PATHS.settings,
    icon: <SettingOutlined />,
    label: 'Cài đặt',
  },
]
