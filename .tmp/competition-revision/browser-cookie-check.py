from pathlib import Path
p=Path('backend/scripts/test-competition-creation-flow-browser.mjs');s=p.read_text(encoding='utf-8')
needle=" const screenshot=await call('Page.captureScreenshot'"
insert=''' const cookieChecks=await evaluate(organizer,`(async()=>{const cookie=await fetch('http://localhost:5000/api/auth/me',{credentials:'include',headers:{Authorization:'Bearer unrelated-token'}});const header=await fetch('http://localhost:5000/api/auth/me',{credentials:'omit',headers:{Authorization:'Bearer unrelated-token'}});const refresh=await fetch('http://localhost:5000/api/auth/refresh',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'});const body=await refresh.json();return {cookieStatus:cookie.status,headerOnlyStatus:header.status,refreshStatus:refresh.status,refreshHasAccessToken:'accessToken' in body,refreshHasRefreshToken:'refreshToken' in body,storedAccessToken:localStorage.getItem('votrix_access_token')}})()`)
 assert.deepEqual(cookieChecks,{cookieStatus:200,headerOnlyStatus:401,refreshStatus:200,refreshHasAccessToken:false,refreshHasRefreshToken:false,storedAccessToken:null})
 scenarios.push('Real cookie-only authentication: legacy token storage empty; unrelated bearer cannot override cookie identity; no-cookie bearer rejected; refresh returns no access/refresh token JSON')
'''
s=s.replace(needle,insert+needle);p.write_text(s,encoding='utf-8')
