import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { pageantService } from '@/services/pageant.service'
import { pageantEventSchemaStep1, isoToLocalInput, localInputToIso } from '@/schemas/event.schemas'
import ImageUploadField from '@/components/upload/ImageUploadField'
import CalendarCard from '@/components/ui/CalendarCard'
import Card from '@/components/ui/Card'
import EventStepper from '@/components/ui/EventStepper'
import StageFooter from '@/components/ui/StageFooter'
import useEventProgress from '@/hooks/useEventProgress'
import useFormSession from '@/hooks/useFormSession'
import useDraft from '@/hooks/useDraft'
import useSilentDraftAutosave from '@/hooks/useSilentDraftAutosave'
import { draftService } from '@/services/draft.service'
import UnsavedChangesDialog from '@/components/ui/UnsavedChangesDialog'
import ReadOnlyEventBanner from '@/components/organizer/ReadOnlyEventBanner'
import { isSetupLocked } from '@/utils/constants'
import Button from '@/components/ui/Button'

import { INPUT_CLASS, LABEL_CLASS, HELPER_TEXT } from '@/utils/uiClasses'

function inferStepFromPath(pathname) {
  if (pathname.includes('/branding')) return 'branding'
  return 'details'
}

function normalizeDraftStep(step) {
  if (step === 'branding') return step
  return 'details'
}

export default function CompetitionEventFormPage() {
  const { eventId } = useParams()
  const location = useLocation()
  const isNew = !eventId || eventId === 'new'
  const navigate = useNavigate()

  const [step, setStep] = useState(() => inferStepFromPath(location.pathname))
  const [banner, setBanner] = useState(null)
  const [bannerFile, setBannerFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState(null)
  const [draftRestored, setDraftRestored] = useState(false)
  // Competition type is an optional LABEL (create only) — it does not seed any
  // structure; the organizer configures Structure & Scoring themselves. Kept as
  // local state and threaded through the draft payload so it survives step
  // navigation and draft restore.
  const [templates, setTemplates] = useState([])
  const [competitionType, setCompetitionType] = useState(null)
  const [competitionTypeOther, setCompetitionTypeOther] = useState('')
  const [eventStatus, setEventStatus] = useState(null)
  const [officialRulesId, setOfficialRulesId] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const operationRef = useRef(false)
  const creationKeyRef = useRef(crypto.randomUUID())
  // A brand-new event has no status yet (null); it is always editable. Only an
  // existing event whose setup is locked (scheduled/active/…) is read-only.
  const readOnly = !isNew && (loading || loadFailed || isSetupLocked(eventStatus) || Boolean(officialRulesId))

const { completedKeys, markComplete, reset: resetProgress } = useEventProgress(
    'competition',
    eventId,
  )

const {
    register,
    control,
    getValues,
    handleSubmit: rhfHandleSubmit,
    formState: { errors, isDirty },
    reset,
    watch,
  } = useForm({
    resolver: zodResolver(pageantEventSchemaStep1),
    defaultValues: {
      title: '',
      description: '',
      startDate: '',
      endDate: '',
    },
  })

  const { saveDraft, saveDraftAsync, deleteDraft, draft, saveStatus, lastSavedAt } = useDraft('competition')

  // Session lifecycle: guarantees only one active session, and gives us a
  // stable session identity keyed by mode + eventId. With silent drafts, it
  // only blocks when there is work the background save could not protect.
  const {
    sessionKey,
    confirmLeave,
  } = useFormSession({
    module: 'competition',
    eventId,
    dirty: Boolean(bannerFile) || saveStatus === 'error',
  })

  const formValues = watch()
  const startDateValue = formValues.startDate ?? ''

  const buildDraftSnapshot = useCallback((data = getValues(), draftStep = step, currentBanner = banner) => ({
    step: draftStep,
    title: data.title,
    description: data.description,
    startDate: data.startDate,
    endDate: data.endDate,
    banner: currentBanner,
    payload: {
      ...data,
      startDate: data.startDate,
      endDate: data.endDate,
      competitionType,
      competitionTypeOther,
      idempotencyKey: creationKeyRef.current,
    },
  }), [banner, competitionType, competitionTypeOther, getValues, step])

  const markDraftTouched = useCallback(() => {
    setDraftRestored(true)
  }, [])

useEffect(() => {
    setStep(inferStepFromPath(location.pathname))
  }, [location.pathname])

  // Load the starter-template catalog for the create wizard.
  useEffect(() => {
    if (!isNew) return
    pageantService
      .getTemplates()
      .then(({ data }) => setTemplates(data.templates ?? []))
      .catch(() => setTemplates([]))
  }, [isNew])

  // Session-boundary cleanup: reset all transient form state whenever the
  // session identity changes so no stale values/errors/step/uploads leak.
  useEffect(() => {
    creationKeyRef.current = crypto.randomUUID()
    setBanner(null)
    setBannerFile(null)
    setError(null)
    setDraftRestored(false)
    setCompetitionType(null)
    setCompetitionTypeOther('')
    setOfficialRulesId(null)
    setEventStatus(null)
    setLoadFailed(false)
    reset({
      title: '',
      description: '',
      startDate: '',
      endDate: '',
    })
    resetProgress()
    // sessionKey intentionally gates re-runs; resets run on every new session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey])

  const restoreDraft = useCallback(() => {
    if (!draft) return

    const payload = draft.payload || {}
    const nextStep = normalizeDraftStep(draft.step)
    setDraftRestored(true)
    setStep(nextStep)
    reset({
      title: payload.title ?? draft.title ?? '',
      description: payload.description ?? '',
      startDate: payload.startDate ?? '',
      endDate: payload.endDate ?? '',
    })
    setBanner(draft.banner ?? null)
    setCompetitionType(payload.competitionType ?? null)
    setCompetitionTypeOther(payload.competitionTypeOther ?? '')
    if (payload.idempotencyKey) creationKeyRef.current = payload.idempotencyKey
    if (draft.banner) {
      markComplete('branding')
    }
    if (nextStep === 'branding') {
      markComplete('details')
    }
  }, [draft, reset, markComplete])

  useEffect(() => {
    if (!isNew || !draft || draftRestored || isDirty) return
    restoreDraft()
  }, [draft, draftRestored, isDirty, isNew, restoreDraft])

  useSilentDraftAutosave({
    enabled: isNew && !bannerFile && !saving,
    data: buildDraftSnapshot(formValues),
    saveDraftAsync,
    onAutosave: markDraftTouched,
  })

  useEffect(() => {
    if (isNew) return
    let alive = true
    setLoading(true)
    pageantService.getEvent(eventId)
      .then(({ data }) => {
        if (!alive) return
        setEventStatus(data.event.status ?? null)
        setOfficialRulesId(data.event.officialRulesId ?? data.event.official_rules_id ?? null)
        setLoadFailed(false)
        setError(null)
        reset({
          title: data.event.title || '',
          description: data.event.description || '',
          startDate: isoToLocalInput(data.event.startDate),
          endDate: isoToLocalInput(data.event.endDate),
        })
        setBanner(data.event.banner)
        if (data.event.banner) markComplete('branding')
        markComplete('details')
      })
      .catch((err) => {
        if (!alive) return
        setError(err.response?.data?.message || 'Failed to load event')
        setLoadFailed(true)
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [eventId, isNew, reset, markComplete, loadAttempt])

  const validateCompetitionType = () => {
    if (competitionType === '__other__' && !competitionTypeOther.trim()) {
      setError('Enter a competition type.')
      return false
    }
    return true
  }

  const handleNext = rhfHandleSubmit(async (data) => {
    if (operationRef.current || readOnly || !validateCompetitionType()) return
    operationRef.current = true
    setSaving(true)
    setError(null)
    try {
      if (isNew) {
        await saveDraft(buildDraftSnapshot(data, 'branding'))
        setDraftRestored(true)
      } else {
        const payload = {
          title: data.title,
          description: data.description,
          startDate: localInputToIso(data.startDate),
          endDate: localInputToIso(data.endDate),
        }
        await pageantService.updateEvent(eventId, payload)
      }
      markComplete('details')
      setStep('branding')
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save event details. Your entries are kept; retry when ready.')
    } finally {
      operationRef.current = false
      setSaving(false)
    }
  })

  const handleNextBranding = rhfHandleSubmit(async () => {
    if (operationRef.current || readOnly || !validateCompetitionType()) return
    operationRef.current = true
    setSaving(true)
    setError(null)

    try {
      if (isNew) {
        let currentBanner = banner
        if (bannerFile) {
          const res = await draftService.uploadBanner('competition', bannerFile)
          currentBanner = res.data.url
          setBanner(currentBanner)
          setBannerFile(null)
        }
        const data = getValues()
        setDraftRestored(true)
        await saveDraft(buildDraftSnapshot(data, 'branding', currentBanner))
        await handleContinueToContestants()
      } else {
        if (bannerFile) {
          await pageantService.uploadBanner(eventId, bannerFile)
          setBannerFile(null)
        }
        navigate(`/organizer/competition/events/${eventId}/workspace`)
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save event')
    } finally {
      operationRef.current = false
      setSaving(false)
    }
  }, () => { setStep('details'); setError('Check the event details before creating this competition.') })

  // Create the real event from the draft and continue into the setup steps
  // The returned event remains draft until Review & Publish freezes its rules.
  const handleContinueToContestants = async () => {
    const data = getValues()
    const payload = {
      title: data.title,
      description: data.description,
      startDate: localInputToIso(data.startDate),
      endDate: localInputToIso(data.endDate),
      competitionType: getCompetitionTypeValue(),
      idempotencyKey: creationKeyRef.current,
    }
    const { data: res } = await draftService.publishDraft('competition', payload)
    await deleteDraft()
    navigate(`/organizer/competition/events/${res.event.id}/workspace`, { replace: true })
  }

  const getCompetitionTypeValue = () => {
    if (competitionType !== '__other__') return competitionType
    return competitionTypeOther.trim() || null
  }

  // Save the current Create session as a draft, then continue navigation.
  const handleSaveAsDraft = async () => {
    if (isNew) {
      try {
        let currentBanner = banner
        if (bannerFile) {
          const res = await draftService.uploadBanner('competition', bannerFile)
          currentBanner = res.data.url
          setBanner(currentBanner)
          setBannerFile(null)
        }
        await saveDraft(buildDraftSnapshot(getValues(), step, currentBanner))
        setDraftRestored(true)
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to save draft')
        return
      }
    }
    confirmLeave?.proceed?.()
  }

  // Discard the draft and continue navigation.
  const handleDiscard = () => {
    deleteDraft()
    confirmLeave?.proceed?.()
  }

  // Cancel navigation: stay on the form.
  const handleCancelLeave = () => {
    confirmLeave?.reset?.()
  }

  const blocked = confirmLeave?.state === 'blocked'

  if (loading) return <p className="v-caption">Loading...</p>
  if (loadFailed) return <div role="alert" className="v-card p-5 space-y-3"><p className="v-error-text">{error}</p><Button variant="secondary" onClick={() => setLoadAttempt(value => value + 1)}>Retry loading event</Button></div>

  const stepperEventId = isNew ? 'new' : eventId

  return (
    <div className="space-y-6">
      <>
          <EventStepper
            module="competition"
            currentKey={step}
            eventId={stepperEventId}
            completedKeys={completedKeys}
            readOnly={readOnly}
            eventStatus={eventStatus}
            navigationDisabled={saving}
            onLocalStageSelect={stageKey => { if (stageKey === 'details') setStep('details'); else if (readOnly) setStep('branding'); else void handleNext() }}
          />

          {readOnly && <ReadOnlyEventBanner status={eventStatus} noun="competition" frozen={Boolean(officialRulesId)} />}

          <div className="w-full">
            <header>
              <h2 className="v-page-title mb-2">
                {isNew ? 'Create Competition Scoring Event' : readOnly ? 'View Competition Scoring Event' : 'Edit Competition Scoring Event'}
              </h2>
              <p className="v-helper-text">
                Save details and optional branding, then configure structure, contestants and judges.
                Create &amp; continue saves a draft event; Review &amp; Publish confirms the official rules later.
              </p>
            </header>
          </div>

          <div className="w-full">
            {error && <p role="alert" className="v-error-text">{error}</p>}
            <Card padding="md">
            <fieldset disabled={readOnly} className="min-w-0 border-0 p-0 m-0">
            {step === 'details' && (
          <form className="space-y-4" onSubmit={handleNext}>
            {isNew && (
              <div className="v-form-field">
                <label className={LABEL_CLASS} htmlFor="competition-template">
                  Competition type <span className="text-v-text-subtle">(optional)</span>
                </label>
                <select
                  id="competition-template"
                  className={INPUT_CLASS}
                  value={competitionType ?? ''}
                  onChange={(e) => {
                    setCompetitionType(e.target.value || null)
                    if (e.target.value !== '__other__') setCompetitionTypeOther('')
                    setError(null)
                  }}
                >
                  <option value="">Unspecified</option>
                  {templates.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                  <option value="__other__">Others</option>
                </select>
                {competitionType === '__other__' && (
                  <input
                    id="competition-type-other"
                    className={`${INPUT_CLASS} mt-2`}
                    value={competitionTypeOther}
                    onChange={(e) => {
                      setCompetitionTypeOther(e.target.value.slice(0, 32))
                      setError(null)
                    }}
                    placeholder="Enter competition type"
                    maxLength={32}
                    required
                  />
                )}
                <p className={HELPER_TEXT}>
                  Just a label — it tailors the setup hints for your event. You&apos;ll configure the
                  rounds, criteria, and scoring yourself in Structure &amp; Scoring.
                </p>
              </div>
            )}

            <div className="v-form-field">
              <label className={LABEL_CLASS} htmlFor="title">
                Title <span className="text-v-danger">*</span>
              </label>
              <input
                id="title"
                className={INPUT_CLASS}
                {...register('title')}
                placeholder="Enter competition title"
              />
              {errors.title && <p className="v-error-text">{errors.title.message}</p>}
            </div>

            <div className="v-form-field">
              <label className={LABEL_CLASS} htmlFor="description">
                Description
              </label>
              <textarea
                id="description"
                className={INPUT_CLASS}
                rows={4}
                {...register('description')}
                placeholder="Enter competition description (optional)"
              />
              {errors.description && <p className="v-error-text">{errors.description.message}</p>}
              <p className={HELPER_TEXT}>Optional description for judges and contestants</p>
            </div>

            <div className="v-date-row">
              <div className="v-form-field">
                <label className={LABEL_CLASS} htmlFor="startDate">
                  Start Date and Time <span className="text-v-danger">*</span>
                </label>
                <Controller
                  control={control}
                  name="startDate"
                  render={({ field }) => (
                    <CalendarCard
                      id="startDate"
                      twoStep
                      confirmDate
                      required
                      defaultHour={0}
                      defaultMinute={0}
                      hasError={Boolean(errors.startDate)}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  )}
                />
                {errors.startDate && <p className="v-error-text">{errors.startDate.message}</p>}
              </div>

              <div className="v-form-field">
                <label className={LABEL_CLASS} htmlFor="endDate">
                  End Date and Time <span className="text-v-danger">*</span>
                </label>
                <Controller
                  control={control}
                  name="endDate"
                  render={({ field }) => (
                    <CalendarCard
                      id="endDate"
                      twoStep
                      confirmDate
                      required
                      defaultHour={23}
                      defaultMinute={59}
                      hasError={Boolean(errors.endDate)}
                      min={startDateValue || undefined}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  )}
                />
                {errors.endDate && <p className="v-error-text">{errors.endDate.message}</p>}
              </div>
            </div>
          </form>
        )}

        {step === 'branding' && (
          <form className="space-y-4" onSubmit={handleNextBranding}>
            <ImageUploadField
              label="Event banner"
              hint="Wide image for event headers."
              variant="banner"
              currentUrl={banner}
              onFileSelect={setBannerFile}
              disabled={saving || readOnly}
            />

          </form>
        )}

        </fieldset>
      </Card>

        {!readOnly && step === 'details' && (
            <StageFooter
              module="competition"
              currentKey="details"
              eventId={stepperEventId}
              saving={saving}
              onNext={handleNext}
              nextLabel="Next: Branding"
              backLabel={null}
              saveStatus={saveStatus}
              lastSavedAt={lastSavedAt}
            />
        )}
        
        {!readOnly && step === 'branding' && (
            <StageFooter
              module="competition"
              currentKey="branding"
              eventId={stepperEventId}
              saving={saving}
              onNext={handleNextBranding}
              nextLabel={isNew ? 'Create & continue' : 'Next: Structure & Scoring'}
              onBack={() => { setError(null); setStep('details') }}
              saveStatus={saveStatus}
              lastSavedAt={lastSavedAt}
            />
        )}

        {/* Read-only events keep a plain Back/Next footer for viewing. */}
        {readOnly && (
          <StageFooter module="competition" currentKey={step} eventId={eventId} />
        )}
          </div>
        </>

      {blocked && (
        <UnsavedChangesDialog
          variant="leave"
          title="Save this competition as a draft?"
          message="You have unsaved changes. Save your progress as a draft to pick up where you left off, or discard it."
          onPrimary={handleSaveAsDraft}
          onSecondary={handleDiscard}
          onCancel={handleCancelLeave}
          primaryLabel="Save & leave"
          secondaryLabel="Leave without saving"
          cancelLabel="Cancel"
        />
      )}
    </div>
  )
}
