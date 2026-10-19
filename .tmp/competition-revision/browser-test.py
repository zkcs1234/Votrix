from pathlib import Path
s=Path('backend/scripts/test-native-real-app.mjs').read_text(encoding='utf-8')
s=s.replace("out=path.join(root,'audits/native-local-activation-2026-10-14')", "out=path.join(root,'audits/competition-creation-flow-2026-10-15')")
s=s.replace('remote-debugging-port=9340','remote-debugging-port=9343').replace('127.0.0.1:9340','127.0.0.1:9343')
a=s.index(" await field(organizer,'input[name=\"title\"]'");b=s.index(" const j1=await login",a)
s=s[:a]+''' await field(organizer,'input[name="title"]',title);await field(organizer,'#startDate','2030-01-10T09:00');await field(organizer,'#endDate','2030-01-11T17:00');await click(organizer,'Next: Branding');await click(organizer,'Next: Competition Type');await field(organizer,'#competition-template','dance');await click(organizer,'Next: Competitions / Categories');await wait(organizer,`location.pathname.endsWith('/categories')&&document.body.innerText.includes('Competitions included')`)
 const event=await evaluate(organizer,`location.pathname.split('/')[4]`);assert.match(event,/^[0-9a-f-]{36}$/)
 const opt=async(session,label,part)=>{await wait(session,`[...document.querySelector('[aria-label=${JSON.stringify(label)}]').options].some(o=>o.textContent.includes(${JSON.stringify(part)}))`);return evaluate(session,`[...document.querySelector('[aria-label=${JSON.stringify(label)}]').options].find(o=>o.textContent.includes(${JSON.stringify(part)})).value`)}
 const settle=async()=>pause(350)
 for(const n of ['Contemporary Dance','Hip-Hop']){await evaluate(organizer,`[...document.querySelectorAll('label')].find(n=>n.textContent.trim()===${JSON.stringify(n)}).querySelector('input').click()`);await wait(organizer,`document.querySelectorAll('article').length===${n==='Contemporary Dance'?1:2}`);await settle()}
 scenarios.push('Actual eight-step create route preserves one parent, and Step 4 selects independent competitions')
 const children=[]
 await navigate(organizer,`/organizer/competition/events/${event}/workspace`)
 for(const [index,method]of ['weighted_average','sum'].entries()){
  const option=await opt(organizer,'Setup competition',index===0?'Contemporary Dance':'Hip-Hop');await labelled(organizer,'Setup competition',option);await settle()
  children.push({id:option,method});await labelled(organizer,'Calculation method',method)
  await click(organizer,'Add criterion to Single phase');await labelled(organizer,'Criterion 1 name',method+' performance');await click(organizer,'Save competition configuration');await wait(organizer,`document.body.innerText.includes('Configuration saved')`)
 }
 scenarios.push('Step 5 saves separate single-phase criteria and methods without artificial rounds')
 await navigate(organizer,`/organizer/competition/events/${event}/contestants`);await labelled(organizer,'Setup competition',children[0].id);await settle()
 for(const [n,number]of [['Alpha',1],['Beta',2]]){await labelled(organizer,'Event entrant name',n);await labelled(organizer,'Event entrant number',number);await click(organizer,'Create event entrant');await wait(organizer,`document.body.innerText.includes('Event entrant created')`);await settle()}
 await labelled(organizer,'Setup competition',children[1].id);await wait(organizer,`document.querySelectorAll('button').length>0&&[...document.querySelectorAll('button')].filter(n=>n.textContent==='Add to competition').length===2`)
 for(let e=0;e<2;e++){await click(organizer,'Add to competition');await wait(organizer,`[...document.querySelectorAll('button')].filter(n=>n.textContent==='Participating').length===${e+1}`);await settle()}
 scenarios.push('Step 6 explicitly reuses two underlying entrants through distinct memberships')
 await navigate(organizer,`/organizer/competition/events/${event}/review`);await wait(organizer,`document.body.innerText.includes('Assign an active judge')`);assert.equal(await evaluate(organizer,`[...document.querySelectorAll('button')].find(n=>n.textContent.includes('Create Event')).disabled`),true)
 await navigate(organizer,`/organizer/competition/events/${event}/judges`)
 for(const n of ['Judge One','Judge Two','Reviewer']){await labelled(organizer,'Available judge',await opt(organizer,'Available judge',n));await click(organizer,'Enroll judge');await wait(organizer,`document.body.innerText.includes('Judge enrolled without sending an invitation')`);await settle()}
 const roleLabel=await evaluate(organizer,`[...document.querySelectorAll('select[aria-label]')].find(n=>n.getAttribute('aria-label').includes('Reviewer event role')).getAttribute('aria-label')`)
 await labelled(organizer,roleLabel,'score_reviewer');await wait(organizer,`document.body.innerText.includes('Event role updated')`)
 for(const child of children){await labelled(organizer,'Setup competition',child.id);await settle();for(const n of ['Judge One','Judge Two']){await labelled(organizer,'Assigned judge',await opt(organizer,'Assigned judge',n));await click(organizer,'Assign judge');await wait(organizer,`document.body.innerText.includes('Assignment saved')`);await settle()}}
 await navigate(organizer,`/organizer/competition/events/${event}/review`);await wait(organizer,`document.querySelector('input[type="checkbox"]:not(:disabled)')`);await evaluate(organizer,`document.querySelector('input[type="checkbox"]').click()`);await click(organizer,'Create Event');await wait(organizer,`location.pathname.endsWith('/live')`)
 scenarios.push('Steps 7–8 block missing assignments then atomically freeze all children and reach Live Control')
'''+s[b:]
s=s.replace('All six methods complete real judge lock/submission', 'Both independent competition methods complete real judge lock/submission')
s=s.replace("console.log('PASS real application smoke: parent and native child creation')", "console.log('PASS revised creation, judging, live control, tabulation and results in the real application')")
Path('backend/scripts/test-competition-creation-flow-browser.mjs').write_text(s,encoding='utf-8')
