from pathlib import Path
import json,re

base=Path(__file__).resolve().parents[1]
expected=['00_EXECUTIVE_SUMMARY.md','01_COMPETITION_WORKFLOW_MAP.md','02_FEATURE_AND_BUTTON_AUDIT.md','03_GAPS_BUGS_AND_SECURITY_FINDINGS.md','04_SCORING_AND_TABULATION_REVIEW.md','05_REALTIME_SYNC_REVIEW.md','06_PRIORITIZED_IMPLEMENTATION_PLAN.md','07_END_TO_END_TEST_PLAN.md']
result={'reports':[],'missingLinks':[]}
for name in expected:
    path=base/name
    if not path.exists():
        result['missingLinks'].append({'report':name,'target':'REPORT MISSING'});continue
    content=path.read_text(encoding='utf-8')
    links=re.findall(r'\[[^\]]+\]\(([^)]+)\)',content)
    for target in links:
        target=target.strip('<>').split('#',1)[0]
        if not target or target.startswith(('http:','https:','mailto:','app:')):continue
        if not (path.parent/target).exists():result['missingLinks'].append({'report':name,'target':target})
    result['reports'].append({'name':name,'lines':len(content.splitlines()),'words':len(content.split()),'links':len(links),'controlRows':sum(line.startswith('|') and not line.startswith('|---') for line in content.splitlines())})
result['applicationFilesChanged']=json.loads((base/'_evidence/application-change-check.json').read_text())['changed']
result['complete']=len(result['reports'])==8 and not result['missingLinks'] and not result['applicationFilesChanged']
(base/'_evidence/report-validation.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
