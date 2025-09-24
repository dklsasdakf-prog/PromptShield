export interface DomShieldResult {
  text: string
  zeroWidthCount: number
  bidiCount: number
  removedSegments: string[]
}

const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF]/g
const BIDI_REGEX = /[\u202A-\u202E\u2066-\u2069]/g
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const IS_JSDOM = typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent ?? '')

function looksLikeBase64(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length < 32) return false
  if (trimmed.length % 4 !== 0) return false
  if (!BASE64_PATTERN.test(trimmed)) return false
  return !/\s/.test(trimmed)
}

function sanitizeString(value: string): { text: string; zeroWidthRemoved: number; bidiRemoved: number } {
  let zeroWidthRemoved = 0
  let bidiRemoved = 0
  const withoutZeroWidth = value.replace(ZERO_WIDTH_REGEX, () => {
    zeroWidthRemoved += 1
    return ''
  })
  const withoutBidi = withoutZeroWidth.replace(BIDI_REGEX, () => {
    bidiRemoved += 1
    return ''
  })
  return { text: withoutBidi, zeroWidthRemoved, bidiRemoved }
}

function isNearlyInvisible(style: CSSStyleDeclaration, element: HTMLElement, sanitizedText: string): boolean {
  const opacityRaw = style.opacity?.trim() ?? ''
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.visibility === 'collapse' ||
    (opacityRaw !== '' && Number(opacityRaw) === 0)
  ) {
    return true
  }

  const fontSize = parseFloat(style.fontSize || '0')
  if (!Number.isNaN(fontSize) && fontSize > 0 && fontSize <= 1.01) {
    return true
  }

  const rect = typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null
  if (!IS_JSDOM && rect && (rect.width <= 1 || rect.height <= 1)) {
    return true
  }

  const color = style.color?.replace(/\s+/g, '').toLowerCase()
  const background = style.backgroundColor?.replace(/\s+/g, '').toLowerCase()
  if (color && background && color === background && color !== 'transparent') {
    return true
  }

  const trimmed = sanitizedText.trim()
  if (!trimmed) {
    return true
  }

  if (looksLikeBase64(trimmed)) {
    return true
  }

  return false
}

export function resolveSurfaceRoot(element: HTMLElement): HTMLElement {
  if (element.matches('[contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"]')) {
    return element
  }

  const codeMirror = element.closest('.CodeMirror') as HTMLElement | null
  if (codeMirror) {
    const codeBody = codeMirror.querySelector<HTMLElement>('.CodeMirror-code')
    if (codeBody) return codeBody
    return codeMirror
  }

  const monaco = element.closest('.monaco-editor') as HTMLElement | null
  if (monaco) {
    const viewLines = monaco.querySelector<HTMLElement>('.view-lines')
    if (viewLines) return viewLines
    const overflow = monaco.querySelector<HTMLElement>('.overflow-guard')
    if (overflow) return overflow
    return monaco
  }

  return element
}

export function isEditorChrome(node: HTMLElement | null): boolean {
  if (!node) return false
  if (node.closest('.CodeMirror-gutters')) return true
  if (node.closest('.monaco-editor .margin')) return true
  if (node.closest('.monaco-editor .view-overlays')) return true
  return false
}

export function collectVisibleText(root: Document | HTMLElement = document): DomShieldResult {
  const removedSegments: string[] = []
  let payload = ''
  let zeroWidthCount = 0
  let bidiCount = 0

  if (typeof window === 'undefined') {
    const { text, zeroWidthRemoved, bidiRemoved } = sanitizeString(
      root instanceof HTMLElement ? root.textContent ?? '' : '',
    )
    return { text, zeroWidthCount: zeroWidthRemoved, bidiCount: bidiRemoved, removedSegments: [] }
  }

  const scope = root instanceof HTMLElement ? resolveSurfaceRoot(root) : root.body
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT)
  let current: Node | null
  while ((current = walker.nextNode())) {
    const textNode = current as Text
    const parent = textNode.parentElement
    if (!parent) continue
    if (isEditorChrome(parent)) {
      removedSegments.push(textNode.textContent ?? '')
      continue
    }

    const style = window.getComputedStyle(parent)
    const { text, zeroWidthRemoved, bidiRemoved } = sanitizeString(textNode.textContent ?? '')
    zeroWidthCount += zeroWidthRemoved
    bidiCount += bidiRemoved

    if (isNearlyInvisible(style, parent, text)) {
      if (textNode.textContent?.trim()) {
        removedSegments.push(textNode.textContent)
      }
      continue
    }

    payload += `${text} `
  }

  const finalSanitized = sanitizeString(payload)
  return {
    text: finalSanitized.text.trim(),
    zeroWidthCount: zeroWidthCount + finalSanitized.zeroWidthRemoved,
    bidiCount: bidiCount + finalSanitized.bidiRemoved,
    removedSegments,
  }
}

// expose for testing
export const __testables__ = {
  looksLikeBase64,
}
