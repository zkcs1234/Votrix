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
      {/* Stylized "V" — two converging strokes meeting at the bottom.
          Reads as: vote tally / consensus / choice. */}
      <path
        d="M4 5 L13 27 L16 27"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 27 L19 27 L28 5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Apex accent dot — a single tally mark above the V's vertex.
          Reinforces the "vote" idea; also serves as the brand color hotspot. */}
      <circle cx="16" cy="5" r="2.25" fill="currentColor" />
    </svg>
  )
}
