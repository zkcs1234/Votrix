import CalendarCard from '@/components/ui/CalendarCard'

export default function DateTimeInput({
  value,
  onChange,
  onBlur,
  id,
  name,
  min,
  max,
  required = false,
  hasError = false,
  disabled = false,
  className = '',
  showShortcuts = true,
}) {
  return (
    <CalendarCard
      id={id}
      name={name}
      className={className}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      min={min}
      max={max}
      required={required}
      hasError={hasError}
      disabled={disabled}
      placeholder="Select date and time"
      twoStep
      confirmDate
      showShortcuts={showShortcuts}
      preventPast
    />
  )
}
