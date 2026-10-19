import { useEffect, useId, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import { ArrowLeft } from 'lucide-react'

export default function ClockTimePicker({ date, hour, minute, onHourChange, onMinuteChange, onBack, onDone, polished = false }) {
  const [unit, setUnit] = useState('hour')
  const hourRef = useRef(null)
  const minuteRef = useRef(null)
  const keyboardHintId = useId()
  useEffect(() => { hourRef.current?.focus() }, [])
  useEffect(() => {
    if (polished) (unit === 'hour' ? hourRef : minuteRef).current?.focus({ preventScroll: true })
  }, [unit, polished])
  const displayHour = hour % 12 || 12
  const selected = unit === 'hour' ? displayHour : minute
  const angle = (unit === 'hour' ? displayHour * 30 : minute * 6) * Math.PI / 180
  const choose = (value) => {
    if (unit === 'hour') {
      onHourChange(value % 12 + (hour >= 12 ? 12 : 0))
      setUnit('minute')
    } else {
      onMinuteChange(value)
    }
  }
  const adjustFromKeyboard = (event, selectedUnit) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    const delta = ['ArrowUp', 'ArrowRight'].includes(event.key) ? 1 : -1
    if (selectedUnit === 'hour') {
      setUnit('hour')
      const next = (displayHour - 1 + delta + 12) % 12 + 1
      onHourChange(next % 12 + (hour >= 12 ? 12 : 0))
    } else {
      setUnit('minute')
      onMinuteChange((minute + delta + 60) % 60)
    }
  }
  const periodSelector = (
    <div className="v-clock-period flex justify-center gap-1" role="group" aria-label="AM or PM">
      {['AM', 'PM'].map((period) => (
        <button key={period} type="button" className="v-cal-quick-btn" aria-pressed={period === (hour >= 12 ? 'PM' : 'AM')}
          onClick={() => onHourChange(hour % 12 + (period === 'PM' ? 12 : 0))}>
          {period}
        </button>
      ))}
    </div>
  )

  return (
    <div className={`v-clock-picker ${polished ? 'v-clock-polished' : ''}`}>
      {!polished && <p className="text-center text-xs font-medium text-v-text-subtle">2. Select Time</p>}
      <p className="text-center text-sm text-v-text">{date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      <div className="v-clock-display flex items-center justify-center gap-2 text-v-text">
        <button ref={hourRef} type="button" className="v-clock-value" aria-label="Select hour" aria-pressed={unit === 'hour'} onClick={() => setUnit('hour')}
          aria-describedby={polished ? keyboardHintId : undefined}
          onKeyDown={polished ? (event) => adjustFromKeyboard(event, 'hour') : undefined}>
          {String(displayHour).padStart(2, '0')}
        </button>
        <span aria-hidden="true">:</span>
        {polished ? (
          <button ref={minuteRef} type="button" className="v-clock-value" aria-label="Select minute" aria-pressed={unit === 'minute'}
            aria-describedby={keyboardHintId}
            onClick={() => setUnit('minute')} onKeyDown={(event) => adjustFromKeyboard(event, 'minute')}>
            {String(minute).padStart(2, '0')}
          </button>
        ) : <label>
          <span className="sr-only">Minute</span>
          <input type="number" min={0} max={59} value={String(minute).padStart(2, '0')} className="v-clock-value v-clock-minute"
            onFocus={() => setUnit('minute')} onChange={(event) => onMinuteChange(event.target.value)} />
        </label>}
        {polished ? <span className="v-clock-display-period">{hour >= 12 ? 'PM' : 'AM'}</span> : periodSelector}
      </div>
      <p className="text-center text-xs text-v-text-subtle" aria-live="polite">{unit === 'hour' ? 'Select an hour' : 'Select a minute'}</p>
      {polished && <p id={keyboardHintId} className="sr-only">Use arrow keys to adjust the selected hour or minute.</p>}
      <div className="v-clock-face" role="group" aria-label={unit === 'hour' ? 'Hour clock' : 'Minute clock'}
        onPointerDown={(event) => {
          if (event.target.closest('button')) return
          const rect = event.currentTarget.getBoundingClientRect()
          const degrees = (Math.atan2(event.clientX - rect.left - rect.width / 2, -(event.clientY - rect.top - rect.height / 2)) * 180 / Math.PI + 360) % 360
          choose(unit === 'hour' ? Math.round(degrees / 30) % 12 || 12 : Math.round(degrees / 6) % 60)
        }}>
        <svg viewBox="0 0 220 220" className="v-clock-hand" aria-hidden="true">
          {polished && Array.from({ length: 60 }, (_, index) => {
            const radians = index * Math.PI / 30
            const major = index % 5 === 0
            return <line key={index} className={`v-clock-tick ${major ? 'v-clock-tick-major' : ''}`}
              x1={110 + Math.sin(radians) * (major ? 94 : 97)} y1={110 - Math.cos(radians) * (major ? 94 : 97)}
              x2={110 + Math.sin(radians) * 101} y2={110 - Math.cos(radians) * 101} />
          })}
          <line x1="110" y1="110" x2={110 + Math.sin(angle) * 82} y2={110 - Math.cos(angle) * 82} />
          <circle cx="110" cy="110" r="4" />
          {polished && unit === 'minute' && minute % 5 !== 0 && (
            <circle cx={110 + Math.sin(angle) * 82} cy={110 - Math.cos(angle) * 82} r="4" />
          )}
        </svg>
        {Array.from({ length: 12 }, (_, index) => {
          const value = unit === 'hour' ? index || 12 : index * 5
          const radians = index * Math.PI / 6
          return (
            <button key={`${unit}-${value}`} type="button" className="v-clock-number"
              style={{ left: `${50 + Math.sin(radians) * 38}%`, top: `${50 - Math.cos(radians) * 38}%` }}
              aria-label={`${unit === 'hour' ? 'Hour' : 'Minute'} ${value}`} aria-pressed={selected === value}
              onClick={() => choose(value)}>
              {unit === 'hour' ? value : String(value).padStart(2, '0')}
            </button>
          )
        })}
      </div>
      {polished && periodSelector}
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" size="sm" onClick={onBack}>{polished && <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />}Back</Button>
        <Button size="sm" onClick={onDone}>Done</Button>
      </div>
    </div>
  )
}
