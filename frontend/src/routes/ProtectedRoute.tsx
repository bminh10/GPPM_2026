import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { Spin } from 'antd'
import { restoreSession } from '../services/AuthService'
import { useAuth } from '../store/authStore'
import { ROUTE_PATHS } from './menuConfig'

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

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const status = useSessionGate()
  if (status === 'loading') return <FullPageSpin />
  return status === 'authenticated' ? <Navigate to={ROUTE_PATHS.dashboard} replace /> : <>{children}</>
}

export function RootRedirect() {
  const status = useSessionGate()
  if (status === 'loading') return <FullPageSpin />
  return <Navigate to={status === 'authenticated' ? ROUTE_PATHS.dashboard : ROUTE_PATHS.signIn} replace />
}
