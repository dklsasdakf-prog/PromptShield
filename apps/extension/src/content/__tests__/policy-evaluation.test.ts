import { describe, expect, it } from 'vitest'

import type { PolicySpec } from '@checkred-ai-security/shared'

import { evaluatePolicy } from '../policy'
import type { DetectorSummary } from '../detectors'
import type { DetectorCategory } from '../detectors/types'

const spec: PolicySpec = {
  version: '1.0',
  rules: [
    { id: 'secrets', category: 'Secrets', action: 'block', scope: ['prompt'] },
    { id: 'pii', category: 'PII', action: 'sanitize', scope: ['prompt'] },
    { id: 'prompt-injection', category: 'PromptInjection', action: 'block', scope: ['prompt'] },
    { id: 'token-limit', category: 'TokenLimit', action: 'warn', scope: ['prompt'], threshold: 0.9 },
    { id: 'language', category: 'Language', action: 'block_if_not_allowed', scope: ['prompt'], allow: ['en'] },
  ],
}

function buildSummary(overrides: Partial<DetectorSummary> = {}): DetectorSummary {
  const categories = overrides.categories ?? new Set<DetectorCategory>()
  const hasCategory = (category: string) => categories.has(category as never)
  const base: DetectorSummary = {
    categories,
    hits: overrides.hits ?? [],
    stats:
      overrides.stats ??
      ({
        zeroWidthCount: 0,
        bidiCount: 0,
        hiddenSegmentCount: 0,
        tokenEstimate: 0,
        tokenRatio: 0,
        tokenMax: 4000,
        promptLength: 0,
        languageAllow: ['en'],
        violations: [],
      } satisfies DetectorSummary['stats']),
    hasPII: overrides.hasPII ?? hasCategory('PII'),
    hasSecrets: overrides.hasSecrets ?? hasCategory('Secrets'),
    hasCode: overrides.hasCode ?? hasCategory('SourceCode'),
    hasInvisibleText: overrides.hasInvisibleText ?? hasCategory('PromptInjection'),
    promptInjection: overrides.promptInjection ?? hasCategory('PromptInjection'),
    tokenLimitReached: overrides.tokenLimitReached ?? hasCategory('TokenLimit'),
    languageViolation: overrides.languageViolation ?? hasCategory('Language'),
  }
  return { ...base, ...overrides }
}

describe('evaluatePolicy', () => {
  it('blocks when secrets are detected regardless of other signals', () => {
    const summary = buildSummary({ categories: new Set(['Secrets', 'PII']) })
    const { action, hits } = evaluatePolicy(spec, summary)
    expect(action).toBe('block')
    expect(hits.find((hit) => hit.id === 'secrets')).toBeTruthy()
  })

  it('sanitizes prompts containing only PII findings', () => {
    const summary = buildSummary({ categories: new Set(['PII']) })
    const { action, hits } = evaluatePolicy(spec, summary)
    expect(action).toBe('sanitize')
    expect(hits.map((hit) => hit.id)).toContain('pii')
  })

  it('blocks prompt injection attempts and invisible text tricks', () => {
    const summary = buildSummary({ categories: new Set(['PromptInjection']) })
    const { action } = evaluatePolicy(spec, summary)
    expect(action).toBe('block')
  })

  it('warns when only the token limit is exceeded', () => {
    const summary = buildSummary({
      categories: new Set(['TokenLimit']),
      stats: {
        zeroWidthCount: 0,
        bidiCount: 0,
        hiddenSegmentCount: 0,
        tokenEstimate: 3800,
        tokenRatio: 0.95,
        tokenMax: 4000,
        promptLength: 0,
        languageAllow: ['en'],
        violations: [],
      },
    })
    const { action } = evaluatePolicy(spec, summary)
    expect(action).toBe('warn')
  })

  it('blocks when language policy is violated', () => {
    const summary = buildSummary({
      categories: new Set(['Language']),
      languageViolation: true,
      stats: {
        zeroWidthCount: 0,
        bidiCount: 0,
        hiddenSegmentCount: 0,
        tokenEstimate: 0,
        tokenRatio: 0,
        tokenMax: 4000,
        promptLength: 0,
        languageAllow: ['en'],
        violations: ['non_english_ratio'],
      },
    })
    const { action } = evaluatePolicy(spec, summary)
    expect(action).toBe('block')
  })

  it('allows prompts with no detector signals', () => {
    const summary = buildSummary()
    const { action, hits } = evaluatePolicy(spec, summary)
    expect(action).toBe('allow')
    expect(hits).toHaveLength(0)
  })
})
