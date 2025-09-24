import { deriveRisk, runGatePipeline, type GateDecision } from './gate'
import { coercePanelRisk, showBlockPanel, showInfoPanel, showSanitizedPanel, confirmSanitizePanel } from './panel'
import { sendTelemetry } from './telemetry'

const PROMPT_EVENT = 'checkred:prompt'
const suppressedSubmissions = new WeakSet<HTMLFormElement>()

function generateEventId() {
  return crypto.randomUUID()
}

function dispatchCoach(type: 'info' | 'success' | 'warning' | 'error', title: string, message: string) {
  window.dispatchEvent(
    new CustomEvent('checkred:coach', {
      detail: { type, title, message },
    }),
  )
}

function readNodeValue(node: HTMLTextAreaElement | HTMLInputElement | HTMLElement): string {
  if ('value' in node) {
    return (node as HTMLInputElement | HTMLTextAreaElement).value ?? ''
  }
  return node.innerText ?? node.textContent ?? ''
}

function writeNodeValue(node: HTMLTextAreaElement | HTMLInputElement | HTMLElement, value: string) {
  if ('value' in node) {
    ;(node as HTMLInputElement | HTMLTextAreaElement).value = value
  } else {
    node.textContent = value
  }
}

function submitForm(form: HTMLFormElement) {
  if (typeof form.requestSubmit === 'function') {
    form.requestSubmit()
  } else {
    form.submit()
  }
}

function formatReason(reason: string) {
  if (reason.startsWith('rule:')) {
    const ruleId = reason.slice(5)
    return `RULE ${ruleId.replace(/_/g, ' ').toUpperCase()}`
  }
  return reason.replace(/_/g, ' ').toUpperCase()
}

function limitFragments(fragments: GateDecision['fragments'], maxCharacters = 360) {
  const limited: typeof fragments = []
  let budget = maxCharacters
  for (const fragment of fragments) {
    if (budget <= 0) break
    const slice = fragment.text.slice(0, budget)
    if (slice.length === fragment.text.length) {
      limited.push(fragment)
    } else if (slice.length > 0) {
      if (fragment.kind === 'text') {
        limited.push({ kind: 'text', text: slice })
      } else {
        limited.push({ ...fragment, text: slice })
      }
    }
    budget -= slice.length
  }
  return limited
}

function blockMessage(reasons: string[]): string {
  if (reasons.includes('secret')) return 'Secrets detected in prompt. Remove sensitive tokens before submitting.'
  if (reasons.includes('prompt_injection')) return 'Prompt injection content detected and blocked.'
  if (reasons.includes('pii')) return 'Personal data detected. Remove PII before submitting.'
  if (reasons.includes('invisible_text')) return 'Hidden or obfuscated text detected. Clear formatting and retry.'
  if (reasons.includes('language_violation')) return 'Prompt violates language policy and cannot be sent.'
  if (reasons.includes('token_limit')) return 'Prompt exceeds policy limits and has been blocked.'
  return 'Prompt blocked by policy. Remove sensitive data and retry.'
}

function sanitizeMessage(reasons: string[]): string {
  if (reasons.includes('pii')) return 'Personal data sanitized before submission.'
  if (reasons.includes('code')) return 'Source code sanitized before submission.'
  if (reasons.includes('secret')) return 'Sensitive tokens sanitized before submission.'
  return 'Prompt sanitized per policy before submission.'
}

function warnMessage(reasons: string[]): string {
  if (reasons.includes('token_limit')) return 'Prompt may exceed the allowed token budget. Proceeding with monitoring.'
  if (reasons.includes('language_violation')) return 'Prompt language is restricted. Proceeding in monitor mode.'
  return 'Prompt requires attention but will be submitted for monitoring.'
}

function buildCounters(outcome: 'allowed' | 'warn' | 'block' | 'sanitize', redactions = 0) {
  const sanitizedRedactions = Math.max(0, redactions)
  return {
    prompts_inspected: 1,
    prompts_violated: outcome === 'allowed' ? 0 : 1,
    prompts_redacted: outcome === 'sanitize' ? sanitizedRedactions : 0,
  }
}

async function handleDecision(
  decision: GateDecision,
  form: HTMLFormElement,
  target: HTMLTextAreaElement | HTMLInputElement | HTMLElement,
  promptText: string,
) {
  const risk = coercePanelRisk(deriveRisk(decision.summary))
  const pills = decision.reasons?.map(formatReason)

  if (decision.action === 'block') {
    const message = blockMessage(decision.reasons ?? [])
    showBlockPanel({
      target,
      reason: message,
      risk,
      pills,
      fragments: limitFragments(decision.fragments),
    })
    dispatchCoach('error', 'Prompt blocked', message)
    await sendTelemetry({
      event_id: generateEventId(),
      ts: new Date().toISOString(),
      app: location.hostname,
      action: 'prompt.preflight.blocked',
      outcome: 'blocked',
      details: { reasons: decision.reasons, rules: decision.ruleHits.map((hit) => hit.id) },
      counters: buildCounters('block'),
    }, { idemSource: promptText })
    return
  }

  if (decision.action === 'sanitize') {
    writeNodeValue(target, decision.sanitizedText)
    const message = sanitizeMessage(decision.reasons ?? [])
    showSanitizedPanel({
      target,
      sanitized: decision.sanitizedText,
      redactions: decision.redactions,
      reasons: pills ?? [],
      risk,
      fragments: limitFragments(decision.fragments),
    })
    dispatchCoach('success', 'Prompt sanitized', message)
    await sendTelemetry({
      event_id: generateEventId(),
      ts: new Date().toISOString(),
      app: location.hostname,
      action: 'prompt.preflight.sanitized',
      outcome: 'sanitized',
      details: { redactions: decision.redactions, reasons: decision.reasons, rules: decision.ruleHits.map((hit) => hit.id) },
      counters: buildCounters('sanitize', decision.redactions),
    }, { idemSource: decision.sanitizedText || promptText })
    suppressedSubmissions.add(form)
    submitForm(form)
    return
  }

  if (decision.action === 'warn') {
    const message = warnMessage(decision.reasons ?? [])
    showInfoPanel({
      target,
      title: 'Prompt warning',
      message,
      pills,
      autoDismissMs: 6000,
      fragments: limitFragments(decision.fragments),
    })
    dispatchCoach('warning', 'Prompt warning', message)
    await sendTelemetry({
      event_id: generateEventId(),
      ts: new Date().toISOString(),
      app: location.hostname,
      action: 'prompt.preflight.warn',
      outcome: 'warn',
      details: { reasons: decision.reasons, rules: decision.ruleHits.map((hit) => hit.id) },
      counters: buildCounters('warn'),
    }, { idemSource: promptText })
    suppressedSubmissions.add(form)
    submitForm(form)
    return
  }

  await sendTelemetry({
    event_id: generateEventId(),
    ts: new Date().toISOString(),
    app: location.hostname,
    action: 'prompt.preflight.allowed',
    outcome: 'allowed',
    details: decision.reasons?.length
      ? { reasons: decision.reasons, rules: decision.ruleHits.map((hit) => hit.id) }
      : undefined,
    counters: buildCounters('allowed'),
  }, { idemSource: promptText })
  suppressedSubmissions.add(form)
  submitForm(form)
}

export function installPromptInterceptors(): void {
  document.addEventListener('submit', async (event) => {
    const form = event.target as HTMLFormElement
    if (!form) return
    if (suppressedSubmissions.has(form)) {
      suppressedSubmissions.delete(form)
      return
    }
    const textarea = form.querySelector(
      'textarea, input[type="text"], input[type="search"], input[type="email"], input[type="url"], input[type="number"], [contenteditable], [role="textbox"], .monaco-editor, .CodeMirror',
    ) as
      | HTMLTextAreaElement
      | HTMLInputElement
      | HTMLElement
      | null
    if (!textarea) return

    const value = readNodeValue(textarea)
    if (!value?.trim()) return

    event.preventDefault()
    event.stopPropagation()
    try {
      const decision = await runGatePipeline(value, textarea instanceof HTMLElement ? textarea : undefined)
      await handleDecision(decision, form, textarea, value)
    } catch (error) {
      console.error('[Checkred] prompt interceptor failed', error)
      suppressedSubmissions.add(form)
      submitForm(form)
    }
  })

  document.addEventListener('paste', async (event) => {
    const text = event.clipboardData?.getData('text')
    if (!text) return
    const decision = await runGatePipeline(text)
    if (decision.action !== 'block') return
    event.preventDefault()
    const message = blockMessage(decision.reasons ?? [])
    showBlockPanel({
      target: null,
      reason: message,
      risk: coercePanelRisk(deriveRisk(decision.summary)),
      pills: decision.reasons?.map(formatReason),
      fragments: limitFragments(decision.fragments),
      findingsLabel: 'Clipboard spans',
    })
    dispatchCoach('error', 'Clipboard blocked', message)
    await sendTelemetry({
      event_id: generateEventId(),
      ts: new Date().toISOString(),
      app: location.hostname,
      action: 'paste.intercept',
      outcome: 'blocked',
      details: { reasons: decision.reasons, rules: decision.ruleHits.map((hit) => hit.id) },
      counters: buildCounters('block'),
    }, { idemSource: text })
  })
}

export function announceInstallation() {
  document.dispatchEvent(new CustomEvent(PROMPT_EVENT))
}
