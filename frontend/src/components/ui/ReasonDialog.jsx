import { useCallback, useState } from 'react'
import Button from '@/components/ui/Button'
import FormField from '@/components/ui/FormField'
import Modal from '@/components/ui/Modal'

/**
 * A dialog that asks for a written reason, replacing `window.prompt`. A browser
 * prompt can't explain what is wrong with what was typed, can't show a counter,
 * and is a blocking dialog that cannot be styled or tested. This one validates as
 * the user types (required / minimum / maximum length) and keeps Confirm disabled,
 * with the reason shown, until the text is acceptable.
 */
export default function ReasonDialog({
  title,
  description,
  label = 'Reason',
  placeholder,
  confirmLabel = 'Confirm',
  minLength = 1,
  maxLength = 1000,
  onSubmit,
  onCancel,
}) {
  const [text, setText] = useState('')
  const [touched, setTouched] = useState(false)
  const trimmed = text.trim()
  const problem =
    trimmed.length < minLength
      ? minLength <= 1
        ? `${label} is required.`
        : `${label} must be at least ${minLength} characters.`
      : trimmed.length > maxLength
        ? `${label} must be ${maxLength} characters or fewer.`
        : ''
  const formId = 'reason-dialog-form'

  return (
    <Modal
      open
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {problem && !touched && <p className="v-caption mr-auto">Enter a reason to continue.</p>}
          <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button type="submit" form={formId} disabled={Boolean(problem)}>{confirmLabel}</Button>
        </div>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (problem) {
            setTouched(true)
            return
          }
          onSubmit(trimmed)
        }}
      >
        {description && <p className="mb-3 text-sm text-v-text-muted">{description}</p>}
        <FormField
          label={label}
          required
          error={touched ? problem : undefined}
          counter={{ value: text, max: maxLength }}
        >
          {(field) => (
            <textarea
              {...field}
              rows={3}
              autoFocus
              placeholder={placeholder}
              value={text}
              // Not marked on blur: the dialog moves focus when it opens, which would
              // flag "required" before the user has typed anything.
              onChange={(event) => {
                setText(event.target.value)
                setTouched(true)
              }}
            />
          )}
        </FormField>
      </form>
    </Modal>
  )
}

/**
 * `const { ask, dialog } = useReasonDialog()`; render `{dialog}` somewhere in the
 * component and `const reason = await ask({ title, ... })` where `window.prompt`
 * was used. `ask` resolves to the trimmed reason, or null if cancelled.
 */
export function useReasonDialog() {
  const [request, setRequest] = useState(null)
  const ask = useCallback((options) => new Promise((resolve) => setRequest({ ...options, resolve })), [])
  const finish = (value) => {
    request?.resolve(value)
    setRequest(null)
  }
  const dialog = request ? (
    <ReasonDialog {...request} onSubmit={(reason) => finish(reason)} onCancel={() => finish(null)} />
  ) : null
  return { ask, dialog }
}
