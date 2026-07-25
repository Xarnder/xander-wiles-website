import { useEffect, useRef } from 'react'

/**
 * Keep the screen awake while `active` (e.g. live teleprompter session).
 * No-ops when the Wake Lock API is unavailable.
 */
export function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!active || !navigator.wakeLock?.request) {
      void lockRef.current?.release().catch(() => {})
      lockRef.current = null
      return
    }

    let cancelled = false

    const request = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) {
          void lock.release()
          return
        }
        lockRef.current = lock
        lock.addEventListener('release', () => {
          if (lockRef.current === lock) lockRef.current = null
        })
      } catch {
        // Permission / battery / unsupported — ignore.
      }
    }

    void request()

    const onVisible = () => {
      if (document.visibilityState === 'visible' && active) void request()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lockRef.current?.release().catch(() => {})
      lockRef.current = null
    }
  }, [active])
}
