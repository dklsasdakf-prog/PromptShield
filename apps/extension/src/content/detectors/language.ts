const ASCII_REGEX = /[\x00-\x7F]/g

interface LanguageAssessment {
  violated: boolean
  reasons: string[]
}

function computeAsciiRatio(text: string): number {
  if (!text.length) return 1
  const asciiMatches = text.match(ASCII_REGEX)
  return (asciiMatches?.length ?? 0) / text.length
}

export function assessLanguage(text: string, allowList: string[] = ['en']): LanguageAssessment {
  if (!allowList.length) {
    return { violated: false, reasons: [] }
  }

  const asciiRatio = computeAsciiRatio(text)
  const requiresEnglishOnly = allowList.length === 1 && allowList[0] === 'en'

  if (requiresEnglishOnly && asciiRatio < 0.8) {
    return { violated: true, reasons: ['non_english_ratio'] }
  }

  return { violated: false, reasons: [] }
}

export function violatesLanguage(text: string, allowList: string[] = ['en']): boolean {
  return assessLanguage(text, allowList).violated
}
