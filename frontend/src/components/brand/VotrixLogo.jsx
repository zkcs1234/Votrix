import { Link } from 'react-router-dom'
import VotrixMark from '@/components/brand/VotrixMark'

const sizes = {
  sm: { mark: 'h-6 w-6', text: 'text-sm', gap: 'gap-2' },
  md: { mark: 'h-8 w-8', text: 'text-lg', gap: 'gap-2.5' },
  lg: { mark: 'h-10 w-10', text: 'text-xl', gap: 'gap-3' },
  xl: { mark: 'h-12 w-12', text: 'text-2xl', gap: 'gap-3' },
}

export default function VotrixLogo({
  size = 'md',
  variant = 'full',
  showTagline = false,
  linkTo = '/',
  className = '',
}) {
  const config = sizes[size] ?? sizes.md
  const toneClass = className || 'text-v-text'

  const logo = (
    <div className={`inline-flex flex-col items-center ${showTagline ? 'gap-2' : ''}`}>
      <div className={`inline-flex items-center ${config.gap} ${toneClass}`}>
        <VotrixMark className={`${config.mark} shrink-0`} title="" />
        {variant === 'full' && (
          <span
            className={`${config.text} font-bold tracking-[0.14em] leading-none`}
          >
            VOTR
            <span className={`text-v-primary`}>I</span>
            X
          </span>
        )}
      </div>
      {showTagline && (
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-v-text-subtle">
          Every Vote Counts
        </p>
      )}
    </div>
  )

  if (linkTo) {
    return (
      <Link
        to={linkTo}
        className="inline-flex shrink-0 transition-opacity hover:opacity-80"
        aria-label="VOTRIX home"
      >
        {logo}
      </Link>
    )
  }

  return logo
}
