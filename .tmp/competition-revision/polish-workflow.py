from pathlib import Path
for filename in ['NativeSetupWorkspace.jsx','NativeResultsWorkspace.jsx','NativeTabulationWorkspace.jsx']:
 p=Path('frontend/src/components/organizer/competition')/filename;s=p.read_text(encoding='utf-8')
 s=s.replace('<section className="space-y-5"','<section className="v-competition-workflow space-y-5"').replace('<section className="space-y-4"','<section className="v-competition-workflow space-y-4"')
 if filename!='NativeSetupWorkspace.jsx':
  s=s.replace('<table>', '<div className="v-table-wrap"><table className="v-table">').replace('</table>', '</table></div>')
  s=s.replace('<pre>', '<pre className="max-h-96 overflow-auto rounded-lg bg-v-surface p-4 text-xs">')
 s=s.replace('className="grid grid-cols-2 gap-3"','className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"')
 p.write_text(s,encoding='utf-8')
p=Path('frontend/src/pages/organizer/competition/CompetitionEventFormPage.jsx');s=p.read_text(encoding='utf-8').replace('className="grid gap-4 sm:grid-cols-2"','className="v-date-row grid gap-4 sm:grid-cols-2"');p.write_text(s,encoding='utf-8')
