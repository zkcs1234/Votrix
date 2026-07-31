import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react'

const WEEK_DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function pad(n) {
  return String(n).padStart(2, '0')
}

function toLocalInputValue(date) {
  if (!date || Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function parseLocalInputValue(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function buildMonthGrid(monthStart) {
  const firstDay = monthStart.getDay()
  const mondayOffset = (firstDay + 6) % 7
  const gridStart = new Date(monthStart)
  gridStart.setDate(gridStart.getDate() - mondayOffset)
  const days = []
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    days.push(d)
  }
  return days
}

function isSameDay(a, b) {
  return (
    a && b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isOutsideRange(date, minDate, maxDate) {
  if (minDate && date < new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) return true
  if (maxDate && date > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate(), 23, 59, 59)) return true
  return false
}

export default function CalendarCard({
  id,
  name,
  value,
  onChange,
  onBlur,
  min,
  max,
  disabled = false,
  required = false,
  hasError = false,
  placeholder = 'Select date & time',
  className = '',
  ariaLabel,
}) {
  const wrapperRef = useRef(null)
  const inputRef = useRef(null)
  const [open, setOpen] = useState(false)
  const today = useMemo(() => new Date(), [])
  const selected = useMemo(() => parseLocalInputValue(value), [value])
  const minDate = useMemo(() => (min ? parseLocalInputValue(min) : null), [min])
  const maxDate = useMemo(() => (max ? parseLocalInputValue(max) : null), [max])

  const initialSelected = useMemo(() => parseLocalInputValue(value), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [viewMonth, setViewMonth] = useState(() => initialSelected ? startOfMonth(initialSelected) : startOfMonth(today))
  const [hour, setHour] = useState(() => initialSelected ? initialSelected.getHours() : 9)
  const [minute, setMinute] = useState(() => initialSelected ? initialSelected.getMinutes() : 0)

  useEffect(() => {
    if (!open) return undefined
    const handleClick = (e) => {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target)) setOpen(false)
    }
    const handleKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const gridDays = useMemo(() => buildMonthGrid(viewMonth), [viewMonth])
  const displayText = selected ? formatDisplay(selected) : ''
  const wrapperClass = [
    'v-cal',
    hasError ? 'v-cal-error' : '',
    disabled ? 'v-cal-disabled' : '',
    open ? 'v-cal-open' : '',
    className,
  ].filter(Boolean).join(' ')

  const emitChange = (date) => {
    if (!date) {
      onChange?.('')
      return
    }
    onChange?.(toLocalInputValue(date))
  }

  const handleDayClick = (day) => {
    if (isOutsideRange(day, minDate, maxDate)) return
    const next = new Date(day)
    next.setHours(hour, minute, 0, 0)
    emitChange(next)
    inputRef.current?.focus()
  }

  const handleHourChange = (raw) => {
    const h = Math.max(0, Math.min(23, Number(raw) || 0))
    setHour(h)
    if (selected) {
      const next = new Date(selected)
      next.setHours(h, minute, 0, 0)
      emitChange(next)
    }
  }

  const handleMinuteChange = (raw) => {
    const m = Math.max(0, Math.min(59, Number(raw) || 0))
    setMinute(m)
    if (selected) {
      const next = new Date(selected)
      next.setHours(hour, m, 0, 0)
      emitChange(next)
    }
  }

  const handleClear = (e) => {
    e.preventDefault()
    e.stopPropagation()
    emitChange(null)
    setOpen(false)
  }

  const handleToggle = () => {
    if (disabled) return
    setOpen((v) => !v)
  }

  const goPrevMonth = () => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))
  }

  const goNextMonth = () => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))
  }

  const goToday = () => {
    const now = new Date()
    setViewMonth(startOfMonth(now))
    setHour(now.getHours())
    setMinute(now.getMinutes())
  }

  return (
    <div ref={wrapperRef} className={wrapperClass}>
      <div className="v-cal-input-wrap">
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          readOnly
          className="v-cal-input"
          value={displayText}
          placeholder={placeholder}
          onClick={handleToggle}
          onFocus={() => setOpen(true)}
          onBlur={onBlur}
          disabled={disabled}
          required={required}
          aria-label={ariaLabel}
          aria-invalid={hasError || undefined}
          aria-haspopup="dialog"
          aria-expanded={open}
        />
        <Calendar className="v-cal-icon" strokeWidth={1.5} aria-hidden />
        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="v-cal-clear"
            aria-label="Clear date"
            tabIndex={-1}
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        )}
      </div>

      {open && !disabled && (
        <div className="v-cal-pop" role="dialog" aria-label="Choose date and time">
          <div className="v-cal-header">
            <button type="button" onClick={goPrevMonth} className="v-cal-nav" aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            </button>
            <div className="v-cal-title">
              {MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </div>
            <button type="button" onClick={goNextMonth} className="v-cal-nav" aria-label="Next month">
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>

          <div className="v-cal-weekdays">
            {WEEK_DAY_LABELS.map((w) => (
              <div key={w} className="v-cal-weekday">{w}</div>
            ))}
          </div>

          <div className="v-cal-grid">
            {gridDays.map((day) => {
              const inMonth = day.getMonth() === viewMonth.getMonth()
              const isToday = isSameDay(day, today)
              const isSelected = isSameDay(day, selected)
              const outside = isOutsideRange(day, minDate, maxDate)
              const cellClass = [
                'v-cal-cell',
                inMonth ? '' : 'v-cal-cell-out',
                isToday ? 'v-cal-cell-today' : '',
                isSelected ? 'v-cal-cell-selected' : '',
                outside ? 'v-cal-cell-disabled' : '',
              ].filter(Boolean).join(' ')
              return (
                <button
                  type="button"
                  key={day.toISOString()}
                  className={cellClass}
                  onClick={() => handleDayClick(day)}
                  disabled={outside}
                  aria-label={day.toDateString()}
                  aria-pressed={isSelected}
                >
                  {day.getDate()}
                </button>
              )
            })}
          </div>

          <div className="v-cal-time">
            <div className="v-cal-time-label">
              <Clock className="h-3.5 w-3.5" strokeWidth={2} />
              <span>Time</span>
            </div>
            <div className="v-cal-time-fields">
              <label className="v-cal-time-field">
                <span className="v-cal-time-cap">Hour</span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={hour}
                  onChange={(e) => handleHourChange(e.target.value)}
                  className="v-cal-time-input"
                />
              </label>
              <span className="v-cal-time-sep">:</span>
              <label className="v-cal-time-field">
                <span className="v-cal-time-cap">Min</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={minute}
                  onChange={(e) => handleMinuteChange(e.target.value)}
                  className="v-cal-time-input"
                />
              </label>
              <button type="button" onClick={goToday} className="v-cal-today-btn">Now</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatDisplay(d) {
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
