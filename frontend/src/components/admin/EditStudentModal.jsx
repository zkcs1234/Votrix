import { useState, useEffect, useMemo } from 'react'
import { adminService } from '@/services/admin.service'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import FormAlert from '@/components/ui/FormAlert'
import FormField from '@/components/ui/FormField'
import { INPUT_CLASS } from '@/utils/uiClasses'
import { useToast } from '@/hooks/useToast'
import { useLiveForm } from '@/hooks/useLiveForm'
import { buildEditStudentSchema, STUDENT_SERVER_FIELDS } from '@/schemas/people.schemas'

export default function EditStudentModal({ student, onClose, onSaved }) {
  const [programs, setPrograms] = useState([])
  const { success, error: toastError } = useToast()

  useEffect(() => {
    adminService.getPrograms()
      .then(({ data }) => setPrograms(data.programs || []))
      .catch(() => {})
  }, [])

  const schema = useMemo(() => buildEditStudentSchema(programs), [programs])
  const {
    register,
    handleSubmit,
    trigger,
    getValues,
    formState: { errors, isSubmitting },
    formError,
    clearFormError,
    handleServerError,
    blockedReason,
    canSubmit,
  } = useLiveForm({
    schema,
    defaultValues: {
      firstName: student.firstName || '',
      lastName: student.lastName || '',
      schoolId: student.schoolId || '',
      program: student.program || '',
    },
    serverFieldMap: STUDENT_SERVER_FIELDS,
  })

  // A student's saved program may have been retired from the list since. The
  // server rejects it, so flag it as soon as the list loads instead of on save.
  useEffect(() => {
    if (programs.length && getValues('program')) trigger('program')
  }, [programs, getValues, trigger])

  const onSubmit = async (values) => {
    clearFormError()
    try {
      // Update both voter and respondent records if they exist
      const promises = []

      if (student.hasVoterType) {
        promises.push(adminService.updateVoter(student.id, values))
      }
      if (student.hasRespondentType) {
        promises.push(adminService.updateRespondent(student.id, values))
      }

      await Promise.all(promises)

      success('Student information updated')
      onSaved()
    } catch (err) {
      const message = handleServerError(err, 'Failed to update student')
      if (message) toastError(message)
    }
  }

  const noPrograms = programs.length === 0

  return (
    <Modal open onClose={onClose} title="Edit Student Information" size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <fieldset className="space-y-3">
          <legend className="v-section-title">Account Details</legend>

          <FormField label="Email" hint="Email cannot be changed here.">
            {(field) => (
              <input type="email" {...field} className={INPUT_CLASS} value={student.email} disabled readOnly />
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

          <FormField label="School ID" required error={errors.schoolId?.message}>
            {(field) => (
              <input type="text" placeholder="2024-12345" autoComplete="off" {...field} {...register('schoolId')} />
            )}
          </FormField>

          <FormField label="Program" required error={errors.program?.message}>
            {(field) => (
              <select {...field} {...register('program')}>
                <option value="">Select program</option>
                {/* Keep a student's current program visible even if it was later retired from the list. */}
                {student.program && !programs.includes(student.program) && (
                  <option value={student.program}>{student.program}</option>
                )}
                {programs.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            )}
          </FormField>
        </fieldset>

        {noPrograms && (
          <FormAlert variant="warning">
            No programs are available yet.
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
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  )
}
