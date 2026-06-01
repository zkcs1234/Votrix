export default function DateTimeInput({
  value,
  onChange,
  min,
  max,
  disabled = false,
  className = '',
}) {
  const handleChange = (e) => {
    onChange(e.target.value)
  }

  return (
    <input
      type="datetime-local"
      className={`v-input ${className}`}
      value={value ?? ''}
      onChange={handleChange}
      min={min}
      max={max}
      disabled={disabled}
    />
  )
}