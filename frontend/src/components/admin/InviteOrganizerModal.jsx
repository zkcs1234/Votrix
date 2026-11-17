import { useEffect, useMemo, useRef, useState } from 'react'
import FormAlert from '@/components/ui/FormAlert'
import FormField from '@/components/ui/FormField'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import InvitationLinkResult from '@/components/admin/InvitationLinkResult'
import { adminService } from '@/services/admin.service'
import { useToast } from '@/hooks/useToast'
import { useLiveForm } from '@/hooks/useLiveForm'
import { invitationSchema } from '@/schemas/people.schemas'
import { FORM_LIMITS } from '../../../../shared/form-rules.js'

const EXPIRY_OPTIONS = [1, 3, 7, 14, 30]
const FALLBACK_EXPIRY_DAYS = 7
const NOTE_MAX = FORM_LIMITS.invitationNote
const SERVER_FIELDS = { email: ['email'], expiresInDays: ['expiry'], note: ['note'] }

// Admin invitation form. Deliberately collects only what the admin knows: the
// invitee's email, how long the link lives, and an optional note. The organizer
// name, position, organization and access scope are entered by the applicant
// and confirmed by the admin at review time.
export default function InviteOrganizerModal({ isOpen, onClose, onSuccess }) {
  const [defaultDays, setDefaultDays] = useState(FALLBACK_EXPIRY_DAYS)
  // Once the admin picks a length themselves, a late-arriving default must not overwrite it.
  const touchedExpiry = useRef(false)
  const [result, setResult] = useState(null)
  const { success } = useToast()

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    formError,
    setFormError,
    handleServerError,
    blockedReason,
    canSubmit,
  } = useLiveForm({
    schema: invitationSchema,
    defaultValues: { email: '', expiresInDays: FALLBACK_EXPIRY_DAYS, note: '' },
    serverFieldMap: SERVER_FIELDS,
  })

  useEffect(() => {
    if (!isOpen) return
    setDefaultDays(FALLBACK_EXPIRY_DAYS)
    touchedExpiry.current = false
    reset({ email: '', expiresInDays: FALLBACK_EXPIRY_DAYS, note: '' })
    setFormError(null)
    setResult(null)

    // The default length is an admin setting (System settings → Default invitation expiry).
    let cancelled = false
    adminService
      .getSystemSettings()
      .then(({ data }) => {
        const days = Number(data?.effective?.invitationExpiryDays)
        if (cancelled || !Number.isInteger(days) || days < 1) return
        setDefaultDays(days)
      })
      .catch(() => {}) // keep 7; the server applies the real default when none is sent
    return () => {
      cancelled = true
    }
  }, [isOpen, reset, setFormError])

  // Apply the configured default once its <option> exists, unless the admin already chose.
  useEffect(() => {
    if (!touchedExpiry.current) setValue('expiresInDays', defaultDays)
  }, [defaultDays, setValue])

  // The usual choices, plus the configured default when it is not one of them.
  const expiryOptions = useMemo(
    () => [...new Set([...EXPIRY_OPTIONS, defaultDays])].sort((a, b) => a - b),
    [defaultDays],
  )

  const onSubmit = async (values) => {
    setFormError(null)
    try {
      const { data } = await adminService.createOrganizerInvitation({
        email: values.email,
        expiresInDays: values.expiresInDays,
        note: values.note || undefined,
      })
      success('Invitation created')
      setResult({ recipient: data.invitation.email, email: data.email, applyUrl: data.applyUrl })
      onSuccess?.()
    } catch (err) {
      // e.g. "An account with this email already exists" lands on the Email field.
      handleServerError(err, 'Could not create the invitation')
    }
  }

  return (
    <Modal open={isOpen} onClose={onClose} title="Invite organizer" size="md">
      {result ? (
        <InvitationLinkResult {...result} onDone={onClose} />
      ) : (
        <>
          <p className="v-caption mt-1">
            The invitee receives a single-use link to submit their organizer details and certificates. You review the
            application before any account is created.
          </p>
          <form className="mt-5 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <FormField label="Email" required error={errors.email?.message}>
              {(field) => (
                <input type="email" placeholder="organizer@example.com" autoComplete="off" {...field} {...register('email')} />
              )}
            </FormField>
            <FormField label="Link expires after" error={errors.expiresInDays?.message}>
              {(field) => (
                <select
                  {...field}
                  {...register('expiresInDays', {
                    onChange: () => {
                      touchedExpiry.current = true
                    },
                  })}
                >
                  {expiryOptions.map((days) => (
                    <option key={days} value={days}>
                      {days} {days === 1 ? 'day' : 'days'}{days === defaultDays ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <FormField
              label={<>Note to the applicant <span className="text-v-text-subtle">(optional)</span></>}
              error={errors.note?.message}
              counter={{ value: watch('note'), max: NOTE_MAX }}
            >
              {(field) => (
                <textarea rows={3} placeholder="Included in the invitation email" {...field} {...register('note')} />
              )}
            </FormField>

            {formError && <FormAlert variant="error">{formError}</FormAlert>}

            <div className="flex items-center justify-end gap-3 border-t border-v-border pt-4">
              {blockedReason && <p className="v-caption mr-auto" role="status">{blockedReason}</p>}
              <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
              <Button type="submit" loading={isSubmitting} disabled={!canSubmit}>Send invitation</Button>
            </div>
          </form>
        </>
      )}
    </Modal>
  )
}
