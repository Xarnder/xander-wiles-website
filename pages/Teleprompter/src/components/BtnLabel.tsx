import type { ReactNode } from 'react'

/** Label text inside chrome buttons — flipped independently for UI mirror. */
export function BtnLabel({ children }: { children: ReactNode }) {
  return <span className="btn-label">{children}</span>
}
