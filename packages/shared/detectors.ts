export const DETECTOR_GROUPS = {
  secrets: [/sk-[a-zA-Z0-9]{16,}/gi, /(AKIA|ASIA)[A-Z0-9]{16}/g, /AIza[0-9A-Za-z\-_]{20,}/g],
  financial: [/\b(?:\d[ -]?){12,19}\b/g, /routing number/i, /iban[:\s]/i],
  credentials: [/(password|passwd|pwd)\s*[:=]\s*\S+/i, /(api[_-]?key|secret)\s*[:=]\s*\S+/i],
} as const

export type DetectorName = keyof typeof DETECTOR_GROUPS
export type DetectorMap = Record<DetectorName, boolean>

export function evaluateDetectors(text: string): DetectorMap {
  const source = text || ''
  const result: DetectorMap = {
    secrets: false,
    financial: false,
    credentials: false,
  }

  (Object.keys(DETECTOR_GROUPS) as DetectorName[]).forEach((name) => {
    const patterns = DETECTOR_GROUPS[name]
    result[name] = patterns.some((regex) => regex.test(source))
    patterns.forEach((regex) => regex.lastIndex = 0)
  })

  return result
}
