export default function DateTimeInput({
  value,
  onChange,
  onBlur,
  id,
  name,
  required = false,
  hasError = false,
  disabled = false,
  className = '',
}) {
  return (
    <input
      type="datetime-local"
      id={id}
      name={name}
      className={`v-input ${className}`}
      value={value ?? ''}
      onChange={event => onChange(event.target.value)}
      onBlur={onBlur}
      required={required}
      aria-invalid={hasError || undefined}
      disabled={disabled}
    />
  )
}
