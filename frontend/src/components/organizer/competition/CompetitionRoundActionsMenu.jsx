import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import Button from '@/components/ui/Button'

export default function CompetitionRoundActionsMenu({ round, disabled, canReorder, onEdit, onReorder, onDelete }) {
  const triggerRef = useRef(null)
  const wrapperRef = useRef(null)
  const menuRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [flip, setFlip] = useState(false)
  useLayoutEffect(() => {
    if (!open) return
    const anchor = triggerRef.current.getBoundingClientRect()
    setFlip(window.innerHeight - anchor.bottom < menuRef.current.offsetHeight + 16)
  }, [open])
  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector('button:not(:disabled)')?.focus({ preventScroll: true })
    const outside = event => { if (!wrapperRef.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  const close = () => { setOpen(false); triggerRef.current?.focus({ preventScroll: true }) }
  const act = callback => { close(); callback(triggerRef.current) }
  const keyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
    if (event.key === 'Tab') { setOpen(false); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const items = [...menuRef.current.querySelectorAll('button:not(:disabled)')]
    const index = items.indexOf(document.activeElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }
  return <div ref={wrapperRef} className="relative">
    <Button ref={triggerRef} variant="secondary" size="sm" className="h-10 w-10 !p-0" disabled={disabled}
      aria-label={`More actions for ${round.name}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? `round-actions-${round.id}` : undefined}
      onClick={() => setOpen(current => !current)} onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) }
      }}><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></Button>
    {open && <div ref={menuRef} id={`round-actions-${round.id}`} role="menu" aria-label={`${round.name} actions`} onKeyDown={keyDown}
      className={`absolute right-0 z-30 w-40 rounded-lg border border-v-border bg-v-surface p-1 shadow-v-shadow-lg ${flip ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}>
      <button type="button" role="menuitem" className="block min-h-10 w-full rounded px-3 py-2 text-left text-sm text-v-text hover:bg-v-surface-elevated focus-visible:outline-v-primary" onClick={() => act(onEdit)}>Edit</button>
      <button type="button" role="menuitem" disabled={!canReorder} className="block min-h-10 w-full rounded px-3 py-2 text-left text-sm text-v-text hover:bg-v-surface-elevated disabled:opacity-40 focus-visible:outline-v-primary" onClick={() => act(onReorder)}>Reorder</button>
      <button type="button" role="menuitem" className="block min-h-10 w-full rounded px-3 py-2 text-left text-sm text-v-danger hover:bg-v-danger-bg focus-visible:outline-v-primary" onClick={() => act(onDelete)}>Delete</button>
    </div>}
  </div>
}
