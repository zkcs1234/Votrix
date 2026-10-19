from pathlib import Path
p=Path('frontend/src/pages/auth/ChangePasswordPage.jsx');s=p.read_text(encoding='utf-8').replace('        accessToken: data.accessToken,\n','');p.write_text(s,encoding='utf-8')
for filename in ['test-competition-creation-flow-browser.mjs','test-competition-creation-visuals.mjs']:
 p=Path('backend/scripts')/filename;s=p.read_text(encoding='utf-8').replace("localStorage.getItem('accessToken')", "localStorage.getItem('votrix_access_token')");p.write_text(s,encoding='utf-8')
