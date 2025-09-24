import { apiFetch } from '../shared/api'
import { getPolicyConfig } from './policy'

const ENV = typeof process !== 'undefined' && process.env ? process.env : undefined
const runtime = globalThis as {
  CHECKRED_USER_IDENTIFIER?: string
  CHECKRED_USER_EMAIL?: string
  CHECKRED_USER_ID?: string
  CHECKRED_USER?: { id?: string; email?: string }
  CHECKRED_SESSION_ID?: string
}

const SESSION_STORAGE_KEY = 'checkred:session-id'

interface TelemetryCounters {
  prompts_inspected: number
  prompts_violated?: number
  prompts_redacted?: number
}

interface TelemetryPayload {
  event_id: string
  ts: string
  app: string
  action: string
  outcome: string
  risk?: number
  policy_hits?: string[]
  identity?: string
  session_id?: string
  domain?: string
  details?: Record<string, unknown>
  counters?: TelemetryCounters
  idem?: string
}

interface TelemetryContext {
  idemSource?: string
}

async function sha256Hex(message: string): Promise<string> {
  const data = new TextEncoder().encode(message)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

let identityComputed = false
let cachedIdentityHash: string | undefined

function resolveRawIdentity(): string | null {
  if (runtime.CHECKRED_USER_IDENTIFIER) return runtime.CHECKRED_USER_IDENTIFIER
  if (runtime.CHECKRED_USER_ID) return runtime.CHECKRED_USER_ID
  if (runtime.CHECKRED_USER_EMAIL) return runtime.CHECKRED_USER_EMAIL
  if (runtime.CHECKRED_USER) {
    if (runtime.CHECKRED_USER.id) return runtime.CHECKRED_USER.id
    if (runtime.CHECKRED_USER.email) return runtime.CHECKRED_USER.email
  }
  if (ENV?.CHECKRED_USER_IDENTIFIER) return ENV.CHECKRED_USER_IDENTIFIER
  if (ENV?.CHECKRED_USER_ID) return ENV.CHECKRED_USER_ID
  if (ENV?.CHECKRED_USER_EMAIL) return ENV.CHECKRED_USER_EMAIL
  return null
}

async function getIdentityHash(): Promise<string | undefined> {
  if (identityComputed) return cachedIdentityHash
  identityComputed = true
  const rawIdentity = resolveRawIdentity()
  if (!rawIdentity) {
    cachedIdentityHash = undefined
    return cachedIdentityHash
  }
  cachedIdentityHash = await sha256Hex(rawIdentity)
  return cachedIdentityHash
}

let sessionComputed = false
let cachedSessionHash: string | undefined

function ensureSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (existing) return existing
    const generated = crypto.randomUUID()
    sessionStorage.setItem(SESSION_STORAGE_KEY, generated)
    return generated
  } catch {
    return crypto.randomUUID()
  }
}

function resolveRawSession(): string {
  if (runtime.CHECKRED_SESSION_ID) return runtime.CHECKRED_SESSION_ID
  if (ENV?.CHECKRED_SESSION_ID) return ENV.CHECKRED_SESSION_ID
  const identity = resolveRawIdentity()
  if (identity) return `${identity}:${location.hostname}`
  return ensureSessionId()
}

async function getSessionHash(): Promise<string | undefined> {
  if (sessionComputed) return cachedSessionHash
  sessionComputed = true
  const rawSession = resolveRawSession()
  if (!rawSession) {
    cachedSessionHash = undefined
    return cachedSessionHash
  }
  cachedSessionHash = await sha256Hex(rawSession)
  return cachedSessionHash
}

let cachedOrgHash: { value?: string; source: string | null } = { value: undefined, source: null }

async function getOrgHash(orgId: string | null): Promise<string | undefined> {
  if (!orgId) return undefined
  if (cachedOrgHash.source === orgId && cachedOrgHash.value) return cachedOrgHash.value
  cachedOrgHash = { source: orgId, value: await sha256Hex(orgId) }
  return cachedOrgHash.value
}

const SECRET_PATTERNS: RegExp[] = [
  /sk-[a-z0-9]{16,}/i,
  /rk-[a-z0-9]{16,}/i,
  /akia[0-9a-z]{16}/i,
  /(?:(?:\d[ -]?){13,16})/,
  /-----BEGIN [A-Z ]+-----/,
  /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/,
]

function scrubValue(value: unknown): unknown {
  if (typeof value === 'string') {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(value)) {
        return '[REDACTED]'
      }
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map((entry) => scrubValue(entry))
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      next[key] = scrubValue(entry)
    }
    return next
  }
  return value
}

function normalizeCounters(counters?: TelemetryCounters): TelemetryCounters | undefined {
  if (!counters) return undefined
  const inspected = Number.isFinite(counters.prompts_inspected) ? counters.prompts_inspected : 0
  const violated = Number.isFinite(counters.prompts_violated ?? 0) ? counters.prompts_violated ?? 0 : 0
  const redacted = Number.isFinite(counters.prompts_redacted ?? 0) ? counters.prompts_redacted ?? 0 : 0
  return {
    prompts_inspected: Math.max(0, Math.trunc(inspected)),
    prompts_violated: Math.max(0, Math.trunc(violated)),
    prompts_redacted: Math.max(0, Math.trunc(redacted)),
  }
}

export async function sendTelemetry(payload: TelemetryPayload, context: TelemetryContext = {}): Promise<void> {
  try {
    const [policy, identityHash, sessionHash] = await Promise.all([
      getPolicyConfig(),
      getIdentityHash(),
      getSessionHash(),
    ])
    const event: Record<string, unknown> = { ...payload }
    if (!event.domain) {
      event.domain = location.hostname
    }
    if (!event.identity && identityHash) {
      event.identity = identityHash
    }
    if (!event.session_id && sessionHash) {
      event.session_id = sessionHash
    }

    const orgHash = await getOrgHash(policy.org_id)
    const details = event.details ? (scrubValue(event.details) as Record<string, unknown>) : undefined
    if (orgHash) {
      if (details) {
        details.org_hash = orgHash
      } else {
        event.details = { org_hash: orgHash }
      }
    }
    if (details) {
      event.details = details
    }

    if (context.idemSource && !event.idem) {
      event.idem = await sha256Hex(`idem:${context.idemSource}`)
    }

    const normalizedCounters = normalizeCounters(event.counters as TelemetryCounters | undefined)
    if (normalizedCounters) {
      event.counters = normalizedCounters
    }

    const response = await apiFetch('/v1/events/ingest', {
      method: 'POST',
      body: JSON.stringify([event]),
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => `${response.status}`)
      throw new Error(`Telemetry rejected (${response.status}): ${errorText}`)
    }
  } catch (error) {
    console.warn('[Checkred] telemetry send failed', error)
  }
}
