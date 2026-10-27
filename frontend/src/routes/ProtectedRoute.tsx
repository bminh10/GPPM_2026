// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { Spin } from 'antd'
import { LoadingOutlined } from '@ant-design/icons'
import { restoreSession } from '../services/AuthService'
import { useAuth } from '../store/authStore'
import { ROUTE_PATHS } from './menuConfig'
import { getAppRole, getLandingPath, type AppRole } from './roleAccess'

function useSessionGate() {
  const { status } = useAuth()
  const [isInitializing, setIsInitializing] = useState(true)

  useEffect(() => {
    let isMounted = true

    const init = async () => {
      const startTime = Date.now()
      
      try {
        await restoreSession()
      } catch (error) {
        console.error("Failed to restore session:", error)
      }

      const elapsed = Date.now() - startTime
      const minLoadingTime = 1000
      const remainingTime = Math.max(0, minLoadingTime - elapsed)

      setTimeout(() => {
        if (isMounted) {
          setIsInitializing(false)
        }
      }, remainingTime)
    }

    void init()

    return () => {
      isMounted = false
    }
  }, [])

  if (isInitializing || status === 'loading') {
    return 'loading'
  }

  return status
}

const FullPageSpin = () => (
  <div className="bg-blue-900 flex flex-col min-h-screen items-center justify-center">
    <img src="https://ou.edu.vn/wp-content/uploads/2016/08/Logo.png"></img>
    <Spin className="" indicator={<LoadingOutlined style={{color: "white" ,fontSize: 48 }} spin />} size="large" />
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
  // Lưu ý: Nếu muốn RoleRoute cũng áp dụng chờ session, bạn có thể gọi useSessionGate() ở đây.
  const role = getAppRole(user?.role)
  if (status !== 'authenticated' || !user) return <Navigate to={ROUTE_PATHS.signIn} replace />
  if (!roles.includes(role)) return <Navigate to={getLandingPath(user.role)} replace />
  return <>{children}</>
}