import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { Spin } from 'antd'
import { restoreSession } from '../services/AuthService'
import { useAuth } from '../store/authStore'
import { ROUTE_PATHS } from './menuConfig'
import { getAppRole, getLandingPath, type AppRole } from './roleAccess'

function useSessionGate() {
  const { status } = useAuth()
  useEffect(() => {
    void restoreSession()
  }, [])
  return status
}

const FullPageSpin = () => (
  <div className="flex min-h-screen items-center justify-center">
    <Spin size="large" />
  </div>
)

export default function ProtectedRoute() {
  const status = useSessionGate()
  if (status === 'loading') return <FullPageSpin />
  return status === 'authenticated' ? <Outlet /> : <Navigate to={ROUTE_PATHS.signIn} replace />
}

export function AdminRoute() {
  const status = useSessionGate()
  if (status === 'loading') return <FullPageSpin />
  if (status !== 'authenticated') return <Navigate to={ROUTE_PATHS.signIn} replace />
  return <Outlet />
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const status = useSessionGate()
  const { user } = useAuth()
  if (status === 'loading') return <FullPageSpin />
  return status === 'authenticated'
    ? <Navigate to={getLandingPath(user?.role)} replace />
    : <>{children}</>
}

export function RootRedirect() {
  const status = useSessionGate()
  const { user } = useAuth()
  if (status === 'loading') return <FullPageSpin />
  return (
    <Navigate
      to={status === 'authenticated' ? getLandingPath(user?.role) : ROUTE_PATHS.signIn}
      replace
    />
  )
}

export function RoleRoute({
  roles,
  children,
}: {
  roles: AppRole[]
  children: ReactNode
}) {
  const { status, user } = useAuth()
  const role = getAppRole(user?.role)
  if (status !== 'authenticated' || !user) return <Navigate to={ROUTE_PATHS.signIn} replace />
  if (!roles.includes(role)) return <Navigate to={getLandingPath(user.role)} replace />
  return <>{children}</>
}
