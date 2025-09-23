type Variant = 'info'|'success'|'warning'|'error'
function ensureHost() {
  let host = document.getElementById('promptshield-coach')
  if (host) return host
  host = document.createElement('div')
  host.id = 'promptshield-coach'
  host.style.position = 'fixed'
  host.style.right = '16px'
  host.style.bottom = '16px'
  host.style.zIndex = '2147483647'
  document.body.appendChild(host)
  return host
}
function toast(variant:Variant, title:string, message:string) {
  const host = ensureHost()
  const el = document.createElement('div')
  el.setAttribute('role','alert')
  el.style.cssText = 'min-width:280px;max-width:360px;margin-top:8px;padding:10px 12px;border-radius:10px;background:#0b0b0c;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.35);font:13px/1.35 system-ui, -apple-system, Segoe UI, Roboto'
  const bar = {info:'#3b82f6',success:'#22c55e',warning:'#f59e0b',error:'#ef4444'}[variant]
  el.style.border = `1px solid ${bar}`
  el.innerHTML = `<div style="font-weight:600;margin-bottom:2px">${title}</div><div style="opacity:.8">${message}</div>`
  host.appendChild(el)
  setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(10px)'; el.style.transition='all .25s ease'; setTimeout(()=>el.remove(), 250)}, 3500)
  if (navigator.vibrate) try { navigator.vibrate(50) } catch {}
}
window.addEventListener('promptshield:coach', (e:any) => {
  toast(e.detail.type, e.detail.title, e.detail.message)
})
