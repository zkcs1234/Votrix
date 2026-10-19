from pathlib import Path
import hashlib,json,subprocess,sys
root=Path(__file__).resolve().parents[3]
out=Path(__file__).resolve().parent
paths=[]
for folder in ['backend/src','frontend/src','shared']:
    paths.extend(p for p in (root/folder).rglob('*') if p.is_file())
for folder in ['backend/__tests__','backend/scripts']:
    paths.extend(p for p in (root/folder).rglob('*') if p.is_file())
paths.extend(p for p in (root/'frontend/src').rglob('*.test.*') if p.is_file())
for name in ['backend/package.json','frontend/package.json','frontend/vite.config.js','frontend/eslint.config.js','render.yaml','frontend/vercel.json','backend/.env','frontend/.env']:
    p=root/name
    if p.is_file():paths.append(p)
snapshot={str(p.relative_to(root)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(paths))}
baseline=out/'application-hashes-before.json'
if '--verify' in sys.argv:
    previous=json.loads(baseline.read_text())
    changes=[name for name in sorted(set(snapshot)|set(previous)) if snapshot.get(name)!=previous.get(name)]
    (out/'application-change-check.json').write_text(json.dumps({'filesChecked':len(snapshot),'changed':changes},indent=2))
    print(json.dumps({'filesChecked':len(snapshot),'applicationFilesChanged':len(changes),'changedPaths':changes}))
    sys.exit(bool(changes))
baseline.write_text(json.dumps(snapshot,indent=2))
(out/'git-status-before.txt').write_text(subprocess.check_output(['git','status','--short'],cwd=root,text=True),encoding='utf-8')
safe={}
for folder in ['backend','frontend']:
    p=root/folder/'.env'
    entries={}
    if p.exists():
        for line in p.read_text(encoding='utf-8').splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                k,v=line.split('=',1);entries[k.strip()]=v.strip().strip('"').strip("'")
    allowed=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','CSRF_SECRET','RESEND_API_KEY','CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET','FRONTEND_URL','CLIENT_URL','VITE_API_URL','VITE_WS_URL']
    safe[folder]={k:{'present':bool(entries.get(k)),'placeholder':bool(entries.get(k)) and ('change-me' in entries[k] or entries[k].startswith('dev-'))} for k in allowed if k in entries or folder=='backend'}
    for k in ['NODE_ENV','COOKIE_SAME_SITE','LOCK_PARTICIPANTS_ON_ACTIVE','VITE_LOCK_PARTICIPANTS_ON_ACTIVE']:
        if k in entries:safe[folder][k]={'value':entries[k] if entries[k] in ['development','production','test','strict','lax','none','true','false'] else 'configured'}
(out/'environment-presence.json').write_text(json.dumps(safe,indent=2))
print(json.dumps({'applicationFilesSnapshotted':len(snapshot),'environmentValues':'presence/recognized non-secret switches only'}))
