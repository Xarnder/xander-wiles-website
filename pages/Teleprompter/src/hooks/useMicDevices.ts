import { useCallback, useEffect, useState } from 'react'

export interface MicDevice {
  deviceId: string
  label: string
}

export function useMicDevices() {
  const [devices, setDevices] = useState<MicDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDevices([])
      return
    }
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const mics = all
        .filter((d) => d.kind === 'audioinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${i + 1}`,
        }))
      setDevices(mics)
      setSelectedDeviceId((prev) => {
        if (prev && mics.some((m) => m.deviceId === prev)) return prev
        return mics[0]?.deviceId ?? null
      })
    } catch {
      setDevices([])
    }
  }, [])

  useEffect(() => {
    void refresh()
    const handler = () => {
      void refresh()
    }
    navigator.mediaDevices?.addEventListener?.('devicechange', handler)
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handler)
    }
  }, [refresh])

  return {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    refresh,
  }
}
