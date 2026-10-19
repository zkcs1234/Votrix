import {readFileSync,writeFileSync} from 'node:fs'
let s=readFileSync('backend/scripts/test-competition-phase9-browser.mjs','utf8')
s=s.replace("for(const label of ['Hip-Hop','Contemporary','Ballet','Ballroom','Folk'])", "const methodByName={'Hip-Hop':'sum',Contemporary:'rank_based',Ballet:'weighted_average',Ballroom:'highest_score',Folk:'lowest_removal',Manual:'manual'};for(const label of Object.keys(methodByName))")
s=s.replace("await click(setup,'Save competition configuration')", "await field(setup,'Calculation method',methodByName[label]);if(label==='Manual')await field(setup,'Manual decision basis','Independent explicit placement review');if(label==='Folk')await field(setup,'Remove lowest judges','1');await click(setup,'Save competition configuration')")
s=s.replaceAll(".length,5)",".length,6)")
s=s.replace("await click(tabulation,'Calculate official results')\n  const anotherReviewer", "if(child.name==='Manual'){await field(tabulation,'Shared browser entrant placement','1');await field(tabulation,'Review reason','Explicit manual placement from documented basis')}await click(tabulation,'Calculate official results')\n  const anotherReviewer")
s=s.replace("assert.equal(rpc('competition_child_public_results',literal(event),literal(child.id),'NULL').results.standings[0].score,75)", "const official=rpc('competition_child_public_results',literal(event),literal(child.id),'NULL').results.standings[0];assert.equal(official.score,({'Hip-Hop':150,Contemporary:2,Ballroom:80,Folk:80,Manual:null})[child.name]);assert.equal(official.rank,1)")
s=s.replaceAll('browser-integration.json','browser-methods.json').replaceAll('five','six').replaceAll('Five','Six')
writeFileSync('backend/scripts/test-competition-phase9-browser-methods.mjs',s,{flag:'wx'})
