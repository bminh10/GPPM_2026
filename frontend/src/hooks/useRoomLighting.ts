// Copyright (c) 2026 Minh Truong. Licensed under the MIT License, see LICENSE.
import { useCallback, useEffect, useRef, useState } from 'react'
import { commandLight, getLights, lightAddress, type LightStatus } from '../services/LightingService'
import { getErrorMessage } from '../services/apiClient'

export function useRoomLighting() {
  const [lights, setLights] = useState<Readonly<Record<string, LightStatus>>>({})
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState<ReadonlySet<string>>(new Set())
  const activeCommands = useRef(new Set<string>())
  const requestNumber = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      const number = ++requestNumber.current
      try {
        const data = await getLights(controller.signal)
        if (!controller.signal.aborted && number === requestNumber.current) {
          setLights(Object.fromEntries(data.map((light) => [
            lightAddress(light.campus_id, light.room_id, light.light_id), light,
          ])))
          setError(null)
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(getErrorMessage(cause))
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => { void poll() }, 1000)
      }
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [])

  const toggle = useCallback(async (campus: string, room: string, light: string) => {
    const key = lightAddress(campus, room, light)
    const current = lights[key]
    if (!current || !current.online || current.pending || error || activeCommands.current.has(key)) return
    activeCommands.current.add(key)
    setSending(new Set(activeCommands.current))
    ++requestNumber.current
    try {
      const updated = await commandLight(current, !(current.reported_on ?? false))
      ++requestNumber.current
      setLights((previous) => ({ ...previous, [key]: updated }))
    } catch (cause) {
      setError(getErrorMessage(cause))
    } finally {
      activeCommands.current.delete(key)
      setSending(new Set(activeCommands.current))
    }
  }, [lights, error])

  return { lights, error, sending, toggle }
}
