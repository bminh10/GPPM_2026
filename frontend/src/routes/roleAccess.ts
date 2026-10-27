// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
export type AppRole = 'super_admin' | 'admin' | 'technician' | 'staff' | 'unknown'

export function getAppRole(roleName: string | null | undefined): AppRole {
  const normalized = (roleName ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^\d+\s+/, '')
  if (normalized === '1') return 'super_admin'
  if (normalized === '2') return 'admin'
  if (normalized === '3') return 'technician'
  if (normalized === '4') return 'staff'
  if (normalized === 'super admin' || normalized === 'superadmin') return 'super_admin'
  if (normalized === 'admin') return 'admin'
  if (normalized === 'ky thuat vien' || normalized === 'technician') return 'technician'
  if (normalized === 'can bo nhan vien' || normalized === 'staff' || normalized === 'user') return 'staff'
  return 'unknown'
}

export function getLandingPath(roleName: string | null | undefined): string {
  const role = getAppRole(roleName)
  if (role === 'admin' || role === 'super_admin') return '/dashboard'
  if (role === 'technician') return '/map'
  return '/home'
}
