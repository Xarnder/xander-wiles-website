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

export function IconFlip({ className, title }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 122.88 98.12"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="currentColor"
        d="M37.21,15.38l0,0.17h33.53v26.54l-33.79,0l0.01,0.26v9.61c0,0.08,0,0.16-0.01,0.24c-0.09,2.07-0.77,3.54-2.06,4.39 c-1.29,0.86-2.99,0.94-5.08,0.23c-0.23-0.08-0.43-0.19-0.61-0.33C19.1,48.57,12.14,40.65,2.04,32.72L1.9,32.6 c-1.68-1.52-2.14-3.11-1.79-4.7c0.31-1.4,1.29-2.6,2.6-3.63L27.47,2.3c1.21-0.95,2.48-1.69,3.67-2.05c1.07-0.32,2.11-0.35,3.07,0 c1.05,0.38,1.88,1.15,2.42,2.39c0.38,0.89,0.59,2.03,0.59,3.46v9.05C37.22,15.24,37.22,15.31,37.21,15.38L37.21,15.38L37.21,15.38z M85.67,82.73l0-0.17H52.14V56.03l33.79,0l-0.01-0.26v-9.61c0-0.08,0-0.17,0.01-0.24c0.09-2.07,0.77-3.54,2.06-4.39 c1.29-0.86,2.99-0.94,5.08-0.23c0.23,0.08,0.43,0.19,0.61,0.33c10.1,7.92,17.06,15.85,27.15,23.78l0.14,0.12 c1.68,1.52,2.14,3.11,1.79,4.7c-0.31,1.4-1.29,2.6-2.6,3.63L95.41,95.82c-1.21,0.95-2.48,1.69-3.67,2.05 c-1.07,0.32-2.11,0.35-3.07,0c-1.05-0.38-1.88-1.15-2.42-2.39c-0.38-0.89-0.59-2.03-0.59-3.46v-9.06 C85.66,82.88,85.66,82.81,85.67,82.73L85.67,82.73L85.67,82.73z"
      />
    </svg>
  )
}
