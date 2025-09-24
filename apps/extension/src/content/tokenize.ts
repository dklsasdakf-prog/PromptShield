import { CODE_FENCE_REGEX, SHELL_REGEX, SQL_REGEX } from './detectors/code'
import { CC_REGEX, EMAIL_REGEX, PHONE_REGEX, SSN_REGEX } from './detectors/pii'
import { API_KEY_REGEX, DB_URL_REGEX, JWT_REGEX, PRIVATE_KEY_REGEX } from './detectors/secrets'

export type HighlightKind = 'pii' | 'secret' | 'code'

export interface HighlightMatch {
  kind: HighlightKind
  start: number
  end: number
  text: string
}

export type HighlightFragment =
  | { kind: 'text'; text: string }
  | { kind: HighlightKind; text: string; maskType: MaskType; token?: string; original?: string }

export interface TokenizationResult {
  sanitized: string
  redactions: number
  reasons: string[]
  highlights: HighlightMatch[]
  fragments: HighlightFragment[]
}

type MaskType = 'email' | 'phone' | 'ssn' | 'cc' | 'secret' | 'code'

type MatchKind = HighlightKind

interface RawMatch {
  kind: MatchKind
  start: number
  end: number
  text: string
  maskType: MaskType
}

interface Matcher {
  regex: RegExp
  kind: MatchKind
  maskType: MaskType
}

export interface TokenizeOptions {
  orgId?: string | null
  secret?: string
}

const PRIORITY: Record<MatchKind, number> = {
  secret: 3,
  pii: 2,
  code: 1,
}

const MATCHERS: Matcher[] = [
  { regex: EMAIL_REGEX, kind: 'pii', maskType: 'email' },
  { regex: PHONE_REGEX, kind: 'pii', maskType: 'phone' },
  { regex: SSN_REGEX, kind: 'pii', maskType: 'ssn' },
  { regex: CC_REGEX, kind: 'pii', maskType: 'cc' },
  { regex: API_KEY_REGEX, kind: 'secret', maskType: 'secret' },
  { regex: PRIVATE_KEY_REGEX, kind: 'secret', maskType: 'secret' },
  { regex: JWT_REGEX, kind: 'secret', maskType: 'secret' },
  { regex: DB_URL_REGEX, kind: 'secret', maskType: 'secret' },
  { regex: CODE_FENCE_REGEX, kind: 'code', maskType: 'code' },
  { regex: SQL_REGEX, kind: 'code', maskType: 'code' },
  { regex: SHELL_REGEX, kind: 'code', maskType: 'code' },
]

const KEY_CACHE = new Map<string, Promise<CryptoKey>>()

function cloneRegex(regex: RegExp): RegExp {
  return new RegExp(regex.source, regex.flags)
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function crc16(value: string): number {
  let crc = 0xffff
  for (let i = 0; i < value.length; i += 1) {
    crc ^= value.charCodeAt(i) << 8
    for (let j = 0; j < 8; j += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021
      } else {
        crc <<= 1
      }
      crc &= 0xffff
    }
  }
  return crc & 0xffff
}

function formatToken(hex: string): string {
  const prefix = hex.slice(0, 8)
  const checksum = crc16(hex).toString(16).padStart(4, '0')
  return `tok:${prefix}-${checksum}`
}

async function getHmacKey(options: TokenizeOptions): Promise<CryptoKey> {
  const scope = options.secret ?? options.orgId ?? 'public'
  if (!KEY_CACHE.has(scope)) {
    const material = new TextEncoder().encode(`checkred::tokenizer::${scope}`)
    KEY_CACHE.set(
      scope,
      crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
    )
  }
  return KEY_CACHE.get(scope) as Promise<CryptoKey>
}

async function digestForFragment(fragment: Extract<HighlightFragment, { kind: HighlightKind }>, options: TokenizeOptions) {
  const key = await getHmacKey(options)
  const value = fragment.original ?? fragment.text
  const payload = new TextEncoder().encode(`${fragment.maskType}:${value}`)
  const signature = await crypto.subtle.sign('HMAC', key, payload)
  return bufferToHex(signature)
}

function maskDigits(input: string, hex: string): string {
  let index = 0
  return input.replace(/\d/g, () => {
    const mapped = parseInt(hex.slice(index, index + 2), 16) % 10
    index = (index + 2) % hex.length
    return mapped.toString()
  })
}

function maskEmail(value: string, token: string): string {
  const [user = '', domain = ''] = value.split('@')
  if (!domain) return token
  if (!user) return `${token}@${domain}`
  return `${token}@${domain}`
}

function applyMask(fragment: Extract<HighlightFragment, { kind: HighlightKind }>, token: string, hex: string): string {
  const source = fragment.original ?? fragment.text
  switch (fragment.maskType) {
    case 'email':
      return maskEmail(source, token)
    case 'phone':
    case 'ssn':
    case 'cc':
      return maskDigits(source, hex)
    case 'secret':
      return token
    case 'code':
      return '[CODE BLOCK]'
    default:
      return '[REDACTED]'
  }
}

function collectMatches(text: string): RawMatch[] {
  const matches: RawMatch[] = []
  MATCHERS.forEach(({ regex, kind, maskType }) => {
    const pattern = cloneRegex(regex)
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text))) {
      matches.push({
        kind,
        maskType,
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
      })
    }
  })
  return matches
}

function resolveHighlights(text: string, raw: RawMatch[]): { matches: RawMatch[]; fragments: HighlightFragment[] } {
  if (!raw.length) {
    return {
      matches: [],
      fragments: [{ kind: 'text', text }],
    }
  }

  const coverage: Array<RawMatch | null> = new Array(text.length).fill(null)
  raw.forEach((match) => {
    for (let i = match.start; i < match.end; i += 1) {
      const current = coverage[i]
      if (!current || PRIORITY[match.kind] > PRIORITY[current.kind]) {
        coverage[i] = match
      }
    }
  })

  const matches: RawMatch[] = []
  const fragments: HighlightFragment[] = []
  let cursor = 0

  while (cursor < text.length) {
    const token = coverage[cursor]
    if (!token) {
      const start = cursor
      while (cursor < text.length && coverage[cursor] === null) {
        cursor += 1
      }
      fragments.push({ kind: 'text', text: text.slice(start, cursor) })
      continue
    }

    const start = cursor
    while (cursor < text.length && coverage[cursor] === token) {
      cursor += 1
    }
    const end = cursor
    const segment: RawMatch = {
      kind: token.kind,
      maskType: token.maskType,
      start,
      end,
      text: text.slice(start, end),
    }
    matches.push(segment)
    fragments.push({ kind: segment.kind, text: segment.text, maskType: segment.maskType, original: segment.text })
  }

  return { matches, fragments }
}

export async function tokenizeSensitive(
  text: string,
  reasonHints: string[],
  options: TokenizeOptions = {},
): Promise<TokenizationResult> {
  const collected = collectMatches(text)
  const { matches, fragments } = resolveHighlights(text, collected)
  const reasons = new Set<string>()

  let sanitized = ''
  let redactions = 0

  for (const fragment of fragments) {
    if (fragment.kind === 'text') {
      sanitized += fragment.text
      continue
    }

    redactions += 1
    reasons.add(fragment.kind)
    const hex = await digestForFragment(fragment, options)
    const token = formatToken(hex)
    const replacement = applyMask(fragment, token, hex)
    sanitized += replacement
    fragment.token = token
    fragment.text = replacement
  }

  if (reasonHints.includes('secrets')) {
    sanitized = '[REDACTED]'
    reasons.add('secret')
    if (redactions === 0) {
      redactions = 1
    }
  }

  const highlights: HighlightMatch[] = matches.map(({ kind, start, end, text: value }) => ({
    kind,
    start,
    end,
    text: value,
  }))

  return {
    sanitized,
    redactions,
    reasons: Array.from(reasons),
    highlights,
    fragments,
  }
}
