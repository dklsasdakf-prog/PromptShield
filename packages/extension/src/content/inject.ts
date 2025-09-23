declare const chrome: any

import { dismissPanel, showBlockPanel, showInfoPanel, showSanitizedPanel, coercePanelRisk } from './panel'

type PromptResponse =
  | { action: 'allow'; risk?: string; dryRun?: boolean; wouldHave?: string; reason?: string }
  | { action: 'sanitize'; text: string; risk?: string; redactions: number; reasons: string[] }
  | { action: 'block'; reason: string; risk?: string }

type HookedForm = {
  textarea: HTMLTextAreaElement
  handler: (event: SubmitEvent) => void
}

const hookedForms = new WeakMap<HTMLFormElement, HookedForm>()

const SCAN_INTERVAL_MS = 2000
let scanTimer: number | undefined

instrumentExisting()
observeMutations()
scheduleRescan()

function instrumentExisting() {
  const candidates = Array.from(document.querySelectorAll('textarea')) as HTMLTextAreaElement[]
  candidates.forEach(instrumentTextarea)
}

function observeMutations() {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return
        const element = node as HTMLElement
        if (element.tagName === 'TEXTAREA') {
          instrumentTextarea(element as HTMLTextAreaElement)
        }
        element.querySelectorAll?.('textarea').forEach((textarea) => {
          instrumentTextarea(textarea as HTMLTextAreaElement)
        })
      })
    }
  })

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  })
}

function scheduleRescan() {
  if (scanTimer) {
    clearInterval(scanTimer)
  }
  scanTimer = window.setInterval(instrumentExisting, SCAN_INTERVAL_MS)
}

function instrumentTextarea(textarea: HTMLTextAreaElement) {
  if (textarea.dataset.promptshieldInstrumented === 'true') {
    return
  }

  const form = textarea.form ?? textarea.closest('form')
  if (form) {
    interceptForm(form as HTMLFormElement, textarea)
  } else {
    interceptStandalone(textarea)
  }

  textarea.dataset.promptshieldInstrumented = 'true'
}

function interceptForm(form: HTMLFormElement, textarea: HTMLTextAreaElement) {
  if (hookedForms.has(form)) {
    return
  }

  const handler = (event: SubmitEvent) => {
    if (form.dataset.promptshieldBypass === 'true') {
      delete form.dataset.promptshieldBypass
      return
    }

    const prompt = textarea.value.trim()
    if (!prompt) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    handlePrompt(prompt)
      .then((response) => {
        if (!response) return

        if (response.action === 'block') {
          showBlockPanel({
            target: textarea,
            reason: response.reason,
            risk: coercePanelRisk(response.risk),
            pills: response.reason ? [response.reason] : undefined,
          })
          return
        }

        if (response.action === 'sanitize') {
          textarea.value = response.text
          showSanitizedPanel({
            target: textarea,
            sanitized: response.text,
            redactions: response.redactions,
            reasons: response.reasons,
            risk: coercePanelRisk(response.risk),
          })
        }

        form.dataset.promptshieldBypass = 'true'
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit()
        } else {
          HTMLFormElement.prototype.submit.call(form)
        }
      })
      .catch((error) => {
        console.error('[PromptShield] prompt submission failed', error)
        showBlockPanel({
          target: textarea,
          reason: 'Prompt blocked: guardrail unavailable',
          risk: 'critical',
        })
      })
  }

  form.addEventListener('submit', handler, true)

  const submitButtons = form.querySelectorAll('button[type="submit"],input[type="submit"]')
  submitButtons.forEach((node) => {
    node.addEventListener(
      'click',
      (event) => {
        if (form.dataset.promptshieldBypass === 'true') {
          return
        }
        const prompt = textarea.value.trim()
        if (!prompt) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        handlePrompt(prompt)
          .then((response) => {
            if (!response) return
            if (response.action === 'block') {
              showBlockPanel({
                target: textarea,
                reason: response.reason,
                risk: coercePanelRisk(response.risk),
                pills: response.reason ? [response.reason] : undefined,
              })
              return
            }
            if (response.action === 'sanitize') {
              textarea.value = response.text
              showSanitizedPanel({
                target: textarea,
                sanitized: response.text,
                redactions: response.redactions,
                reasons: response.reasons,
                risk: coercePanelRisk(response.risk),
              })
            }
            form.dataset.promptshieldBypass = 'true'
            ;(event.currentTarget as HTMLElement).dispatchEvent(new MouseEvent('click'))
          })
          .catch((error) => {
            console.error('[PromptShield] submit click failed', error)
            showBlockPanel({
              target: textarea,
              reason: 'Prompt blocked: guardrail unavailable',
              risk: 'critical',
            })
          })
      },
      { capture: true },
    )
  })

  hookedForms.set(form, { textarea, handler })
}

function interceptStandalone(textarea: HTMLTextAreaElement) {
  if (textarea.dataset.promptshieldStandalone === 'true') {
    return
  }

  textarea.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }
    const prompt = textarea.value.trim()
    if (!prompt) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    handlePrompt(prompt)
      .then((response) => {
        if (!response) return
        if (response.action === 'block') {
          showBlockPanel({
            target: textarea,
            reason: response.reason,
            risk: coercePanelRisk(response.risk),
            pills: response.reason ? [response.reason] : undefined,
          })
          return
        }
        if (response.action === 'sanitize') {
          textarea.value = response.text
          showSanitizedPanel({
            target: textarea,
            sanitized: response.text,
            redactions: response.redactions,
            reasons: response.reasons,
            risk: coercePanelRisk(response.risk),
          })
        }
        if (response.dryRun && response.wouldHave) {
          showInfoPanel({
            target: textarea,
            title: 'Policy dry-run',
            message: `Request allowed in dry-run mode. Enforcement would ${response.wouldHave}.`,
            pills: response.reason ? [response.reason] : undefined,
          })
        } else {
          dismissPanel()
        }
        dispatchNativeEnter(textarea)
      })
      .catch((error) => {
        console.error('[PromptShield] standalone intercept failed', error)
        showBlockPanel({
          target: textarea,
          reason: 'Prompt blocked: guardrail unavailable',
          risk: 'critical',
        })
      })
  })

  textarea.dataset.promptshieldStandalone = 'true'
}

async function handlePrompt(prompt: string): Promise<PromptResponse | undefined> {
  try {
    const response = await sendPrompt(prompt)
    return response
  } catch (error) {
    console.error('[PromptShield] runtime error', error)
    return { action: 'block', reason: 'Guardrail handshake failed', risk: 'critical' }
  }
}

function sendPrompt(prompt: string): Promise<PromptResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'PROMPT_SUBMIT', prompt, url: window.location.href }, (response: PromptResponse) => {
      const lastError = chrome.runtime.lastError
      if (lastError) {
        reject(lastError)
        return
      }
      resolve(response)
    })
  })
}

function dispatchNativeEnter(textarea: HTMLTextAreaElement) {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    bubbles: true,
    cancelable: true,
  })
  textarea.dispatchEvent(event)
}
