import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { adminService } from '@/services/admin.service'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import FormAlert from '@/components/ui/FormAlert'
import { INPUT_CLASS } from '@/utils/uiClasses'
import { useToast } from '@/hooks/useToast'
import { getErrorMessage } from '@/utils/getErrorMessage'

export default function EditStudentModal({ student, onClose, onSaved }) {
  const [form, setForm] = useState({
    firstName: student.firstName || '',
    lastName: student.lastName || '',
    schoolId: student.schoolId || '',
    program: student.program || '',
    yearSection: student.yearSection || '',
  })
  const [taxonomy, setTaxonomy] = useState({ programs: [], sections: [] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const { success, error: toastError } = useToast()

  useEffect(() => {
    adminService.getParticipantTaxonomy()
      .then(({ data }) => {
        setTaxonomy({
          programs: data.taxonomy?.programs || [],
          sections: data.taxonomy?.sections || [],
        })
      })
      .catch(() => {})
  }, [])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      // Update both voter and respondent records if they exist
      const promises = []
      
      if (student.hasVoterType) {
        promises.push(adminService.updateVoter(student.id, form))
      }
      if (student.hasRespondentType) {
        promises.push(adminService.updateRespondent(student.id, form))
      }

      await Promise.all(promises)
      
      success('Student information updated')
      onSaved()
      
    } catch (err) {
      const details = err.response?.data?.details?.errors
      const message = details?.length ? details.join('; ') : getErrorMessage(err, 'Failed to update student')
      setError(message)
      toastError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Edit Student Information" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <fieldset className="space-y-3">
          <legend className="v-section-title">Account Details</legend>
          
          <div>
            <label className="v-label">Email</label>
            <input
              type="email"
              value={student.email}
              className={INPUT_CLASS}
              disabled
            />
            <p className="v-caption mt-1">Email cannot be changed here.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-student-first" className="v-label">First Name *</label>
              <input
                id="edit-student-first"
                type="text"
                value={form.firstName}
                onChange={set('firstName')}
                className={INPUT_CLASS}
                required
              />
            </div>
            <div>
              <label htmlFor="edit-student-last" className="v-label">Last Name *</label>
              <input
                id="edit-student-last"
                type="text"
                value={form.lastName}
                onChange={set('lastName')}
                className={INPUT_CLASS}
                required
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-3 border-t border-v-border pt-4">
          <legend className="v-section-title">Student Information</legend>
          
          <div>
            <label htmlFor="edit-student-id" className="v-label">School ID *</label>
            <input
              id="edit-student-id"
              type="text"
              value={form.schoolId}
              onChange={set('schoolId')}
              className={INPUT_CLASS}
              required
              placeholder="2024-12345"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-student-program" className="v-label">Program *</label>
              <select
                id="edit-student-program"
                value={form.program}
                onChange={set('program')}
                className={INPUT_CLASS}
                required
              >
                <option value="">Select program</option>
                {taxonomy.programs.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="edit-student-section" className="v-label">Year & Section *</label>
              <select
                id="edit-student-section"
                value={form.yearSection}
                onChange={set('yearSection')}
                className={INPUT_CLASS}
                required
              >
                <option value="">Select year & section</option>
                {taxonomy.sections.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        {(taxonomy.programs.length === 0 || taxonomy.sections.length === 0) && (
          <FormAlert variant="warning">
            Define Programs and Year & Sections in System Settings.{' '}
            <Link to="/admin/settings" onClick={onClose} className="font-medium text-v-primary hover:underline">
              Open System Settings
            </Link>
          </FormAlert>
        )}

        {error && <FormAlert variant="error">{error}</FormAlert>}

        <div className="flex justify-end gap-2 border-t border-v-border pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            loading={saving}
            disabled={!taxonomy.programs.length || !taxonomy.sections.length}
          >
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  )
}
