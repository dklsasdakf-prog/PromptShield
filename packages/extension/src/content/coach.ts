import { ensurePromptShieldTheme } from './theme'

type Variant = 'info' | 'success' | 'warning' | 'error'

function ensureHost() {
  ensurePromptShieldTheme()
  let host = document.getElementById('promptshield-coach') as HTMLDivElement | null
  if (host) return host
  host = document.createElement('div')
  host.id = 'promptshield-coach'
  host.className = 'promptshield-toast-host'
  document.body.appendChild(host)
  return host
}

function toast(variant: Variant, title: string, message: string) {
  const host = ensureHost()
  const el = document.createElement('article')
  el.setAttribute('role', 'alert')
  el.className = 'promptshield-toast'
  el.dataset.variant = variant

  const header = document.createElement('header')
  const heading = document.createElement('h3')
  heading.textContent = title
  header.appendChild(heading)

  const dismiss = document.createElement('button')
  dismiss.type = 'button'
  dismiss.textContent = 'Dismiss'
  dismiss.addEventListener('click', () => el.remove())
  header.appendChild(dismiss)

  const body = document.createElement('p')
  body.textContent = message

  el.append(header, body)
  host.appendChild(el)

  const exit = () => {
    el.style.opacity = '0'
    el.style.transform = 'translateY(6px)'
    el.style.transition = 'opacity 0.18s ease, transform 0.18s ease'
    window.setTimeout(() => el.remove(), 220)
  }

  window.setTimeout(exit, 4200)
}

window.addEventListener('promptshield:coach', (e: any) => {
  const detail = e.detail || {}
  const variant: Variant = ['info', 'success', 'warning', 'error'].includes(detail.type)
    ? detail.type
    : 'info'
  toast(variant, detail.title ?? 'PromptShield', detail.message ?? '')
})
