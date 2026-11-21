import styles from './EmptyState.module.css'

export function WelcomeMascot() {
  return (
    <svg
      className={styles.mascot}
      viewBox="0 0 88 88"
      width="100"
      height="100"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        className={styles.waveArm}
        fill="var(--bg-surface)"
        d="M52 64c5-3 9-7 11-12-4-3-5-6-3-8 1-1 3-1 5 1v-7a2 2 0 0 1 4 0v4l2-4a2 2 0 0 1 4 2l-1 4 2-2a2 2 0 0 1 3 3c-2 9-6 12-10 13-2 7-6 12-14 14"
      />
      <path className={styles.waveMarks} d="M77 33l3-3m1 7 4-1" />

      <path
        fill="var(--bg-surface)"
        d="M26 69c-5 0-7 3-6 6 1 3 7 3 15 2m10 0c8 1 14 1 15-2 1-3-1-6-6-6"
      />
      <path
        fill="var(--bg-surface)"
        d="M26 51c-5 4-8 11-7 17 1 5 8 7 20 7s19-2 20-7c1-6-2-13-7-17"
      />
      <rect x="37" y="62" width="5" height="5" rx="1" fill="#84b8a6" stroke="none" />

      <path
        fill="var(--bg-surface)"
        d="M13 35c0-11 8-20 19-22 2-4 6-6 12-6-2 2-3 4-3 6 14 0 26 10 26 23 0 14-10 22-27 22S13 50 13 35Z"
      />
      <path d="M15 30c7 1 14-1 20-7 5 5 12 7 19 5" />
      <g fill="currentColor" stroke="none">
        <ellipse cx="31" cy="37" rx="2.5" ry="3.3" />
        <ellipse cx="49" cy="37" rx="2.5" ry="3.3" />
      </g>
      <path d="M37 43c1.5 2 4.5 2 6 0" />
      <path d="M24 43h2m28 0h2" stroke="#84b8a6" />
    </svg>
  )
}
