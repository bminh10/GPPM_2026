import { useCallback, useEffect, useState } from 'react'
import { getEnergy, type EnergySummary } from '../services/EnergyService'
import { getErrorMessage } from '../services/apiClient'

export function useEnergy(days: number, campus?: string, room?: string) {
  const key = JSON.stringify([days, campus, room])
  const [result, setResult] = useState<{ key: string; data: EnergySummary } | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion((value) => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const data = await getEnergy(days, campus, room, controller.signal)
        if (!controller.signal.aborted) {
          setResult({ key, data })
          setFailure(null)
        }
      } catch (cause) {
        if (!controller.signal.aborted) setFailure({ key, message: getErrorMessage(cause) })
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => { void poll() }, 5000)
      }
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [days, campus, room, key, version])

  return {
    data: result?.key === key ? result.data : null,
    error: failure?.key === key ? failure.message : null,
    refresh,
  }
}
