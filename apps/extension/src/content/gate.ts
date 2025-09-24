import { collectVisibleText } from './domShield'
import type { DetectorSummary } from './detectors'
import { analysePrompt, getPolicyConfig, resetPolicyCache as resetPolicyConfigCache, type PolicyRuleHit } from './policy'
import type { HighlightFragment, HighlightMatch, TokenizationResult } from './tokenize'
import { tokenizeSensitive } from './tokenize'

interface BaseDecision {
  action: 'allow' | 'warn' | 'block' | 'sanitize'
  summary: DetectorSummary
  highlights: HighlightMatch[]
  fragments: HighlightFragment[]
  reasons: string[]
  ruleHits: PolicyRuleHit[]
}

export type GateDecision =
  | (BaseDecision & { action: 'allow'; sanitizedText?: undefined; redactions?: undefined })
  | (BaseDecision & { action: 'warn'; sanitizedText?: undefined; redactions?: undefined })
  | (BaseDecision & { action: 'block'; sanitizedText?: undefined; redactions?: undefined })
  | (BaseDecision & { action: 'sanitize'; sanitizedText: string; redactions: number })

function summaryHas(summary: DetectorSummary, category: 'PII' | 'Secrets' | 'SourceCode' | 'PromptInjection' | 'TokenLimit' | 'Language'): boolean {
  return summary.categories.has(category)
}

function deriveRisk(summary: DetectorSummary) {
  if (summaryHas(summary, 'Secrets') || summaryHas(summary, 'PromptInjection')) return 'critical'
  if (summaryHas(summary, 'PII') || summaryHas(summary, 'SourceCode')) return 'high'
  if (summaryHas(summary, 'TokenLimit') || summaryHas(summary, 'Language')) return 'medium'
  return 'low'
}

function collectReasonTags(
  summary: DetectorSummary,
  tokenized: TokenizationResult | null,
  ruleHits: PolicyRuleHit[],
): string[] {
  const tags = new Set<string>(tokenized?.reasons ?? [])
  if (summaryHas(summary, 'Secrets')) tags.add('secret')
  if (summaryHas(summary, 'PII')) tags.add('pii')
  if (summaryHas(summary, 'SourceCode')) tags.add('code')
  if (summaryHas(summary, 'PromptInjection')) tags.add('prompt_injection')
  if (summary.stats.zeroWidthCount > 0 || summary.stats.hiddenSegmentCount > 0 || summary.stats.bidiCount > 0) {
    tags.add('invisible_text')
  }
  if (summaryHas(summary, 'TokenLimit')) tags.add('token_limit')
  if (summaryHas(summary, 'Language')) tags.add('language_violation')
  ruleHits.forEach((hit) => tags.add(`rule:${hit.id}`))
  return Array.from(tags)
}

function ensureTokenizedFragments(tokenized: TokenizationResult | null, fallbackText: string): {
  highlights: HighlightMatch[]
  fragments: HighlightFragment[]
  redactions: number
  reasons: string[]
} {
  if (!tokenized) {
    return {
      highlights: [],
      fragments: [{ kind: 'text', text: fallbackText }],
      redactions: 0,
      reasons: [],
    }
  }
  return {
    highlights: tokenized.highlights,
    fragments: tokenized.fragments,
    redactions: tokenized.redactions,
    reasons: tokenized.reasons,
  }
}

export async function runGatePipeline(prompt: string, element?: HTMLElement): Promise<GateDecision> {
  const domResult = element
    ? collectVisibleText(element)
    : { text: '', zeroWidthCount: 0, bidiCount: 0, removedSegments: [] }
  const normalized = domResult.text?.length ? domResult.text : prompt
  const policyConfig = await getPolicyConfig()
  const evaluation = await analysePrompt(normalized, {
    zeroWidthCount: domResult.zeroWidthCount,
    bidiCount: domResult.bidiCount,
    hiddenSegments: domResult.removedSegments,
    spec: policyConfig.policy_pack,
  })

  const categoriesThatRequireTokenization: Array<'PII' | 'Secrets' | 'SourceCode'> = ['PII', 'Secrets', 'SourceCode']
  const shouldTokenize = categoriesThatRequireTokenization.some((category) => summaryHas(evaluation.summary, category))
  const hints: string[] = []
  if (summaryHas(evaluation.summary, 'Secrets')) hints.push('secrets')
  const tokenized = shouldTokenize ? await tokenizeSensitive(normalized, hints, { orgId: policyConfig.org_id ?? undefined }) : null
  const { highlights, fragments, redactions, reasons: tokenizedReasons } = ensureTokenizedFragments(tokenized, normalized)
  const reasonTags = collectReasonTags(evaluation.summary, tokenized, evaluation.ruleHits)

  if (evaluation.action === 'block') {
    return {
      action: 'block',
      summary: evaluation.summary,
      highlights,
      fragments,
      reasons: reasonTags.length ? reasonTags : ['policy_block'],
      ruleHits: evaluation.ruleHits,
    }
  }

  if (evaluation.action === 'warn') {
    return {
      action: 'warn',
      summary: evaluation.summary,
      highlights,
      fragments,
      reasons: reasonTags,
      ruleHits: evaluation.ruleHits,
    }
  }

  if (evaluation.action === 'sanitize') {
    if (tokenized) {
      return {
        action: 'sanitize',
        summary: evaluation.summary,
        sanitizedText: tokenized.sanitized,
        redactions,
        highlights,
        fragments,
        reasons: tokenizedReasons.length
          ? tokenizedReasons
          : collectReasonTags(evaluation.summary, tokenized, evaluation.ruleHits),
        ruleHits: evaluation.ruleHits,
      }
    }
    return {
      action: 'sanitize',
      summary: evaluation.summary,
      sanitizedText: normalized,
      redactions: 0,
      highlights,
      fragments,
      reasons: reasonTags,
      ruleHits: evaluation.ruleHits,
    }
  }

  return {
    action: 'allow',
    summary: evaluation.summary,
    highlights,
    fragments,
    reasons: reasonTags,
    ruleHits: evaluation.ruleHits,
  }
}

export function resetPolicyCache() {
  resetPolicyConfigCache()
}

export { deriveRisk }
