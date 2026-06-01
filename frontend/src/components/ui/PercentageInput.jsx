import { useState } from 'react'

export default function PercentageInput({
  value,
  onChange,
  disabled = false,
  className = '',
  suffix = '%',
}) {
  const [error, setError] = useState('')

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

    if (num < 0 || num > 100) {
      setError('Must be 0-100')
      return
    }

    setError('')
    onChange(val)
  }

  return (
    <div className={className}>
      <div className="relative">
        <input
          type="number"
          min={0}
          max={100}
          disabled={disabled}
          className={`v-input pr-8 ${error ? 'border-v-danger' : ''}`}
          value={value ?? ''}
          onChange={handleChange}
          placeholder="0-100"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-v-text-subtle">
            {suffix}
          </span>
        )}
      </div>
      {error && <p className="v-error-text">{error}</p>}
    </div>
  )
}