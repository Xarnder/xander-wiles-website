/** Icons adapted from repo `assets/SVGs` and `assets/icons` for themeable currentColor fill. */

interface IconProps {
  className?: string
  title?: string
}

export function IconArrowLeft({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 121.16 111.97"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M1.19,58.79l54.18,52.09c2.47,2.37,6.58.62,6.58-2.8v-26.39c0-2.15,1.74-3.89,3.89-3.89h51.44c2.15,0,3.89-1.74,3.89-3.89v-35.86c0-2.15-1.74-3.89-3.89-3.89h-51.44c-2.15,0-3.89-1.74-3.89-3.89V3.89c0-3.42-4.11-5.17-6.58-2.8L1.19,53.18c-1.59,1.53-1.59,4.07,0,5.6Z"
      />
    </svg>
  )
}

export function IconArrowRight({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 121.16 111.97"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M119.97,53.18L65.79,1.09c-2.47-2.37-6.58-.62-6.58,2.8v26.39c0,2.15-1.74,3.89-3.89,3.89H3.89c-2.15,0-3.89,1.74-3.89,3.89v35.86c0,2.15,1.74,3.89,3.89,3.89h51.44c2.15,0,3.89,1.74,3.89,3.89v26.39c0,3.42,4.11,5.17,6.58,2.8l54.18-52.09c1.59-1.53,1.59-4.07,0-5.6Z"
      />
    </svg>
  )
}

export function IconArrowUp({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 111.97 121.16"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M53.18,1.19L1.09,55.37c-2.37,2.47-.62,6.58,2.8,6.58h26.39c2.15,0,3.89,1.74,3.89,3.89v51.44c0,2.15,1.74,3.89,3.89,3.89h35.86c2.15,0,3.89-1.74,3.89-3.89v-51.44c0-2.15,1.74-3.89,3.89-3.89h26.39c3.42,0,5.17-4.11,2.8-6.58L58.78,1.19c-1.53-1.59-4.07-1.59-5.6,0Z"
      />
    </svg>
  )
}

export function IconArrowDown({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 111.97 121.16"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M58.79,119.97l52.09-54.18c2.37-2.47.62-6.58-2.8-6.58h-26.39c-2.15,0-3.89-1.74-3.89-3.89V3.89c0-2.15-1.74-3.89-3.89-3.89h-35.86c-2.15,0-3.89,1.74-3.89,3.89v51.44c0,2.15-1.74,3.89-3.89,3.89H3.89c-3.42,0-5.17,4.11-2.8,6.58l52.09,54.18c1.53,1.59,4.07,1.59,5.6,0Z"
      />
    </svg>
  )
}

export function IconClose({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 121.31 122.876"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M90.914,5.296c6.927-7.034,18.188-7.065,25.154-0.068 c6.961,6.995,6.991,18.369,0.068,25.397L85.743,61.452l30.425,30.855c6.866,6.978,6.773,18.28-0.208,25.247 c-6.983,6.964-18.21,6.946-25.074-0.031L60.669,86.881L30.395,117.58c-6.927,7.034-18.188,7.065-25.154,0.068 c-6.961-6.995-6.992-18.369-0.068-25.397l30.393-30.827L5.142,30.568c-6.867-6.978-6.773-18.28,0.208-25.247 c6.983-6.963,18.21-6.946,25.074,0.031l30.217,30.643L90.914,5.296L90.914,5.296z"
      />
    </svg>
  )
}
