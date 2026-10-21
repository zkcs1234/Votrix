import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { adminService } from '@/services/admin.service'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import FormAlert from '@/components/ui/FormAlert'
import { INPUT_CLASS } from '@/utils/uiClasses'
import { useToast } from '@/hooks/useToast'
import { getErrorMessage } from '@/utils/getErrorMessage'
import { getEmailOutcomeMessage } from '@/utils/emailOutcome'

export default function AddStudentModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    schoolId: '',
    program: '',
    yearSection: '',
  })
  const [taxonomy, setTaxonomy] = useState({ programs: [], sections: [] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const { success, warning, error: toastError } = useToast()

  useEffect(() => {
    // Fetch taxonomy for dropdowns
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
      // STEP 1: Create as Voter (this creates the user account)
      const voterRes = await adminService.createVoter(form)
      const userId = voterRes.data.user?.id

      if (!userId) {
        throw new Error('Failed to get user ID from voter creation')
      }

      // STEP 2: Automatically add Respondent type
      try {
        await adminService.addRespondentMembership(userId)
      } catch (membershipErr) {
        // If membership already exists (409), that's okay
        if (membershipErr.response?.status !== 409) {
          console.warn('Could not add respondent type:', membershipErr)
          warning('Student created as Voter only. You can add Respondent type later.')
        }
      }

      success('Student added successfully (Voter + Respondent)')
      
      // Show email notification if needed
      if (!voterRes.data.email?.sent) {
        warning(getEmailOutcomeMessage(voterRes.data.email))
      }

      onSaved()
      
    } catch (err) {
      const details = err.response?.data?.details?.errors
      const message = details?.length ? details.join('; ') : getErrorMessage(err, 'Failed to create student')
      setError(message)
      toastError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Add Student" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormAlert variant="info">
          <p className="text-sm font-medium">Students are automatically registered for:</p>
          <ul className="mt-2 ml-4 list-disc space-y-1 text-sm">
            <li>Election voting (can vote in all elections)</li>
            <li>Poll responding (can respond to all polls)</li>
          </ul>
        </FormAlert>

        <fieldset className="space-y-3">
          <legend className="v-section-title">Account Details</legend>
          <p className="v-caption">Login email and personal information</p>
          
          <div>
            <label htmlFor="student-email" className="v-label">Email *</label>
            <input
              id="student-email"
              type="email"
              value={form.email}
              onChange={set('email')}
              className={INPUT_CLASS}
              required
              placeholder="student@example.com"
              autoFocus
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="student-first" className="v-label">First Name *</label>
              <input
                id="student-first"
                type="text"
                value={form.firstName}
                onChange={set('firstName')}
                className={INPUT_CLASS}
                required
              />
            </div>
            <div>
              <label htmlFor="student-last" className="v-label">Last Name *</label>
              <input
                id="student-last"
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
          <p className="v-caption">Academic placement and school identification</p>
          
          <div>
            <label htmlFor="student-id" className="v-label">School ID *</label>
            <input
              id="student-id"
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
              <label htmlFor="student-program" className="v-label">Program *</label>
              <select
                id="student-program"
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
              <label htmlFor="student-section" className="v-label">Year & Section *</label>
              <select
                id="student-section"
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
            Define Programs and Year & Sections in System Settings before adding students.{' '}
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
            Add Student
          </Button>
        </div>
      </form>
    </Modal>
  )
}
