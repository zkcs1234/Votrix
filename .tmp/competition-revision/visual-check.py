from pathlib import Path
s=Path('backend/scripts/test-competition-creation-flow-browser.mjs').read_text(encoding='utf-8')
a=s.index(" await click(organizer,'Create Event');");b=s.index('\n}catch(error)',a)
s=s[:a]+''' const event=JSON.parse(readFileSync(path.join(out,'real-browser.json'))).event
 await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},organizer)
 await navigate(organizer,`/organizer/competition/events/${event}/rankings`)
 await wait(organizer,`document.querySelectorAll('nav[aria-label="Event setup progress"] li').length===11&&[...document.querySelectorAll('nav[aria-label="Event setup progress"] li')].slice(0,8).every(n=>n.innerText.includes('Completed'))`)
 await wait(organizer,`document.body.innerText.includes('Current official standings')`)
 const screenshot=await call('Page.captureScreenshot',{format:'png'},organizer);writeFileSync(path.join(out,'results-desktop.png'),Buffer.from(screenshot.data,'base64'))
 await navigate(organizer,'/organizer/competition/events/new')
 await wait(organizer,`document.querySelector('input[name="title"]')`)
 const createShot=await call('Page.captureScreenshot',{format:'png'},organizer);writeFileSync(path.join(out,'creation-desktop.png'),Buffer.from(createShot.data,'base64'))
 console.log('PASS eleven-step navigation, server-confirmed setup completion, and desktop creation/results visuals')
'''+s[b:]
Path('backend/scripts/test-competition-creation-visuals.mjs').write_text(s,encoding='utf-8')
