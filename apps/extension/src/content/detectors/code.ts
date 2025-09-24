import type { DetectorHit } from './types'

export const CODE_FENCE_REGEX = /```[\s\S]*?```/g
export const SQL_REGEX = /\b(SELECT|INSERT|DELETE|UPDATE|DROP|ALTER|CREATE)\b[\s\S]+?;/gi
export const SHELL_REGEX = /(rm\s+-rf|curl\s+[^\s]+\s*\|\s*sh|sudo\s+[^\s]+)/gi

type CodeMatcher = {
  regex: RegExp
  id: string
  label: string
}

const MATCHERS: CodeMatcher[] = [
  { regex: CODE_FENCE_REGEX, id: 'code.block', label: 'Code block' },
  { regex: SQL_REGEX, id: 'code.sql', label: 'SQL statement' },
  { regex: SHELL_REGEX, id: 'code.shell', label: 'Shell command' },
]

function cloneRegex(regex: RegExp): RegExp {
  return new RegExp(regex.source, regex.flags)
}

export function scanCode(text: string): DetectorHit[] {
  const hits: DetectorHit[] = []
  MATCHERS.forEach(({ regex, id, label }) => {
    const pattern = cloneRegex(regex)
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text))) {
      hits.push({
        id,
        label,
        category: 'SourceCode',
        match: match[0],
        start: match.index,
        end: match.index + match[0].length,
      })
    }
  })
  return hits
}
