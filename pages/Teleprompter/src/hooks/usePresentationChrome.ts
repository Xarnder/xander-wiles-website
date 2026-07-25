import { useEffect, useRef, useState } from 'react'

/**
 * Auto-hide the control chrome after idle while presenting (live listening).
 * Mouse near the top, key press, or top-edge touch reveals it again.
 */
export function usePresentationChrome(presenting: boolean) {
  const [chromeVisible, setChromeVisible] = useState(true)
  const visibleRef = useRef(true)

  useEffect(() => {
    if (!presenting) {
      visibleRef.current = true
      setChromeVisible(true)
      return
    }

    let timer = 0
    const hideSoon = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        visibleRef.current = false
        setChromeVisible(false)
      }, 2800)
    }

    const reveal = () => {
      visibleRef.current = true
      setChromeVisible(true)
      hideSoon()
    }

    const onMove = (e: MouseEvent) => {
      if (e.clientY < 120) {
        reveal()
        return
      }
      if (visibleRef.current) hideSoon()
    }

    const onTouch = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0
      if (y < 140) reveal()
    }

    reveal()
    window.addEventListener('mousemove', onMove)
    window.addEventListener('keydown', reveal)
    window.addEventListener('touchstart', onTouch, { passive: true })

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('keydown', reveal)
      window.removeEventListener('touchstart', onTouch)
    }
  }, [presenting])

  return chromeVisible
}
