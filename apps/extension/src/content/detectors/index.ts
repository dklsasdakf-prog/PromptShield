import { scanPII } from './pii'
import { scanSecrets } from './secrets'
import { scanCode } from './code'
import { scanInvisibleText } from './invisibleText'
import { assessBudget } from './tokenBudget'
import { assessLanguage } from './language'
import type { DetectorCategory, DetectorHit, DetectorOptions, DetectorSummary } from './types'

const PROMPT_INJECTION_REGEX = /(ignore (?:the )?previous instructions|disregard all prior context|exfiltrate|copy the data|override safety)/gi

const DEFAULT_OPTIONS: DetectorOptions = {
  zeroWidthCount: 0,
  bidiCount: 0,
  hiddenSegments: [],
  languageAllow: ['en'],
  tokenBudget: {
    threshold: 0.9,
    maxTokens: 4000,
  },
}

function cloneRegex(regex: RegExp): RegExp {
  return new RegExp(regex.source, regex.flags)
}

function collectPromptInjectionHits(text: string): DetectorHit[] {
  const hits: DetectorHit[] = []
  const pattern = cloneRegex(PROMPT_INJECTION_REGEX)
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text))) {
    hits.push({
      id: 'prompt_injection.pattern',
      label: 'Prompt injection phrase',
      category: 'PromptInjection',
      match: match[0],
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return hits
}

export function runDetectors(input: string, providedOptions?: Partial<DetectorOptions>): DetectorSummary {
  const options: DetectorOptions = {
    ...DEFAULT_OPTIONS,
    ...providedOptions,
    hiddenSegments: providedOptions?.hiddenSegments ?? DEFAULT_OPTIONS.hiddenSegments,
    languageAllow: providedOptions?.languageAllow ?? DEFAULT_OPTIONS.languageAllow,
    tokenBudget: {
      ...DEFAULT_OPTIONS.tokenBudget!,
      ...(providedOptions?.tokenBudget ?? {}),
    },
  }

  const text = input ?? ''
  const hits: DetectorHit[] = []
  const categories: Set<DetectorCategory> = new Set()

  const piiHits = scanPII(text)
  if (piiHits.length) {
    piiHits.forEach((hit) => categories.add(hit.category))
    hits.push(...piiHits)
  }

  const secretHits = scanSecrets(text)
  if (secretHits.length) {
    secretHits.forEach((hit) => categories.add(hit.category))
    hits.push(...secretHits)
  }

  const codeHits = scanCode(text)
  if (codeHits.length) {
    codeHits.forEach((hit) => categories.add(hit.category))
    hits.push(...codeHits)
  }

  const invisibleHits = scanInvisibleText(options.zeroWidthCount, options.bidiCount, options.hiddenSegments)
  if (invisibleHits.length) {
    invisibleHits.forEach((hit) => categories.add(hit.category))
    hits.push(...invisibleHits)
  }

  const injectionHits = collectPromptInjectionHits(text)
  if (injectionHits.length) {
    injectionHits.forEach((hit) => categories.add(hit.category))
    hits.push(...injectionHits)
  }

  const threshold = options.tokenBudget?.threshold ?? DEFAULT_OPTIONS.tokenBudget!.threshold
  const maxTokens = options.tokenBudget?.maxTokens ?? DEFAULT_OPTIONS.tokenBudget!.maxTokens
  const budget = assessBudget(text, threshold, maxTokens)
  if (budget.exceeded) {
    categories.add('TokenLimit')
    hits.push({
      id: 'token.limit',
      label: 'Token budget threshold exceeded',
      category: 'TokenLimit',
      match: String(budget.tokens),
      start: 0,
      end: Math.min(text.length, 64),
      metadata: budget,
    })
  }

  const language = assessLanguage(text, options.languageAllow)
  if (language.violated) {
    categories.add('Language')
    hits.push({
      id: 'language.policy',
      label: 'Language policy violation',
      category: 'Language',
      match: text.slice(0, 64),
      start: 0,
      end: Math.min(text.length, 64),
      metadata: { reasons: language.reasons },
    })
  }

  const stats = {
    zeroWidthCount: options.zeroWidthCount,
    bidiCount: options.bidiCount,
    hiddenSegmentCount: options.hiddenSegments.length,
    tokenEstimate: budget.tokens,
    tokenRatio: budget.ratio,
    tokenMax: budget.maxTokens,
    promptLength: text.length,
    languageAllow: options.languageAllow ?? [],
    violations: language.reasons,
  }

  const hasInvisibleText = invisibleHits.some((hit) =>
    hit.id.startsWith('prompt_injection.hidden') || hit.id.includes('zero_width') || hit.id.includes('bidi'),
  )

  return {
    categories,
    hits,
    stats,
    hasPII: categories.has('PII'),
    hasSecrets: categories.has('Secrets'),
    hasCode: categories.has('SourceCode'),
    hasInvisibleText,
    promptInjection: categories.has('PromptInjection'),
    tokenLimitReached: categories.has('TokenLimit'),
    languageViolation: categories.has('Language'),
  }
}

export type { DetectorHit, DetectorOptions, DetectorSummary } from './types'
