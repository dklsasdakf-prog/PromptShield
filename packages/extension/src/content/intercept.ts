import { Targets } from '../shared/site-selectors'
import { coercePanelRisk, dismissPanel, showBlockPanel, showInfoPanel, showSanitizedPanel } from './panel'

type OutputWarning = { type: string; line?: number; message: string; severity: string }

const host = location.hostname
const match = Object.values(Targets).find((t) => t.host.test(host))

const dangerousCommand = /(rm -rf\s+\/|powershell\s+-enc|Invoke-WebRequest|curl\s+.*\|\s+sh)/gi
const secretToken = /(sk-[a-zA-Z0-9]{16,}|AIza[0-9A-Za-z\-_]{20,})/gi

function findPromptEl(): HTMLTextAreaElement | HTMLInputElement | null {
  if(!match) return null
  return document.querySelector(match.prompt) as any
}

async function sendPrompt(prompt: string, target?: HTMLElement) {
  const res = await chrome.runtime.sendMessage({ type: 'PROMPT_SUBMIT', prompt, url: location.href })
  if (!res) return prompt
  if (res.action === 'block') {
    showBlockPanel({
      target,
      reason: res.reason || 'Prompt blocked by policy.',
      risk: coercePanelRisk(res.risk),
    })
    window.dispatchEvent(
      new CustomEvent('checkred:coach', {
        detail: {
          type: 'error',
          title: 'Blocked',
          message: res.reason || 'We require additional verification to meet your organization’s compliance standards.',
        },
      }),
    )
    throw new Error('Prompt blocked')
  }
  if (res.action === 'sanitize' && res.text) {
    showSanitizedPanel({
      target,
      sanitized: res.text,
      redactions: res.redactions,
      reasons: res.reasons ?? [],
      risk: coercePanelRisk(res.risk),
    })
    window.dispatchEvent(
      new CustomEvent('checkred:coach', {
        detail: {
          type: 'warning',
          title: 'Sanitized',
          message: 'We removed sensitive tokens from your prompt to keep data safe. Review the redactions before sending.',
        },
      }),
    )
    return res.text
  }
  if (res.dryRun && res.wouldHave) {
    showInfoPanel({
      target,
      title: 'Policy dry-run',
      message: `Request allowed in dry-run mode. Enforcement would ${res.wouldHave}.`,
      pills: res.reason ? [res.reason] : undefined,
    })
  } else {
    dismissPanel()
  }
  return prompt
}

function hookSubmit() {
  const el = findPromptEl()
  if(!el) return
  el.addEventListener('keydown', async (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      const target = e.target as HTMLTextAreaElement
      const original = target.value || (target as any).innerText || ''
      try {
        const safe = await sendPrompt(original, target)
        if (safe !== original) {
          target.value = safe
          ;(target as any).dispatchEvent(new Event('input', { bubbles:true }))
        }
      } catch { e.preventDefault() }
    }
  }, { capture: true })
}

function observeOutputs() {
  if(!match) return
  const root = document.body
  const observer = new MutationObserver(async (muts) => {
    for (const m of muts) {
      m.addedNodes.forEach(async (n) => {
        if (!(n instanceof HTMLElement)) return
        if (match.streamSelector && n.matches?.(match.streamSelector)) {
          const text = n.innerText.slice(0, 4000)
          const res = await chrome.runtime.sendMessage({ type: 'OUTPUT_OBSERVED', text, url: location.href })
          const warnings: OutputWarning[] = res?.warnings ?? []
          if (warnings.length) {
            window.dispatchEvent(
              new CustomEvent('checkred:coach', {
                detail: {
                  type: 'info',
                  title: 'Output check',
                  message: `${warnings.length} warning(s) in model output.`,
                },
              }),
            )
            decorateOutputNode(n, warnings)
          } else {
            clearOutputBanner(n)
          }
        }
      })
    }
  })
  observer.observe(root, { childList: true, subtree: true })
}

hookSubmit()
observeOutputs()
import('./coach')

function decorateOutputNode(node: HTMLElement, warnings: OutputWarning[]) {
  if (!warnings.length) return
  let banner = node.querySelector<HTMLElement>('[data-checkred-warning]')
  if (!banner) {
    banner = document.createElement('div')
    banner.dataset.checkredWarning = 'true'
    banner.setAttribute('role', 'alert')
    banner.style.position = 'relative'
    banner.style.display = 'flex'
    banner.style.alignItems = 'center'
    banner.style.justifyContent = 'space-between'
    banner.style.gap = '12px'
    banner.style.padding = '10px 12px'
    banner.style.marginBottom = '12px'
    banner.style.borderRadius = '8px'
    banner.style.border = '1px solid rgba(251, 191, 36, 0.4)'
    banner.style.background = 'rgba(251, 191, 36, 0.15)'
    banner.style.color = '#92400e'
    banner.style.fontSize = '13px'
    node.insertBefore(banner, node.firstChild)
  } else {
    banner.textContent = ''
  }

  const summary = document.createElement('span')
  summary.textContent = `${warnings.length} warning${warnings.length > 1 ? 's' : ''} flagged`
  summary.style.fontWeight = '600'
  banner.appendChild(summary)

  const actions = document.createElement('div')
  actions.style.display = 'flex'
  actions.style.gap = '8px'
  banner.appendChild(actions)

  const learnButton = document.createElement('button')
  learnButton.type = 'button'
  learnButton.textContent = 'Learn why'
  learnButton.style.border = 'none'
  learnButton.style.background = 'transparent'
  learnButton.style.color = '#92400e'
  learnButton.style.fontWeight = '600'
  learnButton.style.cursor = 'pointer'
  learnButton.addEventListener('click', () => {
    window.dispatchEvent(
      new CustomEvent('checkred:coach', {
        detail: {
          type: 'info',
          title: 'Why we flagged this',
          message:
            'Checkred AI Security spotted risky commands or links. We only store hashed telemetry and recommend copy-safely to keep data compliant.',
        },
      }),
    )
  })

  const copyButton = document.createElement('button')
  copyButton.type = 'button'
  copyButton.textContent = 'Copy safely'
  copyButton.style.border = 'none'
  copyButton.style.background = '#111827'
  copyButton.style.color = '#f9fafb'
  copyButton.style.padding = '6px 10px'
  copyButton.style.borderRadius = '6px'
  copyButton.style.fontSize = '12px'
  copyButton.style.cursor = 'pointer'
  copyButton.addEventListener('click', () => copySafely(node))

  actions.appendChild(learnButton)
  actions.appendChild(copyButton)
}

function clearOutputBanner(node: HTMLElement) {
  const existing = node.querySelector('[data-checkred-warning]')
  if (existing) existing.remove()
}

async function copySafely(node: Element) {
  const text = node.textContent ?? ''
  if (!text.trim()) return
  const cleaned = text
    .replace(dangerousCommand, '')
    .replace(secretToken, '[REDACTED]')

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(cleaned)
    } else {
      const temp = document.createElement('textarea')
      temp.value = cleaned
      document.body.appendChild(temp)
      temp.select()
      document.execCommand('copy')
      temp.remove()
    }
    window.dispatchEvent(
      new CustomEvent('checkred:coach', {
        detail: { type: 'success', title: 'Copied safely', message: 'Sanitized content copied without risky commands.' },
      }),
    )
  } catch (error) {
    console.error('[Checkred AI Security] copySafely failed', error)
    window.dispatchEvent(
      new CustomEvent('checkred:coach', {
        detail: {
          type: 'error',
          title: 'Copy failed',
          message: 'Looks like our systems were too cautious. Thanks for flagging—this helps us improve.',
        },
      }),
    )
  }
}
