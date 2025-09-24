import { defaultPolicySpec, type PolicySpec, type PromptAction } from '@checkred-ai-security/shared'

import { runDetectors, type DetectorSummary, type DetectorOptions } from './detectors'
import {
  canonicalizeConfigPayload,
  fetchPolicyConfig,
  type PolicyConfig,
  verifyConfigSignature,
} from '../shared/policyConfig'

declare const chrome: typeof globalThis.chrome | undefined

export type GateAction = 'allow' | 'sanitize' | 'block' | 'warn'

export interface PolicyRuleHit {
  id: string
  action: PromptAction
  category: string
  message?: string
}

export interface PolicyEvaluationResult {
  action: GateAction
  summary: DetectorSummary
  ruleHits: PolicyRuleHit[]
}

const ACTION_PRIORITY: Record<GateAction, number> = {
  block: 3,
  sanitize: 2,
  warn: 1,
  allow: 0,
}

function mapRuleAction(action: PromptAction): GateAction {
  switch (action) {
    case 'sanitize':
      return 'sanitize'
    case 'warn':
    case 'require-approval':
      return 'warn'
    case 'block':
    case 'block_if_not_allowed':
    case 'redirect':
    case 'isolate':
      return 'block'
    default:
      return 'allow'
  }
}

function ruleMatches(rule: PolicySpec['rules'][number], summary: DetectorSummary): boolean {
  switch (rule.category) {
    case 'PII':
      return summary.categories.has('PII')
    case 'Secrets':
      return summary.categories.has('Secrets')
    case 'SourceCode':
      return summary.categories.has('SourceCode')
    case 'PromptInjection':
      return summary.categories.has('PromptInjection')
    case 'TokenLimit': {
      const threshold = typeof rule.threshold === 'number' ? rule.threshold : 0.9
      return summary.stats.tokenRatio >= threshold
    }
    case 'Language': {
      if (!summary.stats.violations.length) return false
      const allow = rule.allow ?? []
      if (allow.length === 0) {
        return true
      }
      // If only English is allowed, the violations indicate non-English content
      if (allow.length === 1 && allow[0] === 'en') {
        return true
      }
      // When violations are present but additional languages are allow-listed we conservatively warn
      return !allow.includes('wildcard')
    }
    default:
      return false
  }
}

export function evaluatePolicy(spec: PolicySpec, summary: DetectorSummary): {
  action: GateAction
  hits: PolicyRuleHit[]
} {
  const hits: PolicyRuleHit[] = []
  let resolved: GateAction = 'allow'
  let highestPriority = 0

  for (const rule of spec.rules) {
    if (!ruleMatches(rule, summary)) continue
    const gateAction = mapRuleAction(rule.action)
    hits.push({ id: rule.id, action: rule.action, category: rule.category, message: rule.message })

    const priority = ACTION_PRIORITY[gateAction]
    if (priority > highestPriority) {
      highestPriority = priority
      resolved = gateAction
    }
  }

  return { action: resolved, hits }
}

function deriveLanguageAllow(spec: PolicySpec): string[] | undefined {
  const rule = spec.rules.find((r) => r.category === 'Language')
  return rule?.allow
}

function deriveTokenThreshold(spec: PolicySpec): number | undefined {
  const thresholds = spec.rules
    .filter((rule) => rule.category === 'TokenLimit' && typeof rule.threshold === 'number')
    .map((rule) => rule.threshold as number)
  if (!thresholds.length) return undefined
  return Math.min(...thresholds)
}

function buildDetectorOptions(options: {
  zeroWidthCount: number
  bidiCount: number
  hiddenSegments: string[]
  spec: PolicySpec
}): DetectorOptions {
  const languageAllow = deriveLanguageAllow(options.spec)
  const tokenThreshold = deriveTokenThreshold(options.spec)
  return {
    zeroWidthCount: options.zeroWidthCount,
    bidiCount: options.bidiCount,
    hiddenSegments: options.hiddenSegments,
    languageAllow,
    tokenBudget: tokenThreshold
      ? {
          threshold: tokenThreshold,
          maxTokens: 4000,
        }
      : undefined,
  }
}

export async function analysePrompt(
  prompt: string,
  options: {
    zeroWidthCount: number
    bidiCount: number
    hiddenSegments: string[]
    spec: PolicySpec
  },
): Promise<PolicyEvaluationResult> {
  const summary = runDetectors(prompt, buildDetectorOptions(options))
  const evaluation = evaluatePolicy(options.spec, summary)
  return {
    action: evaluation.action,
    summary,
    ruleHits: evaluation.hits,
  }
}

// Policy config caching -----------------------------------------------------

let cachedPolicyConfig: PolicyConfig | null = null
let inflightConfig: Promise<PolicyConfig> | null = null

async function requestPolicyFromBackground(): Promise<PolicyConfig> {
  if (!chrome?.runtime?.id) {
    return fetchPolicyConfig()
  }
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CHECKRED_FETCH_POLICY' })
    if (response && typeof response === 'object' && 'policy_pack' in response) {
      return response as PolicyConfig
    }
  } catch (error) {
    console.warn('[Checkred] background policy request failed', error)
  }
  return fetchPolicyConfig()
}

export async function getPolicyConfig(): Promise<PolicyConfig> {
  if (cachedPolicyConfig) return cachedPolicyConfig
  if (!inflightConfig) {
    inflightConfig = requestPolicyFromBackground()
      .then((config) => {
        if (!config.signature_valid) {
          console.warn('[Checkred] policy signature invalid, reverting to default policy pack')
          const fallback: PolicyConfig = {
            ...config,
            policy_pack: defaultPolicySpec,
            feature_flags: { ...config.feature_flags, tokenization: true, domShield: true },
          }
          cachedPolicyConfig = fallback
          return fallback
        }
        cachedPolicyConfig = config
        return config
      })
      .catch((error) => {
        console.error('[Checkred] policy fetch failed, falling back to defaults', error)
        return fetchPolicyConfig()
      })
      .finally(() => {
        inflightConfig = null
      })
  }
  return inflightConfig
}

export function resetPolicyCache(): void {
  cachedPolicyConfig = null
  if (chrome?.runtime?.id) {
    chrome.runtime.sendMessage({ type: 'CHECKRED_RESET_POLICY' }).catch(() => undefined)
  }
}

export { canonicalizeConfigPayload, verifyConfigSignature }
