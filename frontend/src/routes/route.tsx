// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { Navigate, createBrowserRouter } from 'react-router-dom'
import MainLayout from '../components/layout/MainLayout'
import Dashboard from '../pages/Dashboard/Dashboard'
import HomePage from '../pages/Home/HomePage'
import { MapRoute } from '../pages/Map/Map'
import AuthPage from '../pages/Auth/AuthPage'
import ProtectedRoute, { PublicOnlyRoute, RoleRoute, RootRedirect } from './ProtectedRoute'
import { ROUTE_PATHS } from './menuConfig'
import type { AppRole } from './roleAccess'
import AdminDataPage from '../pages/AdminData/AdminDataPage'
import AuditLogsPage from '../pages/AuditLogs/AuditLogsPage'
import TimetablePage from '../pages/Timetable/TimetablePage'
import ProfilePage from '../pages/Profile/ProfilePage'
import AdminUsersPage from '../pages/AdminUsers/AdminUsersPage'
import BuildingGeoJSONTest from '../pages/Map3DTest/BuildingGeoJSONTest'
import CardReaderPage from '../pages/CardReader/CardReaderPage'
import CardWriterPage from '../pages/CardWriter/CardWriterPage'
import DocumentationPage from '../pages/Documentation/DocumentationPage'

const adminRoles: AppRole[] = ['super_admin', 'admin']
const dashboardRoles: AppRole[] = ['super_admin', 'admin', 'technician']
const dataRoles: AppRole[] = ['super_admin', 'admin', 'staff']
const infrastructureRoles: AppRole[] = ['super_admin', 'admin', 'technician']

export const route = createBrowserRouter([
  { path: '/', element: <RootRedirect /> },
  { path: ROUTE_PATHS.signIn, element: <PublicOnlyRoute><AuthPage mode="sign-in" /></PublicOnlyRoute> },
  { path: ROUTE_PATHS.signUp, element: <PublicOnlyRoute><AuthPage mode="sign-up" /></PublicOnlyRoute> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <MainLayout />,
        children: [
          { path: ROUTE_PATHS.home, element: <HomePage /> },
          { path: ROUTE_PATHS.documentation, element: <DocumentationPage /> },
          {
            path: ROUTE_PATHS.dashboard,
            element: <RoleRoute roles={dashboardRoles}><Dashboard /></RoleRoute>,
          },
          {
            path: ROUTE_PATHS.map,
            element: <RoleRoute roles={infrastructureRoles}><MapRoute /></RoleRoute>,
          },
          {
            path: ROUTE_PATHS.cardReader,
            element: <RoleRoute roles={infrastructureRoles}><CardReaderPage /></RoleRoute>,
          },
          {
            path: ROUTE_PATHS.cardWriter,
            element: <RoleRoute roles={infrastructureRoles}><CardWriterPage /></RoleRoute>,
          },
          {
            path: '/map3d-test',
            element: <RoleRoute roles={adminRoles}><BuildingGeoJSONTest /></RoleRoute>,
          },
          {
            path: ROUTE_PATHS.timetable,
            element: <RoleRoute roles={dataRoles}><TimetablePage /></RoleRoute>,
          },
          { path: ROUTE_PATHS.profile, element: <ProfilePage /> },
          {
            path: ROUTE_PATHS.dataManagement,
            element: <RoleRoute roles={dataRoles}><AdminDataPage /></RoleRoute>,
          },
          {
            path: ROUTE_PATHS.courseRegistrations,
            element: <RoleRoute roles={dataRoles}><AdminDataPage /></RoleRoute>,
          },
          {
            path: ROUTE_PATHS.userManagement,
            element: <RoleRoute roles={adminRoles}><AdminUsersPage /></RoleRoute>,
          },
          {
            path: ROUTE_PATHS.auditLogs,
            element: <RoleRoute roles={adminRoles}><AuditLogsPage /></RoleRoute>,
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to={ROUTE_PATHS.signIn} replace /> },
])
