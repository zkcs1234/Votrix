import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const backup = path.join(root, '.tmp', 'before-calendar-wizard-rollback')
fs.mkdirSync(backup, { recursive: true })
for (const module of ['election', 'competition', 'polling']) {
  const fileName = `${module[0].toUpperCase()}${module.slice(1)}EventFormPage.jsx`
  const file = path.join(root, 'frontend/src/pages/organizer', module, fileName)
  let source = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n')
  fs.writeFileSync(path.join(backup, fileName), source)
  source = source.replaceAll('CalendarCard', 'DateTimeInput')
  source = source.replace("import EventStepper from '@/components/ui/EventStepper'\n", '')
  source = source.replace("import StageFooter from '@/components/ui/StageFooter'\n", "import { getNextStage, stagePath } from '@/utils/eventStages'\nimport SaveStatus from '@/components/ui/SaveStatus'\n")
  if (!source.includes("import Button from '@/components/ui/Button'")) {
    source = source.replace("import Card from '@/components/ui/Card'", "import Button from '@/components/ui/Button'\nimport Card from '@/components/ui/Card'")
  }
  source = source.replace('const { completedKeys, markComplete, reset: resetProgress }', 'const { markComplete, reset: resetProgress }')
  source = source.replace(/^\s*const startDateValue = .*\n/gm, '\n')
  source = source.replace(/\s*const stepperEventId = isNew \? 'new' : eventId\n/, '\n')
  source = source.replace(/\n\s*(twoStep|confirmDate|required|showShortcuts=\{false\}|defaultHour=\{\d+\}|defaultMinute=\{\d+\}|min=\{startDateValue \|\| undefined\})\n/g, '\n')
  source = source.replaceAll('className="v-date-row"', 'className="grid gap-4 sm:grid-cols-2"')
  const keys = module === 'polling' ? ['details', 'branding', 'settings'] : ['details', 'branding']
  const steps = `<div className="flex flex-wrap items-center gap-2 text-sm text-v-text-subtle" aria-label="Event steps">
            {${JSON.stringify(keys)}.map((key, index) => (
              <span key={key} aria-current={step === key ? 'step' : undefined} className={step === key ? 'font-medium text-v-primary' : ''}>
                {index > 0 && <span aria-hidden="true"> → </span>}
                Step {index + 1}: {key[0].toUpperCase() + key.slice(1)}
              </span>
            ))}
          </div>`
  source = source.replace(/<EventStepper\b[\s\S]*?\n\s*\/>/, steps)
  const footerStart = source.indexOf("        {!readOnly && step === 'details' && (")
  const footerEnd = source.indexOf('          </div>\n        </>', footerStart)
  if (footerStart < 0 || footerEnd < 0 || source.includes('EventStepper')) throw new Error(`Unexpected structure: ${file}`)
  const nextHandler = module === 'polling' ? 'handleNextDetails' : 'handleNext'
  const finalLabel = module === 'election' ? 'Positions' : module === 'competition' ? 'Structure & Scoring' : 'Settings'
  const footer = `        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-v-border pt-4">
          <div className="flex items-center gap-3">
            {step !== 'details' && (
              <Button type="button" variant="secondary" disabled={saving} onClick={() => { setError(null); setStep(step === 'settings' ? 'branding' : 'details') }}>
                Back: {step === 'settings' ? 'Branding' : 'Details'}
              </Button>
            )}
            {!readOnly && <SaveStatus status={saveStatus} lastSavedAt={lastSavedAt} />}
          </div>
          {readOnly ? (
            <Button type="button" onClick={() => {
              if (step === 'details') setStep('branding')
              ${module === 'polling' ? "else if (step === 'branding') setStep('settings')" : ''}
              else {
                const next = getNextStage('${module}', step)
                if (next) navigate(stagePath('${module}', next.key, eventId))
              }
            }}>Next</Button>
          ) : (
            <Button type="button" disabled={saving} onClick={step === 'details' ? ${nextHandler} : ${module === 'polling' ? "step === 'branding' ? handleNextBranding : handleSaveSettings" : 'handleNextBranding'}}>
              {saving ? 'Saving...' : step === 'details' ? 'Next: Branding' : ${module === 'polling' ? "step === 'branding' ? 'Next: Settings' : isNew ? 'Create & continue' : 'Next: Builder'" : `isNew ? 'Create & continue' : 'Next: ${finalLabel}'`}}
            </Button>
          )}
        </div>
`
  source = source.slice(0, footerStart) + footer + source.slice(footerEnd)
  source = source.replace('Fill out the event basics, branding, and optional information form. Use the stepper or sidebar', 'Fill out the event basics and branding. Use the sidebar')
  source = source.replace('Fill out the poll basics, branding, and settings. Use the stepper or sidebar', 'Fill out the poll basics, branding, and settings. Use the sidebar')
  fs.writeFileSync(file, source)
}
