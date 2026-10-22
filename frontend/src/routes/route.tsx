import { Navigate, createBrowserRouter } from 'react-router-dom'
import MainLayout from '../components/layout/MainLayout'
import Dashboard from '../pages/Dashboard/Dashboard'
import Map from '../pages/Map/Map'
import Setting from '../pages/Settings/Setting'
import AuthPage from '../pages/Auth/AuthPage'
import ProtectedRoute, { PublicOnlyRoute } from './ProtectedRoute'
import { isAuthenticated } from '../utils/auth'
import { ROUTE_PATHS } from './menuConfig'

export const route = createBrowserRouter([
  { path: '/', element: <Navigate to={isAuthenticated() ? ROUTE_PATHS.dashboard : ROUTE_PATHS.signIn} replace /> },
  { path: ROUTE_PATHS.signIn, element: <PublicOnlyRoute><AuthPage mode="sign-in" /></PublicOnlyRoute> },
  { path: ROUTE_PATHS.signUp, element: <PublicOnlyRoute><AuthPage mode="sign-up" /></PublicOnlyRoute> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <MainLayout />,
        children: [
          { path: ROUTE_PATHS.dashboard, element: <Dashboard /> },
          { path: ROUTE_PATHS.map, element: <Map /> },
          { path: ROUTE_PATHS.settings, element: <Setting /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to={ROUTE_PATHS.signIn} replace /> },
])
