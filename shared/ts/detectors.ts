export const DETECTOR_GROUPS = {
  secrets: [/sk-[a-zA-Z0-9]{16,}/gi, /(AKIA|ASIA)[A-Z0-9]{16}/g, /AIza[0-9A-Za-z\-_]{20,}/g],
  financial: [/\b(?:\d[ -]?){12,19}\b/g, /routing number/i, /iban[:\s]/i, /swift[:\s]/i],
  credentials: [/(password|passwd|pwd)\s*[:=]\s*\S+/i, /(api[_-]?key|secret)\s*[:=]\s*\S+/i],
  pii: [
    /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
    /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/g, // Phone number
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    /\b\d{2}\/\d{2}\/\d{4}\b/g, // DOB-like date
  ],
  sourceCode: [
    /\b(function|class|const|let|var)\s+\w+/g,
    /\w+\s*=\s*\{[^}]*\}/g,
    /\w+\s*=\s*\[[^\]]*\]/g,
    /if\s*\([^)]*\)\s*\{/g,
    /for\s*\([^)]*\)\s*\{/g,
    /\w+\([^)]*\)\s*\{/g,
  ],
  compliance: [/hipaa/i, /gdpr/i, /pci[-\s]?dss/i, /sox\b/i, /iso\s*27001/i],
} as const

export type DetectorName = keyof typeof DETECTOR_GROUPS
export type DetectorMap = Record<DetectorName, boolean>

export function evaluateDetectors(text: string): DetectorMap {
  const source = text || ''
  const result = {} as DetectorMap

  ;(Object.keys(DETECTOR_GROUPS) as DetectorName[]).forEach((name) => {
    const patterns = DETECTOR_GROUPS[name]
    result[name] = patterns.some((regex) => regex.test(source))
    patterns.forEach((regex) => {
      regex.lastIndex = 0
    })
  })

  return result
}
