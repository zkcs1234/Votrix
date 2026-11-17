import { useId } from 'react'
import { INPUT_CLASS } from '@/utils/uiClasses'

/**
 * Label + control + live validation message, wired for accessibility.
 *
 * Pass a render function as the child to receive the props the control needs
 * (`id`, `className`, `aria-invalid`, `aria-describedby`):
 *
 *   <FormField label="Email" required error={errors.email?.message}>
 *     {(p) => <input type="email" {...p} {...register('email')} />}
 *   </FormField>
 *
 * Plain children are also accepted (label/error only, no prop wiring) for
 * composite controls such as radio groups.
 *
 * `error` replaces `hint` while present. `counter` ({ value, max }) shows a
 * character count once the user is near (>= 80%) or over the limit.
 */
export default function FormField({
  label,
  id,
  error,
  hint,
  required = false,
  counter,
  className = '',
  children,
}) {
  const autoId = useId()
  const fieldId = id ?? `field-${autoId}`
  const messageId = `${fieldId}-message`
  const hasError = Boolean(error)
  const showMessage = hasError || Boolean(hint)

  const controlProps = {
    id: fieldId,
    className: `${INPUT_CLASS}${hasError ? ' v-input-error' : ''}`,
    'aria-invalid': hasError || undefined,
    'aria-describedby': showMessage ? messageId : undefined,
    'aria-required': required || undefined,
  }

  const length = counter ? String(counter.value ?? '').length : 0
  const showCounter = counter && counter.max > 0 && length >= counter.max * 0.8

  return (
    <div className={className}>
      {label && (
        <label htmlFor={fieldId} className="v-label">
          {label}
          {required && (
            <span className="ml-0.5 text-v-danger" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {typeof children === 'function' ? children(controlProps) : children}
      {(showMessage || showCounter) && (
        <div className="mt-1 flex items-start justify-between gap-3">
          {showMessage ? (
            hasError ? (
              <p id={messageId} role="alert" className="v-error-text !mt-0">
                {error}
              </p>
            ) : (
              <p id={messageId} className="v-caption">
                {hint}
              </p>
            )
          ) : (
            <span />
          )}
          {showCounter && (
            <span
              className={`shrink-0 text-xs ${length > counter.max ? 'text-v-danger' : 'text-v-text-subtle'}`}
              aria-live="polite"
            >
              {length}/{counter.max}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
