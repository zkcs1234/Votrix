import { useState, useEffect, useMemo } from 'react'
import { adminService } from '@/services/admin.service'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import FormAlert from '@/components/ui/FormAlert'
import FormField from '@/components/ui/FormField'
import { useToast } from '@/hooks/useToast'
import { useLiveForm } from '@/hooks/useLiveForm'
import { buildStudentSchema, STUDENT_SERVER_FIELDS } from '@/schemas/people.schemas'
import { getEmailOutcomeMessage } from '@/utils/emailOutcome'

const DEFAULT_VALUES = { email: '', firstName: '', lastName: '', schoolId: '', program: '' }

export default function AddStudentModal({ onClose, onSaved }) {
  const [programs, setPrograms] = useState([])
  const { success, warning, error: toastError } = useToast()

  useEffect(() => {
    // Programs come from the programs table (not the participant taxonomy).
    adminService.getPrograms()
      .then(({ data }) => setPrograms(data.programs || []))
      .catch(() => {})
  }, [])

  const schema = useMemo(() => buildStudentSchema(programs), [programs])
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    formError,
    clearFormError,
    handleServerError,
    blockedReason,
    canSubmit,
  } = useLiveForm({
    schema,
    defaultValues: DEFAULT_VALUES,
    serverFieldMap: STUDENT_SERVER_FIELDS,
  })

  const onSubmit = async (values) => {
    clearFormError()
    try {
      // One request is enough: the backend creates the account with the single
      // STUDENT participant type, which already covers elections and polls.
      const { data } = await adminService.createVoter(values)

      if (data.email) {
        // A new account was created and its sign-in email was attempted.
        success('Student added')
        if (!data.email.sent) warning(getEmailOutcomeMessage(data.email))
      } else {
        // No email means the address already belonged to a participant account:
        // it was updated and is now on the student list. No new login was created.
        success('This email already had an account. It was updated and added as a student.')
      }

      onSaved()
    } catch (err) {
      // Field-specific rejections (e.g. a duplicate school ID) land on their
      // input; anything else becomes the form-level alert.
      const message = handleServerError(err, 'Failed to create student')
      if (message) toastError(message)
    }
  }

  const noPrograms = programs.length === 0

  return (
    <Modal open onClose={onClose} title="Add Student" size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <fieldset className="space-y-3">
          <legend className="v-section-title">Account Details</legend>
          <p className="v-caption">Login email and personal information</p>

          <FormField label="Email" required error={errors.email?.message}>
            {(field) => (
              <input
                type="email"
                placeholder="student@example.com"
                autoFocus
                autoComplete="off"
                {...field}
                {...register('email')}
              />
            )}
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="First Name" required error={errors.firstName?.message}>
              {(field) => <input type="text" autoComplete="off" {...field} {...register('firstName')} />}
            </FormField>
            <FormField label="Last Name" required error={errors.lastName?.message}>
              {(field) => <input type="text" autoComplete="off" {...field} {...register('lastName')} />}
            </FormField>
          </div>
        </fieldset>

        <fieldset className="space-y-3 border-t border-v-border pt-4">
          <legend className="v-section-title">Student Information</legend>
          <p className="v-caption">Program and school identification</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="School ID" required error={errors.schoolId?.message}>
              {(field) => (
                <input type="text" placeholder="2024-12345" autoComplete="off" {...field} {...register('schoolId')} />
              )}
            </FormField>
            <FormField label="Program" required error={errors.program?.message}>
              {(field) => (
                <select {...field} {...register('program')}>
                  <option value="">Select program</option>
                  {programs.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              )}
            </FormField>
          </div>
        </fieldset>

        {noPrograms && (
          <FormAlert variant="warning">
            No programs are available yet, so students cannot be added.
          </FormAlert>
        )}

        {formError && <FormAlert variant="error">{formError}</FormAlert>}

        <div className="flex items-center justify-end gap-3 border-t border-v-border pt-4">
          {blockedReason && !noPrograms && (
            <p className="v-caption mr-auto" role="status">{blockedReason}</p>
          )}
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={isSubmitting}
            disabled={noPrograms || !canSubmit}
          >
            Add Student
          </Button>
        </div>
      </form>
    </Modal>
  )
}
