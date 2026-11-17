import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, FileText, Upload, X } from 'lucide-react'
import AccessScopeFields, { scopeIsIncomplete } from '@/components/shared/AccessScopeFields'
import Button from '@/components/ui/Button'
import FormAlert from '@/components/ui/FormAlert'
import { organizerApplyService } from '@/services/organizer-apply.service'
import {
  CERTIFICATE_ACCEPT,
  CERTIFICATE_MAX_BYTES,
  CERTIFICATE_MAX_FILES,
  addCertificateFiles,
  formatFileSize,
} from '@/utils/certificateFiles'
import { INPUT_CLASS } from '@/utils/uiClasses'
import { getErrorMessage } from '@/utils/getErrorMessage'
import { FORM_LIMITS } from '../../../../shared/form-rules.js'

const EMPTY_FORM = {
  organizerName: '',
  position: '',
  organizationName: '',
  organizationType: '',
  scope: { scopeType: '', programs: [] },
}

// Public, unauthenticated page opened from an organizer invitation link. The
// token in the URL is the only credential; the invited email is shown but cannot
// be changed.
export default function OrganizerApplyPage() {
  const { token } = useParams()
  const [phase, setPhase] = useState('loading') // loading | invalid | error | form | done
  const [context, setContext] = useState(null)
  const [message, setMessage] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [files, setFiles] = useState([])
  const [fileErrors, setFileErrors] = useState([])
  // Errors the server sent back for a submission.
  const [errors, setErrors] = useState([])
  const [submitting, setSubmitting] = useState(false)
  // Fields the applicant has left at least once; their inline message shows from
  // then on, live. `attempted` (the applicant pressed Submit) shows the summary.
  const [touched, setTouched] = useState({})
  const [attempted, setAttempted] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setPhase('loading')
    organizerApplyService
      .getForm(token)
      .then(({ data }) => {
        if (cancelled) return
        setContext(data)
        setPhase('form')
      })
      .catch((err) => {
        if (cancelled) return
        if (err.response?.status === 410) {
          setMessage(err.response.data?.message || 'This invitation link is invalid or is no longer available.')
          setPhase('invalid')
        } else {
          setMessage(getErrorMessage(err, 'Could not load the application form.'))
          setPhase('error')
        }
      })
    return () => { cancelled = true }
  }, [token])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const pickFiles = (e) => {
    const result = addCertificateFiles(files, Array.from(e.target.files ?? []))
    setFiles(result.files)
    setFileErrors(result.errors)
    e.target.value = ''
  }

  const removeFile = (index) => {
    setFiles((current) => current.filter((_, i) => i !== index))
    setFileErrors([])
  }

  // Per-field messages for the inline display (text fields also enforce the
  // server's 255-character limit).
  const textError = (value, label, tooLong) => {
    if (!value.trim()) return `${label} is required`
    if (value.trim().length > FORM_LIMITS.text) return `${tooLong} must be ${FORM_LIMITS.text} characters or fewer`
    return null
  }
  const fieldErrors = {
    organizerName: textError(form.organizerName, 'Your name', 'Your name'),
    position: textError(form.position, 'Position', 'Position'),
    organizationName: textError(form.organizationName, 'Organization name', 'Organization name'),
    organizationType: form.organizationType ? null : 'Choose the organization type',
  }
  const touch = (key) => () => setTouched((t) => (t[key] ? t : { ...t, [key]: true }))
  const shown = (key) => (touched[key] || attempted ? fieldErrors[key] : null)
  const fieldProps = (key, id) => ({
    className: `${INPUT_CLASS}${shown(key) ? ' v-input-error' : ''}`,
    'aria-invalid': shown(key) ? true : undefined,
    'aria-describedby': shown(key) ? `${id}-error` : undefined,
    onBlur: touch(key),
  })
  const fieldError = (key, id) =>
    shown(key) ? <p id={`${id}-error`} role="alert" className="v-error-text">{shown(key)}</p> : null

  // The summary list. It is the same set of problems as the inline messages (plus
  // scope and certificates), and once shown it updates as the applicant fixes them.
  const validate = () => {
    const problems = []
    if (fieldErrors.organizerName) problems.push(form.organizerName.trim() ? fieldErrors.organizerName : 'Enter your name.')
    if (fieldErrors.position) problems.push(form.position.trim() ? fieldErrors.position : 'Enter your position.')
    if (fieldErrors.organizationName) problems.push(form.organizationName.trim() ? fieldErrors.organizationName : 'Enter the organization name.')
    if (!form.organizationType) problems.push('Choose the organization type.')
    if (!form.scope.scopeType) problems.push('Choose the student access you need.')
    else if (scopeIsIncomplete(form.scope)) problems.push('Select at least one program.')
    if (files.length === 0) problems.push('Attach at least one certificate.')
    return problems
  }
  const summary = errors.length ? errors : attempted ? validate() : []

  const onSubmit = async (e) => {
    e.preventDefault()
    setAttempted(true)
    const problems = validate()
    setErrors([])
    if (problems.length) return

    const body = new FormData()
    body.append('organizerName', form.organizerName.trim())
    body.append('position', form.position.trim())
    body.append('organizationName', form.organizationName.trim())
    body.append('organizationType', form.organizationType)
    body.append('scopeType', form.scope.scopeType)
    body.append('programs', JSON.stringify(form.scope.programs))
    files.forEach((file) => body.append('certificates', file))

    setSubmitting(true)
    try {
      await organizerApplyService.submit(token, body)
      setPhase('done')
    } catch (err) {
      if (err.response?.status === 410) {
        setMessage(err.response.data?.message || 'This invitation link is invalid or is no longer available.')
        setPhase('invalid')
        return
      }
      const details = err.response?.data?.details?.errors
      setErrors(details?.length ? details : [getErrorMessage(err, 'Could not submit your application.')])
    } finally {
      setSubmitting(false)
    }
  }

  if (phase === 'loading') return <p className="text-center text-sm text-v-text-subtle">Checking your invitation…</p>

  if (phase === 'invalid' || phase === 'error') {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-xl font-semibold text-v-text">
          {phase === 'invalid' ? 'This link can’t be used' : 'Something went wrong'}
        </h2>
        <p className="text-sm text-v-text-subtle">{message}</p>
        {phase === 'invalid' && (
          <p className="text-sm text-v-text-subtle">
            Invitation links work once and expire. Ask the administrator who invited you to send a new one.
          </p>
        )}
        <Link to="/login" className="inline-block text-sm font-medium text-v-text-muted hover:text-v-text">Go to login</Link>
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="space-y-3 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-v-success" strokeWidth={1.5} aria-hidden />
        <h2 className="text-xl font-semibold text-v-text">Application submitted</h2>
        <p className="text-sm text-v-text-subtle">
          Your application is under review. We&apos;ll email <span className="font-medium text-v-text">{context.email}</span> once
          an administrator has made a decision.
        </p>
        <Link to="/login" className="inline-block text-sm font-medium text-v-text-muted hover:text-v-text">Go to login</Link>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-v-text">Organizer application</h2>
      <p className="mt-2 text-sm text-v-text-subtle">
        Tell us about yourself and your organization. An administrator reviews every application before an account is created.
      </p>
      {context.note && (
        <p className="mt-3 rounded-lg border-l-4 border-v-primary bg-v-surface-elevated p-3 text-sm text-v-text">{context.note}</p>
      )}

      <form className="mt-6 space-y-5" onSubmit={onSubmit} noValidate>
        <div>
          <label htmlFor="apply-email" className="v-label">Email</label>
          <input id="apply-email" type="email" value={context.email} readOnly className={`${INPUT_CLASS} cursor-not-allowed opacity-70`} />
          <p className="v-caption mt-1">This is the address your invitation was sent to.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="apply-name" className="v-label">Your name</label>
            <input id="apply-name" value={form.organizerName} onChange={set('organizerName')} autoComplete="name" aria-required="true" {...fieldProps('organizerName', 'apply-name')} />
            {fieldError('organizerName', 'apply-name')}
          </div>
          <div>
            <label htmlFor="apply-position" className="v-label">Position</label>
            <input id="apply-position" value={form.position} onChange={set('position')} placeholder="e.g. SSG Adviser" aria-required="true" {...fieldProps('position', 'apply-position')} />
            {fieldError('position', 'apply-position')}
          </div>
          <div>
            <label htmlFor="apply-org" className="v-label">Organization name</label>
            <input id="apply-org" value={form.organizationName} onChange={set('organizationName')} aria-required="true" {...fieldProps('organizationName', 'apply-org')} />
            {fieldError('organizationName', 'apply-org')}
          </div>
          <div>
            <label htmlFor="apply-type" className="v-label">Organization type</label>
            <select id="apply-type" value={form.organizationType} onChange={set('organizationType')} aria-required="true" {...fieldProps('organizationType', 'apply-type')}>
              <option value="">Select a type…</option>
              {(context.organizationTypes ?? []).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {fieldError('organizationType', 'apply-type')}
          </div>
        </div>

        <div className="border-t border-v-border pt-4">
          <AccessScopeFields
            value={form.scope}
            onChange={(scope) => setForm((f) => ({ ...f, scope }))}
            programs={context.programs}
            legend="Student access you need"
            help="An administrator confirms or adjusts this when reviewing your application."
          />
        </div>

        <div className="border-t border-v-border pt-4">
          <p className="v-label">Certificates</p>
          <p className="v-caption mt-1">
            Attach up to {CERTIFICATE_MAX_FILES} files (PDF, JPEG or PNG, {CERTIFICATE_MAX_BYTES / (1024 * 1024)} MB each).
          </p>
          <input ref={fileRef} type="file" multiple accept={CERTIFICATE_ACCEPT} className="hidden" onChange={pickFiles} aria-label="Certificate files" />
          <Button type="button" variant="secondary" className="mt-2" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" strokeWidth={1.5} />
            Choose files
          </Button>

          {files.length > 0 && (
            <ul className="mt-3 space-y-2">
              {files.map((file, i) => (
                <li key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 rounded-lg border border-v-border px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-v-text">
                    <FileText className="h-4 w-4 shrink-0 text-v-text-subtle" strokeWidth={1.5} aria-hidden />
                    <span className="truncate">{file.name}</span>
                    <span className="v-caption shrink-0">{formatFileSize(file.size)}</span>
                  </span>
                  <button type="button" onClick={() => removeFile(i)} className="shrink-0 text-v-text-muted hover:text-v-danger" aria-label={`Remove ${file.name}`}>
                    <X className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {fileErrors.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-sm text-v-danger">
              {fileErrors.map((m) => <li key={m}>{m}</li>)}
            </ul>
          )}
        </div>

        {summary.length > 0 && (
          <FormAlert variant="error" title="Please fix the following">
            <ul className="list-inside list-disc">
              {summary.map((m) => <li key={m}>{m}</li>)}
            </ul>
          </FormAlert>
        )}

        <Button type="submit" loading={submitting} className="w-full">Submit application</Button>
      </form>
    </div>
  )
}
