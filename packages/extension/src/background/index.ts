import { defaultPolicy, Policy, RedactionResult } from '../../../shared/index'
import { sha256, tokenizeSample, dateKey } from '../../../shared/tokenize'
import { decide } from '../../../shared/policy'
import { evaluateDetectors } from '../../../shared/detectors'

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

const secretRegexes = [
  /sk-[a-zA-Z0-9]{20,}/g,
  /(?i)aws(.{0,10})?(access|secret)_?key[:=]\s*([A-Za-z0-9\/+=]{16,})/g,
  /AIza[0-9A-Za-z\-_]{35}/g,
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b(?:\d[ -]*?){13,19}\b/g
]
function sanitize(text: string): RedactionResult {
  let redactions = 0
  let sanitized = text
  for (const re of secretRegexes) {
    sanitized = sanitized.replace(re, () => { redactions++; return '[REDACTED]' })
  }
  const reasons = redactions ? ['secrets_detected'] : []
  return { sanitized, redactions, reasons }
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
      const sanctioned = allowlist.some((h) => url.hostname.endsWith(h))
      const { sanitized, redactions, reasons } = sanitize(promptText)

      let inferredRisk: 'low' | 'medium' | 'high' | 'critical' = 'low'
      if (redactions > 1) inferredRisk = 'critical'
      else if (redactions === 1) inferredRisk = 'high'
      else if (!sanctioned) inferredRisk = 'medium'
      else if (detectors.financial || detectors.credentials) inferredRisk = 'medium'

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
        userHash: sha256('dev-user'),
        hostHash: sha256(url.hostname),
        app: url.hostname,
        type: 'prompt',
        action,
        risk: eventRisk,
        redactionCount: redactions,
        sampleHash: tokenizeSample(promptText.slice(0, 256), salt),
        dryRun: dry,
      })

      if (dry && decision.action !== 'allow') {
        sendResponse({ action: 'allow', dryRun: true, wouldHave: decision.action, reason: decision.rule?.name })
        return
      }

      if (decision.action === 'block') {
        const reason = decision.rule?.name === 'Block unsanctioned AI'
          ? 'This AI service is not approved. Redirecting to a sanctioned tool.'
          : decision.rule?.name || 'Prompt blocked by policy.'
        if (!dry && decision.rule?.name === 'Block unsanctioned AI' && policy.redirectTo) {
          maybeRedirect(policy.redirectTo)
        }
        sendResponse({ action: 'block', reason })
        return
      }

      if (decision.action === 'sanitize') {
        sendResponse({ action: 'sanitize', text: sanitized, redactions, reasons })
        return
      }

      sendResponse({ action: 'allow' })
      return
    }
    if (msg.type === 'OUTPUT_OBSERVED') {
      const url = new URL(msg.url)
      const outputText = String(msg.text || '')
      const findings = analyzeOutput(outputText)
      const detectorHits = evaluateDetectors(outputText)
      const risk = findings.length ? 'medium' : detectorHits.secrets ? 'high' : 'low'
      await logEvent({
        ts: Date.now(),
        userHash: sha256('dev-user'),
        hostHash: sha256(url.hostname),
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
