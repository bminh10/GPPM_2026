// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { normalizeRoomCode } from '../data/campusData'
import { apiClient, getErrorMessage } from '../services/apiClient'
import type { LightStatus } from '../services/LightingService'

type Campus = { id: number; name: string; address: string | null }
type Room = { id: number; name: string; campus_id: number }
type RoomSchedule = { room_id: number; start_time: string; end_time: string }
type AlertSource = {
  lights: LightStatus[]
  rooms: Room[]
  campuses: Map<number, { lightingId: string; name: string }>
  schedules: RoomSchedule[]
}

export type LightingWasteAlert = {
  campusId: string
  campusName: string
  roomName: string
  lightCount: number
  lights: LightStatus[]
}

export function localDate(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-')
}

function lightingCampusId(campus: Campus): string | null {
  const normalized = normalizeRoomCode(`${campus.name} ${campus.address ?? ''}`)
  if (normalized.includes('vovantan')) return 'CS1'
  if (normalized.includes('nhabe') || normalized.includes('nhonduc')) return 'CS3'
  return null
}

function secondsOfDay(value: string): number {
  const [hours, minutes, seconds = 0] = value.split(':').map(Number)
  return hours * 3600 + minutes * 60 + seconds
}

export function useLightingWasteAlerts() {
  const [now, setNow] = useState(() => new Date())
  const today = localDate(now)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 10_000)
    return () => window.clearInterval(timer)
  }, [])

  const query = useQuery({
    queryKey: ['lighting-waste-alerts', today],
    queryFn: async (): Promise<AlertSource> => {
      const [lightsResponse, roomsResponse, campusesResponse] = await Promise.all([
        apiClient.get<LightStatus[]>('/lighting/lights'),
        apiClient.get<Room[]>('/rooms'),
        apiClient.get<Campus[]>('/campus/all'),
      ])
      const campuses = new Map(
        campusesResponse.data.flatMap((campus) => {
          const lightingId = lightingCampusId(campus)
          return lightingId ? [[campus.id, { lightingId, name: campus.name }] as const] : []
        }),
      )
      const schedules = await Promise.all(
        campusesResponse.data
          .filter((campus) => lightingCampusId(campus) !== null)
          .map(async (campus) => {
            const { data } = await apiClient.get<RoomSchedule[]>('/schedules/room-status', {
              params: { campus_id: campus.id, date: today },
            })
            return data
          }),
      )

      return {
        lights: lightsResponse.data,
        rooms: roomsResponse.data,
        campuses,
        schedules: schedules.flat(),
      }
    },
    refetchInterval: 10_000,
  })

  const currentTime = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
  const scheduledRoomIds = new Set(
    (query.data?.schedules ?? [])
      .filter((schedule) =>
        secondsOfDay(schedule.start_time) <= currentTime &&
        currentTime < secondsOfDay(schedule.end_time),
      )
      .map((schedule) => schedule.room_id),
  )
  const roomsByAddress = new Map(
    (query.data?.rooms ?? []).flatMap((room) => {
      const campus = query.data?.campuses.get(room.campus_id)
      if (!campus) return []
      return [[
        JSON.stringify([campus.lightingId, normalizeRoomCode(room.name)]),
        { ...campus, room },
      ] as const]
    }),
  )
  const wastedLights = new Map<string, LightingWasteAlert>()

  for (const light of query.data?.lights ?? []) {
    if (light.pending || light.reported_on !== true) continue
    const room = roomsByAddress.get(JSON.stringify([
      light.campus_id.toUpperCase(),
      normalizeRoomCode(light.room_id),
    ]))
    if (!room || scheduledRoomIds.has(room.room.id)) continue

    const key = JSON.stringify([room.lightingId, room.room.id])
    const existing = wastedLights.get(key)
    wastedLights.set(key, {
      campusId: room.lightingId,
      campusName: room.name,
      roomName: room.room.name,
      lightCount: (existing?.lightCount ?? 0) + 1,
      lights: [...(existing?.lights ?? []), light],
    })
  }

  const alerts = [...wastedLights.values()].sort((left, right) =>
    left.campusName.localeCompare(right.campusName, 'vi') ||
    left.roomName.localeCompare(right.roomName, 'vi'),
  )

  return {
    alerts,
    error: query.error ? getErrorMessage(query.error) : null,
    isLoading: query.isLoading,
    now,
    today,
  }
}
