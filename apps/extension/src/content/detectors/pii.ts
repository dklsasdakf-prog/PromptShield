import type { DetectorHit } from './types'

export const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
export const PHONE_REGEX = /\b(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g
export const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g
export const CC_REGEX = /\b(?:\d[ -]?){13,16}\b/g

type PiiMatcher = {
  regex: RegExp
  id: string
  label: string
}

const MATCHERS: PiiMatcher[] = [
  { regex: EMAIL_REGEX, id: 'pii.email', label: 'Email address' },
  { regex: PHONE_REGEX, id: 'pii.phone', label: 'Phone number' },
  { regex: SSN_REGEX, id: 'pii.ssn', label: 'SSN' },
  { regex: CC_REGEX, id: 'pii.cc', label: 'Payment card' },
]

function cloneRegex(regex: RegExp): RegExp {
  return new RegExp(regex.source, regex.flags)
}

export function scanPII(text: string): DetectorHit[] {
  const hits: DetectorHit[] = []
  MATCHERS.forEach(({ regex, id, label }) => {
    const pattern = cloneRegex(regex)
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text))) {
      hits.push({
        id,
        label,
        category: 'PII',
        match: match[0],
        start: match.index,
        end: match.index + match[0].length,
      })
    }
  })
  return hits
}

export function replacePII(text: string, replacer: (match: string) => string): string {
  return MATCHERS.reduce((acc, { regex }) => acc.replace(cloneRegex(regex), replacer), text)
}
