import type { DetectorHit } from './types'

export function scanInvisibleText(
  zeroWidthCount: number,
  bidiCount: number,
  hiddenSegments: string[],
): DetectorHit[] {
  const hits: DetectorHit[] = []

  if (zeroWidthCount > 0) {
    hits.push({
      id: 'prompt_injection.zero_width',
      label: 'Zero-width characters',
      category: 'PromptInjection',
      match: String(zeroWidthCount),
      start: -1,
      end: -1,
      metadata: { count: zeroWidthCount },
    })
  }

  if (bidiCount > 0) {
    hits.push({
      id: 'prompt_injection.bidi',
      label: 'BiDi control characters',
      category: 'PromptInjection',
      match: String(bidiCount),
      start: -1,
      end: -1,
      metadata: { count: bidiCount },
    })
  }

  hiddenSegments.slice(0, 5).forEach((segment, index) => {
    hits.push({
      id: `prompt_injection.hidden_${index}`,
      label: 'Hidden text segment',
      category: 'PromptInjection',
      match: segment,
      start: -1,
      end: -1,
    })
  })

  return hits
}
