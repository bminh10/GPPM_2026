// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { useSyncExternalStore } from 'react'

export type AuthUser = {
  id: number
  user_name: string
  email: string
  role: string | null
  is_active: boolean
}

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export type AuthState = { status: AuthStatus; user: AuthUser | null }

let state: AuthState = { status: 'loading', user: null }
const listeners = new Set<() => void>()

function setState(next: AuthState) {
  state = next
  listeners.forEach((listener) => listener())
}

export const authStore = {
  getState: () => state,
  setUser: (user: AuthUser) => setState({ status: 'authenticated', user }),
  clear: () => setState({ status: 'anonymous', user: null }),
  subscribe: (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

export const useAuth = () => useSyncExternalStore(authStore.subscribe, authStore.getState)
