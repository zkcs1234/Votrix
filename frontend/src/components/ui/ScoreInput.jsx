import { useState } from 'react'

export default function ScoreInput({
  min = 0,
  max = 100,
  step = 1,
  value,
  onChange,
  disabled = false,
  className = '',
  size = 'md',
}) {
  const [error, setError] = useState('')

  const sizeClasses = {
    sm: 'w-14 px-2 py-1 text-xs',
    md: 'w-16 px-2 py-1.5 text-sm',
    lg: 'w-20 px-3 py-2 text-base',
  }

  const handleChange = (e) => {
    const val = e.target.value

    if (val === '') {
      onChange(val)
      setError('')
      return
    }

    const num = parseFloat(val)
    if (isNaN(num)) {
      setError('Invalid number')
      return
    }

    if (num < min || num > max) {
      setError(`Must be ${min}-${max}`)
      return
    }

    setError('')
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
          error ? 'border-v-danger' : ''
        }`}
        value={value ?? ''}
        onChange={handleChange}
      />
      {error && <p className="v-error-text">{error}</p>}
    </div>
  )
}