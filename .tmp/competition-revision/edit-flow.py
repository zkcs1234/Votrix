from pathlib import Path
p=Path('frontend/src/utils/eventStages.js')
s=p.read_text(encoding='utf-8')
a=s.index('  competition: ['); b=s.index('  polling: [',a)
s=s[:a]+'''  competition: [
    { key: 'details', label: 'Event Details', path: 'edit' },
    { key: 'branding', label: 'Branding', path: 'branding' },
    { key: 'type', label: 'Competition Type', path: 'type' },
    { key: 'categories', label: 'Competitions / Categories', path: 'categories' },
    { key: 'workspace', label: 'Rounds & Scoring', path: 'workspace' },
    { key: 'contestants', label: 'Contestants / Entries', path: 'contestants' },
    { key: 'judges', label: 'Judges', path: 'judges' },
    { key: 'review', label: 'Review & Create', path: 'review' },
    { key: 'live', label: 'Live Control', path: 'live' },
    { key: 'tabulation', label: 'Tabulation', path: 'tabulation' },
    { key: 'rankings', label: 'Results & Analysis', path: 'rankings' },
  ],
'''+s[b:]
s=s.replace("['details', 'branding', 'workspace', 'contestants', 'judges', 'review']", "['details', 'branding', 'type', 'categories', 'workspace', 'contestants', 'judges', 'review']")
p.write_text(s,encoding='utf-8')
p=Path('frontend/src/pages/organizer/competition/CompetitionEventFormPage.jsx'); s=p.read_text(encoding='utf-8')
s=s.replace("import { INPUT_CLASS", "import { COMPETITION_TYPES } from '../../../../../shared/competition-creation-flow.js'\nimport EventStepper from '@/components/ui/EventStepper'\n\nimport { INPUT_CLASS")
s=s.replace("if (pathname.includes('/branding'))", "if (pathname.includes('/type')) return 'type'\n  if (pathname.includes('/branding'))")
s=s.replace("if (step === 'branding') return step", "if (['branding', 'type'].includes(step)) return step")
s=s.replace("  const [templates, setTemplates] = useState([])\n", '')
a=s.index('  // Load the starter-template'); b=s.index('  // Session-boundary',a);s=s[:a]+s[b:]
s=s.replace("    if (competitionType === '__other__'", "    if (!competitionType) { setError('Choose a competition type.'); return false }\n    if (competitionType === '__other__'")
s=s.replace("operationRef.current || readOnly || !validateCompetitionType()", "operationRef.current || readOnly",1)
s=s.replace("        await handleContinueToContestants()", "        markComplete('branding')\n        setStep('type')")
s=s.replace("operationRef.current || readOnly || !validateCompetitionType()", "operationRef.current || readOnly",1)
s=s.replace("navigate(`/organizer/competition/events/${eventId}/workspace`)", "navigate(`/organizer/competition/events/${eventId}/type`)")
s=s.replace("navigate(`/organizer/competition/events/${res.event.id}/workspace`, { replace: true })", "navigate(`/organizer/competition/events/${res.event.id}/categories`, { replace: true })")
s=s.replace("  const getCompetitionTypeValue = () => {", "  const handleNextType = rhfHandleSubmit(async () => {\n    if (operationRef.current || readOnly || !validateCompetitionType()) return\n    operationRef.current = true; setSaving(true); setError(null)\n    try {\n      await saveDraft(buildDraftSnapshot(getValues(), 'type'))\n      await handleContinueToContestants()\n    } catch (err) { setError(err.response?.data?.message || 'Unable to save the event draft. Your progress is retained.') }\n    finally { operationRef.current = false; setSaving(false) }\n  })\n\n  const getCompetitionTypeValue = () => {")
a=s.index('          <div className="flex flex-wrap items-center gap-2 text-sm text-v-text-subtle"');b=s.index('\n\n          {readOnly',a)
s=s[:a]+'''          <EventStepper module="competition" currentKey={step} eventId={isNew ? 'new' : eventId} completedKeys={step === 'type' ? ['details', 'branding'] : step === 'branding' ? ['details'] : []} navigationDisabled={saving} onLocalStageSelect={setStep} />'''+s[b:]
s=s.replace('Save details and optional branding, then configure structure, contestants and judges.\n                Create &amp; continue saves a draft event; Review &amp; Publish confirms the official rules later.', 'Complete the eight setup steps, then review and create your event. Each competition keeps its own scoring, entries, judges, and results.')
a=s.index('            {isNew && (');b=s.index('\n\n            <div className="v-form-field">',a)
typeui=s[a:b].replace('{isNew && (','{step === \'type\' && (').replace('(optional)','*').replace('<option value="">Unspecified</option>','<option value="">Choose a competition type</option>').replace('{templates.map((t) => (','{COMPETITION_TYPES.filter(([key]) => key !== \'other\').map(([key, label]) => (').replace('key={t.key} value={t.key}','key={key} value={key}').replace('{t.label}','{label}').replace('maxLength={32}','maxLength={100}').replace('slice(0, 32)','slice(0, 100)').replace('Just a label — it tailors the setup hints for your event. You&apos;ll configure the\n                  rounds, criteria, and scoring yourself in Structure &amp; Scoring.', 'This determines the competition and category choices in Step 4. Each selected competition is configured independently.')
s=s[:a]+s[b:]
s=s.replace("        {step === 'branding' && (", "        "+typeui.strip()+"\n\n        {step === 'branding' && (")
s=s.replace("setStep(step === 'settings' ? 'branding' : 'details')", "setStep(step === 'type' ? 'branding' : 'details')").replace("step === 'settings' ? 'Branding' : 'Details'", "step === 'type' ? 'Branding' : 'Event Details'")
s=s.replace("onClick={step === 'details' ? handleNext : handleNextBranding}", "onClick={step === 'details' ? handleNext : step === 'branding' ? handleNextBranding : handleNextType}")
s=s.replace("step === 'details' ? 'Next: Branding' : isNew ? 'Create & continue' : 'Next: Structure & Scoring'", "step === 'details' ? 'Next: Branding' : step === 'branding' ? 'Next: Competition Type' : 'Next: Competitions / Categories'")
p.write_text(s,encoding='utf-8')
p=Path('frontend/src/components/ui/EventStepper.jsx');s=p.read_text(encoding='utf-8');s=s.replace("const stages = (EVENT_STAGES[module] ?? []).map(stage=>module==='competition'&&nativeCompetition&&stage.key==='review'?{...stage,label:'Review & Freeze'}:stage)", "const stages = EVENT_STAGES[module] ?? []")
s=s.replace("['details', 'branding'].includes(stage.key)", "['details', 'branding', 'type'].includes(stage.key)")
s=s.replace('const canVisit = href && !isCurrent && (eventId', 'const canVisit = (href || onLocalStageSelect && completedKeys.includes(stage.key)) && !isCurrent && (eventId')
# nativeCompetition no longer changes the user-facing stage name.
s=s.replace('  nativeCompetition = false,\n','')
p.write_text(s,encoding='utf-8')
p=Path('frontend/src/routes/index.jsx');s=p.read_text(encoding='utf-8');s=s.replace("{ path: 'events/:eventId/workspace', element: <CompetitionWorkspacePage /> },", "{ path: 'events/:eventId/type', element: <CompetitionCategoriesPage typeOnly /> },\n      { path: 'events/:eventId/categories', element: <CompetitionCategoriesPage /> },\n      { path: 'events/:eventId/workspace', element: <CompetitionWorkspacePage /> },")
s="import CompetitionCategoriesPage from '@/pages/organizer/competition/CompetitionCategoriesPage'\n"+s;p.write_text(s,encoding='utf-8')
p=Path('frontend/src/layouts/PageantLayout.jsx');s=p.read_text(encoding='utf-8');s=s.replace("  { label: 'Structure & Scoring'", "  { label: 'Competition Type', path: 'type', icon: Settings2, scoped: true, basePath: BASE },\n  { label: 'Competitions / Categories', path: 'categories', icon: Settings2, scoped: true, basePath: BASE },\n  { label: 'Rounds & Scoring'")
s=s.replace("label: 'Review & Publish'", "label: 'Review & Create'").replace("label: 'Rankings'", "label: 'Results & Analysis'");p.write_text(s,encoding='utf-8')
