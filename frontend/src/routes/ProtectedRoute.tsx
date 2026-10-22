import type { ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { isAuthenticated } from '../utils/auth'
import { ROUTE_PATHS } from './menuConfig'

export default function ProtectedRoute() {
  return isAuthenticated() ? <Outlet /> : <Navigate to={ROUTE_PATHS.signIn} replace />
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  return isAuthenticated() ? <Navigate to={ROUTE_PATHS.dashboard} replace /> : <>{children}</>
}
