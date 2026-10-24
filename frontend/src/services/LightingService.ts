import { apiClient } from './apiClient'

export type LightStatus = {
  campus_id: string
  room_id: string
  light_id: string
  device_id: string
  desired_on: boolean
  reported_on: boolean | null
  revision: number
  online: boolean
  pending: boolean
  timed_out: boolean
  last_seen: number | null
  reported_at: number | null
  source: 'simulated'
}

export const lightAddress = (campus: string, room: string, light: string) =>
  JSON.stringify([campus, room, light])

export async function getLights(signal?: AbortSignal): Promise<LightStatus[]> {
  const { data } = await apiClient.get<LightStatus[]>('/lighting/lights', { signal })
  return data
}

export async function commandLight(status: LightStatus, on: boolean): Promise<LightStatus> {
  const path = [status.campus_id, status.room_id, status.light_id].map(encodeURIComponent)
  const { data } = await apiClient.put<LightStatus>(
    `/lighting/rooms/${path[0]}/${path[1]}/lights/${path[2]}`,
    { on, expected_revision: status.revision },
  )
  return data
}
