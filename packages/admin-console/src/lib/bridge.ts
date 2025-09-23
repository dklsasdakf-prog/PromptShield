export async function getPolicy(){ return (await fetch('/api/mock-policy.json').catch(()=>null))?.json?.() ?? null }
export async function savePolicy(p:any){ localStorage.setItem('ps:policy-ui', JSON.stringify(p)); return true }
export async function getEvents(){ const raw = localStorage.getItem('ps:events-ui'); return raw? JSON.parse(raw): [] }
export async function exportEvents(ndjson:string){ const blob = new Blob([ndjson],{type:'application/x-ndjson'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='promptshield-telemetry.ndjson'; a.click() }
