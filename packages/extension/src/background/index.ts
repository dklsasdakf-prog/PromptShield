import type { Action, RedactionResult, Risk, TelemetryEvent } from '../../../shared'

const SANCTIONED_HOSTS = new Set(['chat.openai.com', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com'])
const ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAZUlEQVRoge3OMQ0AAAwDoP3/0b1gBB5KsGe0SvhKlCpQqUClApQqUKlApQKVKpQqUKlCpQqUClApQqUKlCpQKUKlCpQqUKlCpQqUClApQqUKlCpQKVKpQqUKlCpQqUCtCL8AtHA1rYv2Y9oAAAAASUVORK5CYII='

const tenantSalts = new Map<string, string>()
let rotatingSalt = createSalt()
let rotatingSaltUpdatedAt = Date.now()
const ROTATING_SALT_TTL = 1000 * 60 * 60 // 1 hour

const telemetryBuffer: TelemetryEvent[] = []

const encoder = new TextEncoder()

type PromptMessage = {
  type: 'PROMPT_SUBMIT'
  prompt: string
  url: string
}

type PromptResponse =
  | { action: 'allow'; risk: Risk }
  | { action: 'sanitize'; text: string; risk: Risk; redactions: number; reasons: string }
  | { action: 'block'; reason: string; risk: Risk }

chrome.runtime.onMessage.addListener((message: PromptMessage, sender, sendResponse) => {
  if (message?.type !== 'PROMPT_SUBMIT') {
    return false
  }

  handlePrompt(message, sender)
    .then((response) => sendResponse(response))
    .catch((error) => {
      console.error('[PromptShield] Sanitizer error', error)
      notify('Prompt blocked', 'Guardrail failure. Prompt sanitized and blocked for safety.')
      sendResponse({ action: 'block', reason: 'Sanitizer error', risk: 'critical' as Risk })
    })

  return true
})

async function handlePrompt(message: PromptMessage, sender: chrome.runtime.MessageSender): Promise<PromptResponse> {
  const { prompt, url } = message
  const urlHost = safeHost(url)

  try {
    const redactionResult = sanitizePrompt(prompt)
    const risk = resolveRisk(redactionResult, urlHost)

    await recordTelemetry({
      prompt,
      urlHost,
      action: redactionResult.redactions > 0 ? 'sanitize' : 'allow',
      risk,
      redactionResult,
      sender,
    })

    if (redactionResult.redactions > 0 && (risk === 'critical' || risk === 'medium')) {
      notify('Prompt sanitized', `${redactionResult.redactions} sensitive tokens redacted`)
      return {
        action: 'sanitize',
        text: redactionResult.sanitized,
        risk,
        redactions: redactionResult.redactions,
        reasons: redactionResult.reasons,
      }
    }

    if (risk === 'critical') {
      notify('Prompt blocked', 'Critical risk detected. Submission blocked by PromptShield.')
      return { action: 'block', reason: 'Critical risk detected', risk }
    }

    if (risk === 'medium') {
      notify('Unsanctioned prompt', `Flagged ${urlHost} for analyst review`)
    }

    return { action: 'allow', risk }
  } catch (error) {
    console.error('[PromptShield] Failed to process prompt', error)
    return { action: 'block', reason: 'Processing failure', risk: 'critical' }
  }
}

function sanitizePrompt(prompt: string): RedactionResult {
  const patterns: Array<{ regex: RegExp; label: string }> = [
    { regex: /sk-[a-zA-Z0-9]{16,}/g, label: 'API key' },
    { regex: /(?:^|\s)[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?=\s|$)/g, label: 'Email address' },
    { regex: /\b\d{3}-\d{2}-\d{4}\b/g, label: 'SSN' },
    { regex: /\b\d{16}\b/g, label: '16-digit number' },
    { regex: /(AKIA|ASIA|ACCA)[A-Z0-9]{16}/g, label: 'AWS access key' },
  ]

  let sanitized = prompt
  let redactions = 0
  const reasons = new Set<string>()

  for (const { regex, label } of patterns) {
    sanitized = sanitized.replace(regex, (match) => {
      redactions += 1
      reasons.add(label)
      return `[REDACTED:${label.toUpperCase()}]`
    })
  }

  return {
    sanitized,
    redactions,
    reasons: reasons.size ? Array.from(reasons).join(', ') : 'No sensitive markers',
  }
}

function resolveRisk(result: RedactionResult, host: string): Risk {
  if (result.redactions > 0) {
    return 'critical'
  }
  if (!SANCTIONED_HOSTS.has(host)) {
    return 'medium'
  }
  return 'low'
}

async function recordTelemetry(options: {
  prompt: string
  urlHost: string
  action: Action
  risk: Risk
  redactionResult: RedactionResult
  sender: chrome.runtime.MessageSender
}) {
  const { prompt, urlHost, action, risk, redactionResult, sender } = options
  const tenantSalt = ensureTenantSalt(urlHost)
  const userTokenSource = sender.tab?.id !== undefined ? `tab-${sender.tab.id}` : 'anonymous'
  const sampleSalt = getRotatingSalt()

  const [userHash, hostHash, sampleHash] = await Promise.all([
    hashWithSalt(userTokenSource, tenantSalt),
    hashWithSalt(urlHost, tenantSalt),
    redactionResult.redactions > 0 ? hashWithSalt(prompt, sampleSalt) : Promise.resolve(undefined),
  ])

  const telemetry: TelemetryEvent = {
    ts: Date.now(),
    userHash,
    hostHash,
    app: urlHost,
    type: 'prompt',
    action,
    risk,
    redactionCount: redactionResult.redactions || undefined,
    sampleHash,
  }

  telemetryBuffer.unshift(telemetry)
  if (telemetryBuffer.length > 200) {
    telemetryBuffer.length = 200
  }
}

function ensureTenantSalt(host: string): string {
  if (!tenantSalts.has(host)) {
    tenantSalts.set(host, createSalt())
  }
  return tenantSalts.get(host) as string
}

function getRotatingSalt(): string {
  if (Date.now() - rotatingSaltUpdatedAt > ROTATING_SALT_TTL) {
    rotatingSalt = createSalt()
    rotatingSaltUpdatedAt = Date.now()
  }
  return rotatingSalt
}

function createSalt(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function hashWithSalt(value: string, salt: string): Promise<string> {
  const data = encoder.encode(`${value}|${salt}`)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(digest))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch (error) {
    console.warn('[PromptShield] Unable to parse URL', url, error)
    return 'unknown'
  }
}

function notify(title: string, message: string) {
  if (!chrome.notifications) {
    console.warn('[PromptShield] Notifications API unavailable')
    return
  }
  chrome.notifications.create({
    type: 'basic',
    title,
    message,
    iconUrl: ICON_DATA_URL,
  })
}

// TODO: expose telemetryBuffer via chrome.runtime message for admin console bridge.
