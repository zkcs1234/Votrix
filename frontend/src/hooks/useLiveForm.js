import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { applyServerErrors } from '@/utils/serverFormErrors'

/**
 * The react-hook-form modes behind live validation, for forms that need to call
 * `useForm` themselves (multi-step wizards with their own submit flow).
 */
export const LIVE_FORM_MODE = Object.freeze({ mode: 'onTouched', reValidateMode: 'onChange' })

/**
 * react-hook-form preconfigured for live validation.
 *
 *  - `mode: 'onTouched'`: a field is validated the first time the user leaves
 *    it, and on every keystroke after that. Nothing turns red while the user is
 *    still typing their first character, and nothing waits for the submit click.
 *  - `reValidateMode: 'onChange'`: once an error is showing, it clears the
 *    moment the value becomes valid.
 *  - `isValid` is kept current so the submit button can reflect the form state
 *    (pair it with `blockedReason` so a disabled button always explains itself).
 *
 * Server rejections: call `handleServerError(err)` in the catch block. Messages
 * that match `serverFieldMap` are attached to their input; the remainder is
 * stored in `formError` for a form-level <FormAlert>.
 *
 * @param {object} options
 * @param {import('zod').ZodTypeAny} options.schema
 * @param {object} [options.defaultValues]
 * @param {Record<string, string[]>} [options.serverFieldMap] field -> keywords found in server messages
 * @param {object} [options.formOptions] extra useForm options (overrides defaults)
 */
export function useLiveForm({ schema, defaultValues, serverFieldMap = {}, formOptions = {} }) {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues,
    ...LIVE_FORM_MODE,
    ...formOptions,
  })
  const [formError, setFormError] = useState(null)
  const { setError, formState, watch } = form
  const { isSubmitting, errors } = formState

  // Validity is derived synchronously from the current values instead of using
  // react-hook-form's async `isValid`. The async flag can lag or lose a race when
  // a value is set programmatically (setValue) while another field is being
  // typed, and it does not recompute when the schema itself changes (e.g. the
  // program list finishing loading). This is cheap for forms of this size.
  const values = watch()
  const isValid = schema.safeParse(values).success

  const handleServerError = useCallback(
    (err, fallback) => {
      const message = applyServerErrors(err, { setError, fieldMap: serverFieldMap, fallback })
      setFormError(message)
      return message
    },
    // serverFieldMap is expected to be a stable module-level constant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setError],
  )

  const hasErrors = Object.keys(errors).length > 0

  // Why the submit button is disabled (null when it is enabled).
  let blockedReason = null
  if (!isSubmitting && !isValid) {
    blockedReason = hasErrors
      ? 'Fix the highlighted fields to continue.'
      : 'Fill in the required fields to continue.'
  }

  return {
    ...form,
    formError,
    setFormError,
    clearFormError: () => setFormError(null),
    handleServerError,
    blockedReason,
    canSubmit: !blockedReason,
  }
}
