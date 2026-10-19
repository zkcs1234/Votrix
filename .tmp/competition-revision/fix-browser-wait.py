from pathlib import Path
p=Path('backend/scripts/test-competition-creation-flow-browser.mjs')
s=p.read_text(encoding='utf-8')
s=s.replace("for(const n of ['Contemporary Dance','Hip-Hop']){await evaluate", "for(const n of ['Contemporary Dance','Hip-Hop']){await wait(organizer,`document.querySelector('fieldset:not(:disabled) input[type=checkbox]')`);await evaluate")
p.write_text(s,encoding='utf-8')
