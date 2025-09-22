declare const chrome: any

type PromptResponse =
  | { action: 'allow'; risk: string }
  | { action: 'sanitize'; text: string; risk: string; redactions: number; reasons: string }
  | { action: 'block'; reason: string; risk: string }

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
          displayInlineBanner(textarea, response.reason)
          return
        }

        if (response.action === 'sanitize') {
          textarea.value = response.text
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
        displayInlineBanner(textarea, 'Prompt blocked: guardrail unavailable')
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
              displayInlineBanner(textarea, response.reason)
              return
            }
            if (response.action === 'sanitize') {
              textarea.value = response.text
            }
            form.dataset.promptshieldBypass = 'true'
            ;(event.currentTarget as HTMLElement).dispatchEvent(new MouseEvent('click'))
          })
          .catch((error) => {
            console.error('[PromptShield] submit click failed', error)
            displayInlineBanner(textarea, 'Prompt blocked: guardrail unavailable')
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
          displayInlineBanner(textarea, response.reason)
          return
        }
        if (response.action === 'sanitize') {
          textarea.value = response.text
        }
        dispatchNativeEnter(textarea)
      })
      .catch((error) => {
        console.error('[PromptShield] standalone intercept failed', error)
        displayInlineBanner(textarea, 'Prompt blocked: guardrail unavailable')
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

function displayInlineBanner(target: HTMLElement, message: string) {
  const parent = target.parentElement
  if (!parent) {
    return
  }

  const existing = parent.querySelector('[data-promptshield-banner]') as HTMLElement | null
  if (existing) {
    const messageNode = existing.querySelector('[data-promptshield-banner-message]') as HTMLElement | null
    if (messageNode) {
      messageNode.textContent = message
    }
    return
  }

  const container = document.createElement('div')
  container.dataset.promptshieldBanner = 'true'
  container.setAttribute('role', 'alert')
  container.style.position = 'relative'
  container.style.top = '0'
  container.style.marginBottom = '8px'
  container.style.padding = '8px 12px'
  container.style.border = '1px solid rgba(248, 113, 113, 0.4)'
  container.style.borderRadius = '8px'
  container.style.background = 'rgba(248, 113, 113, 0.12)'
  container.style.color = '#b91c1c'
  container.style.fontSize = '12px'
  container.style.display = 'flex'
  container.style.alignItems = 'center'
  container.style.justifyContent = 'space-between'
  container.style.gap = '8px'

  const textNode = document.createElement('span')
  textNode.dataset.promptshieldBannerMessage = 'true'
  textNode.textContent = message
  container.appendChild(textNode)

  const dismiss = document.createElement('button')
  dismiss.textContent = 'Dismiss'
  dismiss.style.border = 'none'
  dismiss.style.background = 'transparent'
  dismiss.style.cursor = 'pointer'
  dismiss.style.color = '#b91c1c'
  dismiss.style.fontSize = '12px'
  dismiss.addEventListener('click', () => container.remove())

  container.appendChild(dismiss)

  parent.insertBefore(container, target)
}
