import { useState, useEffect, useRef } from 'react'
import { validScore } from '../../../../shared/competition-score-input.js'

export default function ScoreInput({
  min = 0,
  max = 100,
  step = 1,
  decimalPlaces,
  value,
  onChange,
  disabled = false,
  className = '',
  size = 'md',
}) {
  const [error, setError] = useState('')
  // Local display so the field keeps showing exactly what the judge typed —
  // even when it's out of range. The old version silently discarded an
  // out-of-range value and snapped the field back to the last valid digit
  // (typing 90 with a bad 1–10 cap left "9" with no obvious signal). Now the
  // typed value stays visible with a clear error, and only a VALID value is
  // saved upstream.
  const [display, setDisplay] = useState(value ?? '')
  const emitted = useRef(value)
  useEffect(() => {
    if (value !== emitted.current) { setDisplay(value ?? ''); setError(''); emitted.current = value }
  }, [value])

  const sizeClasses = {
    sm: 'w-14 px-2 py-1 text-xs',
    md: 'w-16 px-2 py-1.5 text-sm',
    lg: 'w-20 px-3 py-2 text-base',
  }

  const handleChange = (e) => {
    const val = e.target.value
    setDisplay(val) // always show what was typed

    if (val === '') {
      setError('')
      emitted.current = val
      onChange(val)
      return
    }

    const num = parseFloat(val)
    if (isNaN(num)) {
      setError('Enter a number')
      emitted.current = ''; onChange('')
      return
    }

    if (num < min || num > max) {
      // Keep the typed value visible + a loud error; do NOT save an
      // out-of-range score (this is what surfaces a wrong score-range setup
      // instead of silently truncating it).
      setError(`Must be ${min}–${max}`)
      emitted.current = ''; onChange('')
      return
    }

    if (!validScore(val, {minScore:min,maxScore:max,decimalPlaces})) {
      setError(decimalPlaces === 0 ? 'Use a whole number' : `Use at most ${decimalPlaces} decimal places`)
      emitted.current = ''; onChange('')
      return
    }

    setError('')
    emitted.current = val
    onChange(val)
  }

  return (
    <div className={className}>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className={`v-input text-center ${sizeClasses[size]} ${
          error ? 'border-v-danger ring-1 ring-v-danger' : ''
        }`}
        value={display}
        onChange={handleChange}
        aria-invalid={error ? 'true' : 'false'}
      />
      {error && <p className="v-error-text whitespace-nowrap font-medium text-v-danger">{error}</p>}
    </div>
  )
}
