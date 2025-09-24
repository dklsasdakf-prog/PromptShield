const AVG_TOKENS_PER_WORD = 0.75

export function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean)
  return Math.round(words.length / AVG_TOKENS_PER_WORD)
}

export function exceedsBudget(text: string, threshold = 0.9, maxTokens = 4000): boolean {
  const est = estimateTokens(text)
  return est / maxTokens >= threshold
}

export function assessBudget(text: string, threshold = 0.9, maxTokens = 4000) {
  const tokens = estimateTokens(text)
  return {
    tokens,
    threshold,
    maxTokens,
    ratio: tokens / maxTokens,
    exceeded: tokens / maxTokens >= threshold,
  }
}
