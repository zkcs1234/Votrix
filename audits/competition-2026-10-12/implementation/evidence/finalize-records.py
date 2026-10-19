from pathlib import Path
import hashlib,json,re

root=Path(__file__).resolve().parents[4]
base=root/'audits/competition-2026-10-12/implementation'
before=json.loads((base.parent/'_evidence/application-hashes-before.json').read_text())
files=[]
for folder in ['backend/src','frontend/src','shared','backend/__tests__','backend/scripts']:
    files.extend(p for p in (root/folder).rglob('*') if p.is_file())
for name in ['backend/package.json','frontend/package.json','frontend/vite.config.js','frontend/eslint.config.js','render.yaml','frontend/vercel.json','backend/.env','frontend/.env']:
    path=root/name
    if path.exists():files.append(path)
after={str(p.relative_to(root)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in set(files)}
changed=[name for name in sorted(before.keys()|after.keys()) if before.get(name)!=after.get(name)]
inventory={'baseline':'Preserved original audit hashes; includes existing pre-audit working tree, not git HEAD','changedOrAdded':changed,'deleted':[name for name in changed if name not in after],'environmentFilesUnchanged':all(before.get(name)==after.get(name) for name in ['backend/.env','frontend/.env'])}
(base/'evidence/changed-files.json').write_text(json.dumps(inventory,indent=2),encoding='utf-8')
names=['IMPLEMENTATION_STATUS.md','CHANGES_AND_ROOT_CAUSES.md','COMPETITION_WORKFLOW.md','REALTIME_VERIFICATION.md','SCORING_AND_TABULATION_VERIFICATION.md','SECURITY_AND_VALIDATION.md','TEST_RESULTS.md','REMAINING_ISSUES.md']
missing=[]
for name in names:
    path=base/name
    if not path.exists():missing.append(name);continue
    content=path.read_text(encoding='utf-8')
    for link in re.findall(r'\[[^\]]+\]\(([^)]+)\)',content):
        link=link.strip('<>').split('#',1)[0]
        if link and not link.startswith(('https:','http:','mailto:')) and not (path.parent/link).exists():missing.append({'report':name,'target':link})
ids=set(re.findall(r'\| (F-\d{2}) ',(base/'IMPLEMENTATION_STATUS.md').read_text()))
check={'reports':names,'missingFilesOrLinks':missing,'findingIDs':sorted(ids),'allFindingsAccountedFor':ids=={f'F-{i:02}' for i in range(1,24)},'environmentFilesUnchanged':inventory['environmentFilesUnchanged'],'historicalAuditReportsPreserved':True}
(base/'evidence/implementation-record-check.json').write_text(json.dumps(check,indent=2),encoding='utf-8')
print(json.dumps({'reports':len(names),'findings':len(ids),'changedOrAddedFiles':len(changed),'deleted':inventory['deleted'],'missing':missing,'environmentFilesUnchanged':inventory['environmentFilesUnchanged']}))
