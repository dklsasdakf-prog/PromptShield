import { defaultPolicy, Policy, RedactionResult, type Action, type Risk } from '../../../shared/index'
import { sha256, tokenizeSample, dateKey } from '../../../shared/tokenize'
import { decide } from '../../../shared/policy'
import { evaluateDetectors, type DetectorMap } from '../../../shared/detectors'

type CachedDecision = {
  action: Action
  risk: Risk
  reason?: string
  sanitized?: string
  redactions?: number
  reasons?: string[]
  expiresAt: number
}

const DECISION_TTL_MS = 5 * 60 * 1000
const MAX_DECISIONS = 100

const decisionMemory = new Map<string, CachedDecision>()

const riskOrder: Risk[] = ['low', 'medium', 'high', 'critical']
const riskScore = (value: Risk) => riskOrder.indexOf(value)

const redactionPatterns: Array<{ regex: RegExp; reason: string }> = [
  { regex: /sk-[a-zA-Z0-9]{20,}/g, reason: 'secret' },
  { regex: /(AKIA|ASIA)[A-Z0-9]{16}/g, reason: 'secret' },
  { regex: /AIza[0-9A-Za-z\-_]{20,}/g, reason: 'secret' },
  { regex: /\b\d{3}-\d{2}-\d{4}\b/g, reason: 'pii' },
  {
    regex: /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    reason: 'pii',
  },
  { regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, reason: 'pii' },
  { regex: /\b(?:\d[ -]?){12,19}\b/g, reason: 'financial' },
  { regex: /(password|passwd|pwd)\s*[:=]\s*\S+/gi, reason: 'credential' },
]

async function getPolicy(): Promise<Policy> {
  const p = await chrome.storage.sync.get(['ps:policy'])
  return p['ps:policy'] || defaultPolicy
}
async function setPolicy(policy: Policy) { await chrome.storage.sync.set({ 'ps:policy': policy }) }

async function getSalt(): Promise<string> {
  const key = 'ps:salt:'+dateKey()
  const s = await chrome.storage.local.get([key])
  if (s[key]) return s[key]
  const v = crypto.getRandomValues(new Uint32Array(8)).join('-')
  await chrome.storage.local.set({ [key]: v })
  return v
}

function sanitize(text: string): RedactionResult {
  let redactions = 0
  let sanitized = text
  const reasons = new Set<string>()
  for (const { regex, reason } of redactionPatterns) {
    sanitized = sanitized.replace(regex, () => {
      redactions += 1
      reasons.add(reason)
      return '[REDACTED]'
    })
  }
  return { sanitized, redactions, reasons: Array.from(reasons) }
}

function analyzeOutput(text: string) {
  const findings: { type:string; line?:number; message:string; severity:'low'|'medium'|'high'|'critical' }[] = []
  const lines = text.split(/\r?\n/)
  const dangerCmd = /(rm -rf\s+\/|powershell\s+-enc|Invoke-WebRequest|curl\s+.*\|\s+sh)/i
  const urlRe = /https?:\/\/[^\s)]+/ig
  lines.forEach((ln, i)=>{
    if (dangerCmd.test(ln)) findings.push({ type:'dangerous_command', line:i+1, message:'Potentially destructive command found', severity:'high' })
    const urls = ln.match(urlRe)||[]
    urls.forEach(u=>findings.push({ type:'url', line:i+1, message:`Link: ${u}`, severity:'medium' }))
  })
  if (/sk-[a-zA-Z0-9]{20,}/.test(text)) findings.push({ type:'secret_like', message:'API-key like token in output', severity:'high' })
  return findings
}

async function logEvent(evt: any) {
  /*
   * Privacy by default: only hashed identifiers and tokenized samples are stored.
   * No raw prompts, outputs, or user identifiers are persisted inside extension storage.
   */
  const key = 'ps:events'
  const curr = (await chrome.storage.local.get([key]))[key] || []
  // Cap 10k
  curr.push(evt); if (curr.length > 10000) curr.shift()
  await chrome.storage.local.set({ [key]: curr })
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const policy = await getPolicy()
    const allowlist = policy.allowlist || defaultPolicy.allowlist!
    if (msg.type === 'PROMPT_SUBMIT') {
      const url = new URL(msg.url)
      const promptText = String(msg.prompt || '')
      const detectors = evaluateDetectors(promptText)
      const fingerprint = await fingerprintPrompt(promptText)
      const cached = recallDecision(fingerprint)
      if (cached) {
        sendResponse(mapCachedToResponse(cached))
        return
      }
      const sanctioned = allowlist.some((h) => url.hostname.endsWith(h))
      const { sanitized, redactions, reasons } = sanitize(promptText)

      const inferredRisk = deriveRisk({ detectors, redactions, sanctioned })

      const ctx = {
        app: url.hostname,
        host: url.hostname,
        allowlist,
        secretsFound: redactions > 0,
        risk: inferredRisk,
        detectors,
      }

      const decision = decide(policy, ctx)
      const dry = Boolean(policy.dryRun)
      const action = dry ? 'allow' : decision.action
      const eventRisk = decision.rule?.riskLevel ?? inferredRisk
      const salt = await getSalt()
      await logEvent({
        ts: Date.now(),
        userHash: await sha256('dev-user'),
        hostHash: await sha256(url.hostname),
        app: url.hostname,
        type: 'prompt',
        action,
        risk: eventRisk,
        redactionCount: redactions,
        sampleHash: await tokenizeSample(promptText.slice(0, 256), salt),
        dryRun: dry,
      })

      rememberDecision(fingerprint, {
        action,
        risk: eventRisk,
        reason: decision.rule?.name || reasons[0],
        sanitized: decision.action === 'sanitize' ? sanitized : undefined,
        redactions,
        reasons,
      })

      if (dry && decision.action !== 'allow') {
        sendResponse({
          action: 'allow',
          dryRun: true,
          wouldHave: decision.action,
          reason: decision.rule?.name,
          risk: eventRisk,
        })
        return
      }

      if (decision.action === 'block') {
        const reason = decision.rule?.name === 'Block unsanctioned AI'
          ? 'This AI service is not approved. Redirecting to a sanctioned tool.'
          : decision.rule?.name || 'Prompt blocked by policy.'
        if (!dry && decision.rule?.name === 'Block unsanctioned AI' && policy.redirectTo) {
          maybeRedirect(policy.redirectTo)
        }
        sendResponse({ action: 'block', reason, risk: eventRisk })
        return
      }

      if (decision.action === 'sanitize') {
        sendResponse({ action: 'sanitize', text: sanitized, redactions, reasons, risk: eventRisk })
        return
      }

      sendResponse({ action: 'allow', risk: eventRisk })
      return
    }
    if (msg.type === 'OUTPUT_OBSERVED') {
      const url = new URL(msg.url)
      const outputText = String(msg.text || '')
      const findings = analyzeOutput(outputText)
      const detectorHits = evaluateDetectors(outputText)
      const risk = deriveRisk({ detectors: detectorHits, redactions: 0, sanctioned: true, findingsCount: findings.length })
      await logEvent({
        ts: Date.now(),
        userHash: await sha256('dev-user'),
        hostHash: await sha256(url.hostname),
        app: url.hostname,
        type: 'output',
        action: 'allow',
        risk,
        findings,
      })
      sendResponse({ warnings: findings })
      return
    }
    // Admin bridge messages
    if (msg.type === 'PS_GET_POLICY') sendResponse(await getPolicy())
    if (msg.type === 'PS_SET_POLICY') { await setPolicy(msg.policy); sendResponse({ ok:true }); return }
    if (msg.type === 'PS_EXPORT_EVENTS') {
      const rows = (await chrome.storage.local.get(['ps:events']))['ps:events']||[]
      const ndjson = rows.map((r:any)=>JSON.stringify(r)).join('\n')
      sendResponse({ ndjson })
      return
    }
    if (msg.type === 'PS_DSR_PURGE') {
      await purgeStorage()
      sendResponse({ ok: true })
      return
    }
  })()
  return true
})

function maybeRedirect(target: string) {
  if (!target) return
  try {
    const url = new URL(target)
    const result = chrome.tabs.create({ url: url.toString() })
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      ;(result as Promise<unknown>).catch(() => {})
    }
  } catch (error) {
    console.warn('[PromptShield] Redirect target invalid', error)
  }
}

async function purgeStorage() {
  const localAll = await chrome.storage.local.get(null)
  const syncAll = await chrome.storage.sync.get(null)
  const localKeys = Object.keys(localAll).filter((key) => key.startsWith('ps:'))
  const syncKeys = Object.keys(syncAll).filter((key) => key.startsWith('ps:'))
  if (localKeys.length) await chrome.storage.local.remove(localKeys)
  if (syncKeys.length) await chrome.storage.sync.remove(syncKeys)
}

function deriveRisk({
  detectors,
  redactions,
  sanctioned,
  findingsCount = 0,
}: {
  detectors: DetectorMap
  redactions: number
  sanctioned: boolean
  findingsCount?: number
}): Risk {
  let highest: Risk = 'low'

  const promote = (value: Risk) => {
    if (riskScore(value) > riskScore(highest)) {
      highest = value
    }
  }

  if (redactions >= 2) promote('critical')
  else if (redactions === 1) promote('high')

  if (detectors.secrets) promote('critical')
  if (detectors.financial || detectors.credentials) promote('high')
  if (detectors.pii) promote('high')
  if (detectors.sourceCode) promote('medium')
  if (detectors.compliance) promote('medium')

  if (!sanctioned) promote('medium')
  if (findingsCount > 0) promote('medium')

  return highest
}

async function fingerprintPrompt(text: string) {
  return sha256(`${dateKey()}::${text}`)
}

function rememberDecision(fingerprint: string, record: Omit<CachedDecision, 'expiresAt'>) {
  const entry: CachedDecision = {
    ...record,
    expiresAt: Date.now() + DECISION_TTL_MS,
  }
  decisionMemory.set(fingerprint, entry)

  if (decisionMemory.size > MAX_DECISIONS) {
    const oldestKey = decisionMemory.keys().next().value as string | undefined
    if (oldestKey) {
      decisionMemory.delete(oldestKey)
    }
  }
}

function recallDecision(fingerprint: string): CachedDecision | null {
  const cached = decisionMemory.get(fingerprint)
  if (!cached) return null
  if (cached.expiresAt < Date.now()) {
    decisionMemory.delete(fingerprint)
    return null
  }
  return cached
}

function mapCachedToResponse(record: CachedDecision) {
  if (record.action === 'block') {
    return {
      action: 'block' as const,
      reason: record.reason ?? 'Prompt blocked by policy.',
      risk: record.risk,
    }
  }
  if (record.action === 'sanitize') {
    return {
      action: 'sanitize' as const,
      text: record.sanitized ?? '',
      redactions: record.redactions ?? 0,
      reasons: record.reasons ?? [],
      risk: record.risk,
    }
  }
  return {
    action: 'allow' as const,
    risk: record.risk,
  }
}
