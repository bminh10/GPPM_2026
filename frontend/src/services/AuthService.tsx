import { apiClient, installRefreshInterceptor } from './apiClient'
import { authStore, type AuthUser } from '../store/authStore'

export type SignInPayload = { email: string; password: string }
export type SignUpPayload = { fullName: string; email: string; password: string }

export async function signIn({ email, password }: SignInPayload): Promise<AuthUser> {
  const { data } = await apiClient.post<AuthUser>('/auth/login', { email, pass_word: password })
  authStore.setUser(data)
  return data
}

export async function signUp({ fullName, email, password }: SignUpPayload): Promise<AuthUser> {
  const { data } = await apiClient.post<AuthUser>('/auth/register', {
    user_name: fullName,
    email,
    pass_word: password,
  })
  authStore.setUser(data)
  return data
}

export async function logOut(): Promise<void> {
  try {
    await apiClient.post('/auth/logout')
  } finally {
    authStore.clear()
  }
}

export async function refreshToken(): Promise<AuthUser> {
  const { data } = await apiClient.post<AuthUser>('/auth/refresh')
  return data
}

export async function getCurrentUser(): Promise<AuthUser> {
  const { data } = await apiClient.get<AuthUser>('/auth/me')
  return data
}

let bootstrapping: Promise<void> | null = null

/** Khôi phục phiên khi tải trang (cookie httpOnly không đọc được từ JS nên phải hỏi server). */
export function restoreSession(): Promise<void> {
  bootstrapping ??= getCurrentUser().then(authStore.setUser, authStore.clear)
  return bootstrapping
}

installRefreshInterceptor(apiClient, refreshToken, authStore.clear)
