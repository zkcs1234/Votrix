from pathlib import Path
p=Path('frontend/src/components/organizer/competition/NativeSetupWorkspace.jsx');s=p.read_text(encoding='utf-8')
s=s.replace("const choose=id=>{if(dirty", "const choose=id=>{if(id===selected)return;if(dirty")
s=s.replace("patch({structure,criteria:[],rounds:[]})", "patch({structure,criteria:[],rounds:[],scoringConfig:{...value.scoringConfig,numericCarryBasis:undefined}})")
p.write_text(s,encoding='utf-8')
