// Audit test guard: test traffic may use loopback; remote DB/media/email calls
// are denied. This does not change application code or environment files.
const allowed = host => !host || ['localhost','127.0.0.1','::1','[::1]'].includes(String(host).split(':')[0]) || host === '::1' || host === '[::1]'
function check(input) {
  let host
  if (typeof input === 'string' || input instanceof URL) host = new URL(input).hostname
  else host = input?.hostname ?? input?.host
  if (!allowed(host)) throw new Error('AUDIT_EXTERNAL_NETWORK_BLOCKED')
}
if (globalThis.fetch) { const original=globalThis.fetch; globalThis.fetch=function(input,...rest){check(input?.url ?? input);return original.call(this,input,...rest)} }
for(const protocol of ['node:http','node:https']){
  const module=require(protocol)
  for(const name of ['request','get']){const original=module[name];module[name]=function(input,...rest){check(input);return original.call(this,input,...rest)}}
}
