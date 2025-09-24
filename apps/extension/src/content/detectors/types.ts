export type DetectorCategory =
  | 'PII'
  | 'Secrets'
  | 'SourceCode'
  | 'PromptInjection'
  | 'TokenLimit'
  | 'Language'

export interface DetectorHit {
  id: string
  label: string
  category: DetectorCategory
  match: string
  start: number
  end: number
  metadata?: Record<string, unknown>
}

export interface DetectorStats {
  zeroWidthCount: number
  bidiCount: number
  hiddenSegmentCount: number
  tokenEstimate: number
  tokenRatio: number
  tokenMax: number
  promptLength: number
  languageAllow: string[]
  violations: string[]
}

export interface DetectorSummary {
  categories: Set<DetectorCategory>
  hits: DetectorHit[]
  stats: DetectorStats
  hasPII: boolean
  hasSecrets: boolean
  hasCode: boolean
  hasInvisibleText: boolean
  promptInjection: boolean
  tokenLimitReached: boolean
  languageViolation: boolean
}

export interface DetectorOptions {
  zeroWidthCount: number
  bidiCount: number
  hiddenSegments: string[]
  languageAllow?: string[]
  tokenBudget?: {
    threshold: number
    maxTokens: number
  }
}
