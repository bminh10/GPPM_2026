import { apiClient } from './apiClient'

export type LightEnergy = {
  campus_id: string
  room_id: string
  light_id: string
  watts: number
  energy_kwh: number
  on_seconds: number
  known_seconds: number
  unknown_seconds: number
  current_watts: number | null
}

export type RoomEnergy = {
  campus_id: string
  room_id: string
  energy_kwh: number
  known_seconds: number
  unknown_seconds: number
  current_watts: number
  configured_lights: number
  online_lights: number
}

export type EnergySummary = {
  timezone: string
  start_date: string
  end_date: string
  as_of: number
  energy_kwh: number | null
  average_kwh: number | null
  configured_rooms: number
  rooms_with_data: number
  unknown_seconds: number
  rooms: RoomEnergy[]
  lights: LightEnergy[]
  daily: {
    date: string
    energy_kwh: number | null
    average_kwh: number | null
    rooms_with_data: number
    unknown_seconds: number
  }[]
}

export const ENERGY_EXPLANATION = 'Ước tính từ công suất cấu hình và thời gian bật đèn được thiết bị xác nhận, không phải số đo công tơ. Khi quá ngưỡng mất kết nối, thời gian thiếu dữ liệu không được cộng điện năng.'

export async function getEnergy(days: number, campus?: string, room?: string, signal?: AbortSignal) {
  const { data } = await apiClient.get<EnergySummary>('/lighting/energy', {
    params: { days, campus_id: campus, room_id: room }, signal,
  })
  return data
}

export function formatEnergy(kwh: number | null): string {
  if (kwh === null) return 'Chưa có dữ liệu'
  return kwh < 1
    ? `${(kwh * 1000).toLocaleString('vi-VN', { maximumFractionDigits: 3 })} Wh`
    : `${kwh.toLocaleString('vi-VN', { maximumFractionDigits: 4 })} kWh`
}
