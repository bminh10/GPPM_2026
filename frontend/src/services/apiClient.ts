import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

/** Mọi request gửi kèm cookie httpOnly (access/refresh token) nhờ `withCredentials`. */
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean }

// Các endpoint xác thực không được tự refresh để tránh vòng lặp vô hạn
const NO_REFRESH_URLS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout']

/**
 * Khi gặp 401: refresh token một lần (dùng chung giữa các request song song)
 * rồi gửi lại request gốc. Refresh thất bại thì gọi `onSessionExpired`.
 */
export function installRefreshInterceptor(
  client: AxiosInstance,
  refresh: () => Promise<unknown>,
  onSessionExpired: () => void,
) {
  let pendingRefresh: Promise<unknown> | null = null

  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const original = error.config as RetriableConfig | undefined
      const shouldRefresh =
        original &&
        error.response?.status === 401 &&
        !original._retried &&
        !NO_REFRESH_URLS.some((url) => original.url?.startsWith(url))

      if (!shouldRefresh) throw error

      original._retried = true
      try {
        pendingRefresh ??= refresh().finally(() => {
          pendingRefresh = null
        })
        await pendingRefresh
      } catch {
        onSessionExpired()
        throw error
      }
      return client(original)
    },
  )
}

/** Lấy thông điệp lỗi thân thiện từ phản hồi của FastAPI (`detail` là chuỗi hoặc danh sách lỗi validate). */
export function getErrorMessage(error: unknown, fallback = 'Đã có lỗi xảy ra, vui lòng thử lại'): string {
  if (!axios.isAxiosError(error)) return fallback
  if (!error.response) return 'Không kết nối được tới máy chủ'

  const detail = error.response.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg).replace(/^Value error, /, '')
  return fallback
}
