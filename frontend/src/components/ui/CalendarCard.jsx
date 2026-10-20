import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Clock, X, Check, ArrowRight } from 'lucide-react'
import Button from '@/components/ui/Button'
import ClockTimePicker from '@/components/ui/ClockTimePicker'

const WEEK_DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const FULL_WEEK_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
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

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function ceilToMinute(date) {
  const result = new Date(date)
  const hasRemainingSeconds = result.getSeconds() > 0 || result.getMilliseconds() > 0
  result.setSeconds(0, 0)
  if (hasRemainingSeconds) result.setMinutes(result.getMinutes() + 1)
  return result
}

function isBeforeMinimum(date, hour, minute, minimum) {
  if (!date || !minimum) return false
  const candidate = new Date(date)
  candidate.setHours(hour, minute, 0, 0)
  return candidate < minimum
}

function addDays(d, n) {
  const next = new Date(d)
  next.setDate(next.getDate() + n)
  return next
}

function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate(), d.getHours(), d.getMinutes(), 0, 0)
}

const QUICK_PICKS = [
  { id: 'now', label: 'Now' },
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'next-week', label: 'Next week' },
  { id: 'next-month', label: 'Next month' },
]

function applyQuickPick(pickId, defaultHour, defaultMinute) {
  const now = new Date()
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), defaultHour, defaultMinute, 0, 0)
  switch (pickId) {
    case 'now':
      return ceilToMinute(now)
    case 'today':
      return base
    case 'tomorrow':
      return addDays(base, 1)
    case 'next-week':
      return addDays(base, 7)
    case 'next-month':
      return addMonths(base, 1)
    default:
      return null
  }
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
  placeholder = 'YYYY-MM-DD HH:MM',
  defaultHour = 9,
  defaultMinute = 0,
  className = '',
  ariaLabel,
  twoStep = false,
  confirmDate = false,
  showShortcuts = true,
  preventPast = false,
}) {
  const wrapperRef = useRef(null)
  const popRef = useRef(null)
  const inputRef = useRef(null)
  const pickerId = useId()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState('date')
  const [draftDate, setDraftDate] = useState(null)
  const [flipUp, setFlipUp] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  const today = useMemo(() => startOfDay(currentTime), [currentTime])
  const selected = useMemo(() => parseLocalInputValue(value), [value])
  const minDate = useMemo(() => {
    const parsed = min ? parseLocalInputValue(min) : null
    return parsed ? ceilToMinute(parsed) : null
  }, [min])
  const maxDate = useMemo(() => (max ? parseLocalInputValue(max) : null), [max])
  const effectiveMinDateTime = useMemo(() => (
    preventPast && (!minDate || currentTime > minDate) ? ceilToMinute(currentTime) : minDate
  ), [currentTime, minDate, preventPast])

  const initialSelected = useMemo(() => parseLocalInputValue(value), []) // eslint-disable-line react-hooks/exhaustive-deps
  const initialView = initialSelected || today
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(initialView))
  const [hour, setHour] = useState(() => initialSelected ? initialSelected.getHours() : defaultHour)
  const [minute, setMinute] = useState(() => initialSelected ? initialSelected.getMinutes() : defaultMinute)

  useEffect(() => {
    if (!selected) return
    setHour(selected.getHours())
    setMinute(selected.getMinutes())
    setViewMonth((prev) =>
      prev.getFullYear() === selected.getFullYear() && prev.getMonth() === selected.getMonth()
        ? prev
        : startOfMonth(selected),
    )
  }, [selected])

  useEffect(() => {
    if (!open) return undefined
    const handleClick = (e) => {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target)) setOpen(false)
    }
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        if (confirmDate) inputRef.current?.focus({ preventScroll: true })
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, confirmDate])

  useEffect(() => {
    if (!open || !preventPast) return undefined
    const interval = window.setInterval(() => setCurrentTime(new Date()), 10000)
    return () => window.clearInterval(interval)
  }, [open, preventPast])

  useEffect(() => {
    if (open && confirmDate && step === 'date') {
      const selectedDay = popRef.current?.querySelector('.v-cal-cell[aria-pressed="true"]')
      const initialDay = popRef.current?.querySelector('.v-cal-cell[aria-current="date"]:not(:disabled)')
        ?? popRef.current?.querySelector('.v-cal-cell:not(:disabled)')
      const focusDay = selectedDay ?? initialDay
      focusDay?.focus({ preventScroll: true })
    }
  }, [open, step, confirmDate])

  useLayoutEffect(() => {
    if (!open || !popRef.current || !wrapperRef.current) return
    if (confirmDate) {
      const positionPopup = () => {
        const anchor = wrapperRef.current.getBoundingClientRect()
        const popup = popRef.current.getBoundingClientRect()
        const below = window.innerHeight - anchor.bottom
        const above = anchor.top
        const preferredTop = below < popup.height + 16 && above > below
          ? anchor.top - popup.height - 6 : anchor.bottom + 6
        const top = Math.max(16, Math.min(preferredTop, window.innerHeight - popup.height - 16))
        const left = Math.max(16, Math.min(anchor.left, window.innerWidth - popup.width - 16))
        popRef.current.style.top = `${top - anchor.top}px`
        popRef.current.style.left = `${left - anchor.left}px`
        popRef.current.style.bottom = 'auto'
      }
      positionPopup()
      window.addEventListener('resize', positionPopup)
      window.addEventListener('scroll', positionPopup, true)
      return () => {
        window.removeEventListener('resize', positionPopup)
        window.removeEventListener('scroll', positionPopup, true)
      }
    }
    const pop = popRef.current
    const wrapper = wrapperRef.current
    const wrapperRect = wrapper.getBoundingClientRect()
    const popRect = pop.getBoundingClientRect()
    const spaceBelow = window.innerHeight - wrapperRect.bottom
    const spaceAbove = wrapperRect.top
    setFlipUp(spaceBelow < popRect.height + 16 && spaceAbove > spaceBelow)
  }, [open, viewMonth, step, draftDate, confirmDate])

  const gridDays = useMemo(() => buildMonthGrid(viewMonth), [viewMonth])
  const displayText = selected ? formatDisplay(selected, confirmDate) : ''
  const wrapperClass = [
    'v-cal',
    hasError ? 'v-cal-error' : '',
    disabled ? 'v-cal-disabled' : '',
    open ? 'v-cal-open' : '',
    flipUp && open ? 'v-cal-flip' : '',
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
    if (isOutsideRange(day, effectiveMinDateTime, maxDate)) return
    const next = new Date(day)
    next.setHours(hour, minute, 0, 0)
    if (isBeforeMinimum(next, hour, minute, effectiveMinDateTime)) {
      next.setHours(effectiveMinDateTime.getHours(), effectiveMinDateTime.getMinutes(), 0, 0)
      setHour(next.getHours())
      setMinute(next.getMinutes())
    }
    if (twoStep) {
      setDraftDate(next)
      if (!confirmDate) setStep('time')
      return
    }
    emitChange(next)
  }

  const handleHourChange = (raw) => {
    const h = Math.max(0, Math.min(23, Number(raw) || 0))
    const date = twoStep ? draftDate : selected
    const nextMinute = date && isSameDay(date, effectiveMinDateTime)
      && h === effectiveMinDateTime.getHours() && minute < effectiveMinDateTime.getMinutes()
      ? effectiveMinDateTime.getMinutes() : minute
    if (isBeforeMinimum(date, h, nextMinute, effectiveMinDateTime)) return
    setHour(h)
    if (nextMinute !== minute) setMinute(nextMinute)
    if (twoStep) return
    if (selected) {
      const next = new Date(selected)
      next.setHours(h, nextMinute, 0, 0)
      emitChange(next)
    }
  }

  const handleMinuteChange = (raw) => {
    const m = Math.max(0, Math.min(59, Number(raw) || 0))
    if (isBeforeMinimum(twoStep ? draftDate : selected, hour, m, effectiveMinDateTime)) return
    setMinute(m)
    if (twoStep) return
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

  const openPicker = () => {
    if (disabled) return
    setCurrentTime(new Date())
    if (!open && twoStep) {
      setStep('date')
      setDraftDate(selected)
      setHour(selected ? selected.getHours() : defaultHour)
      setMinute(selected ? selected.getMinutes() : defaultMinute)
      setViewMonth(startOfMonth(selected || today))
    }
    setOpen(true)
  }

  const handleToggle = () => {
    if (disabled) return
    if (open) setOpen(false)
    else openPicker()
  }

  const goPrevMonth = () => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))
  }

  const goNextMonth = () => {
    setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))
  }

  const handleQuickPick = (pickId) => {
    const picked = applyQuickPick(pickId, defaultHour, defaultMinute)
    if (!picked) return
    if (isOutsideRange(picked, effectiveMinDateTime, maxDate)
      || isBeforeMinimum(picked, picked.getHours(), picked.getMinutes(), effectiveMinDateTime)) return
    setViewMonth(startOfMonth(picked))
    setHour(picked.getHours())
    setMinute(picked.getMinutes())
    if (twoStep) {
      setDraftDate(picked)
      if (!confirmDate) setStep('time')
      return
    }
    emitChange(picked)
  }

  const popClass = ['v-cal-pop', twoStep ? 'v-cal-pop-step' : '', confirmDate ? 'v-cal-pop-polished' : '', flipUp ? 'v-cal-pop-up' : ''].filter(Boolean).join(' ')

  return (
    <div ref={wrapperRef} className={wrapperClass}>
      <div className="v-cal-input-wrap">
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          className="v-cal-input"
          value={displayText}
          placeholder={placeholder}
          onClick={twoStep ? openPicker : handleToggle}
          onFocus={twoStep ? undefined : () => setOpen(true)}
          onKeyDown={twoStep ? (event) => {
            if (['Enter', 'ArrowDown'].includes(event.key)) {
              event.preventDefault()
              openPicker()
            }
          } : undefined}
          onChange={(e) => {
            const parsed = parseLocalInputValue(e.target.value)
            if (parsed && !isOutsideRange(parsed, effectiveMinDateTime, maxDate)
              && !isBeforeMinimum(parsed, parsed.getHours(), parsed.getMinutes(), effectiveMinDateTime)) {
              emitChange(parsed)
              setViewMonth(startOfMonth(parsed))
              setHour(parsed.getHours())
              setMinute(parsed.getMinutes())
            } else if (!e.target.value) {
              emitChange(null)
            }
          }}
          onBlur={onBlur}
          disabled={disabled}
          required={required}
          aria-label={ariaLabel}
          aria-invalid={hasError || undefined}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={confirmDate && open ? pickerId : undefined}
        />
        <button
          type="button"
          className="v-cal-icon-btn"
          onClick={handleToggle}
          aria-label={open ? 'Close calendar' : 'Open calendar'}
          tabIndex={-1}
        >
          <Calendar className="v-cal-icon" strokeWidth={1.5} aria-hidden />
        </button>
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
        <div ref={popRef} id={pickerId} className={popClass} role="dialog" aria-label="Choose date and time">
          {twoStep && step === 'time' ? (
            <div className={confirmDate ? 'v-cal-step-content' : undefined}>
              {confirmDate && (
                <div className="v-cal-date-step-header">
                  <p className="text-sm font-semibold text-v-text">Select time</p>
                  <ol className="v-cal-steps" aria-label="Date and time steps">
                    {['date', 'time'].map((item, index) => (
                      <li key={item} aria-current={step === item ? 'step' : undefined}>
                        <span className="v-cal-step-dot" aria-hidden="true">
                          {item === 'date' && step === 'time'
                            ? <Check className="h-3 w-3" strokeWidth={2} />
                            : index + 1}
                        </span>
                        {item === 'date' ? 'Date' : 'Time'}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <ClockTimePicker date={draftDate} hour={hour} minute={minute}
                minDateTime={effectiveMinDateTime}
                polished={confirmDate}
                doneLabel={confirmDate ? 'Confirm' : 'Done'}
                onHourChange={handleHourChange} onMinuteChange={handleMinuteChange}
                onBack={() => {
                  setViewMonth(startOfMonth(draftDate))
                  setStep('date')
                }}
                onDone={() => {
                  const next = new Date(draftDate)
                  next.setHours(hour, minute, 0, 0)
                  if (isOutsideRange(next, effectiveMinDateTime, maxDate)
                    || isBeforeMinimum(next, hour, minute, effectiveMinDateTime)) return
                  emitChange(next)
                  setOpen(false)
                  if (confirmDate) inputRef.current?.focus({ preventScroll: true })
                }} />
            </div>
          ) : (
            <div className={confirmDate ? 'v-cal-step-content' : undefined}>
              {twoStep && (confirmDate ? (
                <div className="v-cal-date-step-header">
                  <p className="text-sm font-semibold text-v-text">Select date</p>
                  <ol className="v-cal-steps" aria-label="Date and time steps">
                    {['date', 'time'].map((item, index) => (
                      <li key={item} aria-current={step === item ? 'step' : undefined}>
                        <span className="v-cal-step-dot" aria-hidden="true">
                          {item === 'date' && step === 'time'
                            ? <Check className="h-3 w-3" strokeWidth={2} />
                            : index + 1}
                        </span>
                        {item === 'date' ? 'Date' : 'Time'}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : <p className="text-center text-xs font-medium text-v-text-subtle">1. Select Date</p>)}
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
                {WEEK_DAY_LABELS.map((w, index) => (
                  <div key={w} className="v-cal-weekday">{confirmDate ? FULL_WEEK_DAY_LABELS[index] : w}</div>
                ))}
              </div>

              <div className="v-cal-grid">
                {gridDays.map((day) => {
                  const inMonth = day.getMonth() === viewMonth.getMonth()
                  const isToday = isSameDay(day, today)
                  const isSelected = isSameDay(day, twoStep ? draftDate : selected)
                  const outside = isOutsideRange(day, effectiveMinDateTime, maxDate)
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
                      aria-pressed={confirmDate ? Boolean(isSelected) : isSelected}
                      aria-current={confirmDate && isToday ? 'date' : undefined}
                    >
                      {day.getDate()}
                    </button>
                  )
                })}
              </div>

              {showShortcuts && !confirmDate && <div className="v-cal-quick">
                {QUICK_PICKS.map((pick) => (
                  <button
                    key={pick.id}
                    type="button"
                    className="v-cal-quick-btn"
                    onClick={() => handleQuickPick(pick.id)}
                    disabled={(() => {
                      const picked = applyQuickPick(pick.id, defaultHour, defaultMinute)
                      return !picked || isOutsideRange(picked, effectiveMinDateTime, maxDate)
                        || isBeforeMinimum(picked, picked.getHours(), picked.getMinutes(), effectiveMinDateTime)
                    })()}
                  >
                    {pick.label}
                  </button>
                ))}
              </div>}

              {confirmDate && (
                <div className="v-cal-date-summary">
                  <div aria-live="polite">
                    <p className="text-xs text-v-text-subtle">Selected date</p>
                    <p className="mt-1 text-sm font-medium text-v-text">
                      {draftDate ? draftDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Choose a date'}
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" disabled={!draftDate || isOutsideRange(draftDate, effectiveMinDateTime, maxDate)
                      || isBeforeMinimum(draftDate, hour, minute, effectiveMinDateTime)} onClick={() => setStep('time')}>
                      Time <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              )}

              {!twoStep && <div className="v-cal-time">
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
                </div>
              </div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatDisplay(d, polished = false) {
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: polished ? 'numeric' : '2-digit',
    hour: polished ? 'numeric' : '2-digit',
    minute: '2-digit',
    ...(polished ? { hour12: true } : {}),
  })
}
