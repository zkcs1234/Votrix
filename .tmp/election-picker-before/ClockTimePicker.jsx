import { useEffect, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import { ArrowLeft } from 'lucide-react'

export default function ClockTimePicker({ date, hour, minute, onHourChange, onMinuteChange, onBack, onDone, polished = false }) {
  const [unit, setUnit] = useState('hour')
  const hourRef = useRef(null)
  useEffect(() => { hourRef.current?.focus() }, [])
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
      <div className="flex items-center justify-center gap-2 text-v-text">
        <button ref={hourRef} type="button" className="v-clock-value" aria-label="Select hour" aria-pressed={unit === 'hour'} onClick={() => setUnit('hour')}>
          {String(displayHour).padStart(2, '0')}
        </button>
        <span>:</span>
        <label>
          <span className="sr-only">Minute</span>
          <input type="number" min={0} max={59} value={String(minute).padStart(2, '0')} className="v-clock-value v-clock-minute"
            onFocus={() => setUnit('minute')} onChange={(event) => onMinuteChange(event.target.value)} />
        </label>
        {polished ? <span className="text-base font-medium">{hour >= 12 ? 'PM' : 'AM'}</span> : periodSelector}
      </div>
      <p className="text-center text-xs text-v-text-subtle" aria-live="polite">{unit === 'hour' ? 'Select an hour' : 'Select a minute'}</p>
      <div className="v-clock-face" role="group" aria-label={unit === 'hour' ? 'Hour clock' : 'Minute clock'}
        onPointerDown={(event) => {
          if (event.target.closest('button')) return
          const rect = event.currentTarget.getBoundingClientRect()
          const degrees = (Math.atan2(event.clientX - rect.left - rect.width / 2, -(event.clientY - rect.top - rect.height / 2)) * 180 / Math.PI + 360) % 360
          choose(unit === 'hour' ? Math.round(degrees / 30) % 12 || 12 : Math.round(degrees / 6) % 60)
        }}>
        <svg viewBox="0 0 220 220" className="v-clock-hand" aria-hidden="true">
          <line x1="110" y1="110" x2={110 + Math.sin(angle) * 82} y2={110 - Math.cos(angle) * 82} />
          <circle cx="110" cy="110" r="4" />
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
