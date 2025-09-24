import type { DetectorHit } from './types'

export const API_KEY_REGEX = /(sk-[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z\-_]{35}|rk-live-[a-zA-Z0-9]{24})/g
export const PRIVATE_KEY_REGEX = /-----BEGIN (?:RSA|EC|OPENSSH) PRIVATE KEY-----[\s\S]+?-----END (?:RSA|EC|OPENSSH) PRIVATE KEY-----/g
export const JWT_REGEX = /eyJ[a-zA-Z0-9_-]+?\.[a-zA-Z0-9_-]+?\.[a-zA-Z0-9_-]+/g
export const DB_URL_REGEX = /(postgres|mysql|mongodb|redis):\/\/[^\s]+/g

type SecretMatcher = {
  regex: RegExp
  id: string
  label: string
}

const MATCHERS: SecretMatcher[] = [
  { regex: API_KEY_REGEX, id: 'secrets.api_key', label: 'API key' },
  { regex: PRIVATE_KEY_REGEX, id: 'secrets.private_key', label: 'Private key' },
  { regex: JWT_REGEX, id: 'secrets.jwt', label: 'JWT' },
  { regex: DB_URL_REGEX, id: 'secrets.db_url', label: 'Database URL' },
]

function cloneRegex(regex: RegExp): RegExp {
  return new RegExp(regex.source, regex.flags)
}

export function scanSecrets(text: string): DetectorHit[] {
  const hits: DetectorHit[] = []
  MATCHERS.forEach(({ regex, id, label }) => {
    const pattern = cloneRegex(regex)
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text))) {
      hits.push({
        id,
        label,
        category: 'Secrets',
        match: match[0],
        start: match.index,
        end: match.index + match[0].length,
      })
    }
  })
  return hits
}

export function replaceSecrets(text: string, replacer: (match: string) => string): string {
  return MATCHERS.reduce((acc, { regex }) => acc.replace(cloneRegex(regex), replacer), text)
}
