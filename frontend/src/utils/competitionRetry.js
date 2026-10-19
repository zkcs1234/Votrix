export function competitionRetryDelay(error,now=Date.now()){
 const raw=error?.response?.headers?.['retry-after'];const seconds=Number(raw)
 const delay=raw&&Number.isFinite(seconds)?seconds*1000:raw?Date.parse(raw)-now:15000
 return Math.min(3600000,Math.max(1000,Number.isFinite(delay)?delay:15000))
}
