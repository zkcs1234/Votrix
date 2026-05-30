export default function VotrixMark({ className = '', title }) {
  const decorative = !title

  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : title}
    >
      {!decorative && <title>{title}</title>}
      <rect
        x="5"
        y="9"
        width="22"
        height="19"
        rx="4"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M10 9V6.75C10 5.78 10.78 5 11.75 5H20.25C21.22 5 22 5.78 22 6.75V9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M11.5 17.5L15 21L22.5 13.5"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
