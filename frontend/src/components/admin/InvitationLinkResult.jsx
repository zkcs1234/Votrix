import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import Button from '@/components/ui/Button'
import FormAlert from '@/components/ui/FormAlert'
import { INPUT_CLASS } from '@/utils/uiClasses'

function emailMessage(email) {
  if (email?.sent) return { variant: 'success', text: 'The invitation email was sent.' }
  if (email?.skipped) return { variant: 'warning', text: `Email was not sent: ${email.reason || 'blocked by the email safety rules.'} Share the link below instead.` }
  if (email?.error) return { variant: 'warning', text: `Email failed: ${email.error}. Share the link below instead.` }
  return { variant: 'warning', text: 'Email status is unavailable. Share the link below instead.' }
}

// Shown once after an invitation is created or resent. The link is not
// recoverable afterwards (only its hash is stored), so make it easy to copy.
export default function InvitationLinkResult({ email, applyUrl, recipient, onDone }) {
  const [copied, setCopied] = useState(false)
  const outcome = emailMessage(email)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(applyUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked; select the field so the admin can copy manually.
      document.getElementById('organizer-invite-link')?.select()
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-v-text">
        Invitation created for <span className="font-medium">{recipient}</span>.
      </p>
      <FormAlert variant={outcome.variant}>{outcome.text}</FormAlert>
      <div>
        <label htmlFor="organizer-invite-link" className="v-label">Application link</label>
        <div className="mt-1 flex gap-2">
          <input id="organizer-invite-link" readOnly value={applyUrl} className={INPUT_CLASS} onFocus={(e) => e.target.select()} />
          <Button type="button" variant="secondary" onClick={copy} aria-label="Copy application link">
            {copied ? <Check className="h-4 w-4" strokeWidth={2} /> : <Copy className="h-4 w-4" strokeWidth={1.5} />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p className="v-caption mt-1">This link works once and cannot be shown again after you close this window.</p>
      </div>
      <div className="flex justify-end border-t border-v-border pt-4">
        <Button type="button" onClick={onDone}>Done</Button>
      </div>
    </div>
  )
}
