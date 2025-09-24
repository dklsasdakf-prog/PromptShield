import { ensureCheckredTheme } from './theme'
import type { HighlightFragment } from './tokenize'

export type PanelRisk = 'low' | 'medium' | 'high' | 'critical' | 'info'

interface PanelAction {
  label: string
  variant?: 'primary' | 'ghost'
  handler: () => void
}

interface HighlightedPreview {
  label: string
  fragments: HighlightFragment[]
}

interface PanelOptions {
  title: string
  message: string
  risk: PanelRisk
  pills?: string[]
  preview?: string
  previewLabel?: string
  highlighted?: HighlightedPreview
  dismissLabel?: string
  actions?: PanelAction[]
  autoDismissMs?: number
  target?: HTMLElement | null
  extraContent?: HTMLElement | null
  onDismiss?: () => void
}

let overlay: HTMLElement | null = null
let highlighted: HTMLElement | null = null
let autoDismissTimer: number | null = null

const overlayId = 'checkred-overlay-root'

function ensureOverlay(): HTMLElement {
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.className = 'checkred-overlay'
    overlay.id = overlayId
    document.body.appendChild(overlay)
  }
  return overlay
}

function highlightTarget(target: HTMLElement | null) {
  if (highlighted && highlighted !== target) {
    highlighted.classList.remove('checkred-highlight')
  }
  if (target) {
    target.classList.add('checkred-highlight')
    highlighted = target
  }
}

function buildBadge(risk: PanelRisk) {
  const badge = document.createElement('span')
  badge.className = 'checkred-badge'
  badge.dataset.risk = risk
  badge.textContent = risk === 'info' ? 'Info' : `${risk.charAt(0).toUpperCase()}${risk.slice(1)} risk`
  return badge
}

function buildPills(pills: string[]) {
  const group = document.createElement('div')
  group.className = 'checkred-pill-group'
  pills.forEach((pill) => {
    if (!pill) return
    const node = document.createElement('span')
    node.className = 'checkred-pill'
    node.textContent = pill.toUpperCase()
    group.appendChild(node)
  })
  return group
}

function buildPreview(preview: string, previewLabel?: string) {
  const wrapper = document.createElement('div')
  wrapper.className = 'checkred-grid'
  if (previewLabel) {
    const label = document.createElement('span')
    label.className = 'checkred-subtle'
    label.textContent = previewLabel
    wrapper.appendChild(label)
  }
  const pre = document.createElement('div')
  pre.className = 'checkred-preview'
  pre.textContent = preview
  wrapper.appendChild(pre)
  return wrapper
}

function buildHighlightedPreview({ label, fragments }: HighlightedPreview) {
  const wrapper = document.createElement('div')
  wrapper.className = 'checkred-grid'
  if (label) {
    const title = document.createElement('span')
    title.className = 'checkred-subtle'
    title.textContent = label
    wrapper.appendChild(title)
  }

  const container = document.createElement('div')
  container.className = 'checkred-preview checkred-preview--inline'
  fragments.forEach((fragment) => {
    if (fragment.kind === 'text') {
      container.appendChild(document.createTextNode(fragment.text))
      return
    }
    const span = document.createElement('span')
    span.className = 'checkred-inline'
    span.dataset.kind = fragment.kind
    span.textContent = fragment.text
    container.appendChild(span)
  })

  wrapper.appendChild(container)
  return wrapper
}

function clearAutoDismiss() {
  if (autoDismissTimer) {
    window.clearTimeout(autoDismissTimer)
    autoDismissTimer = null
  }
}

export function dismissPanel() {
  clearAutoDismiss()
  overlay?.remove()
  overlay = null
  if (highlighted) {
    highlighted.classList.remove('checkred-highlight')
    highlighted = null
  }
}

function renderPanel(options: PanelOptions) {
  ensureCheckredTheme()
  clearAutoDismiss()
  const root = ensureOverlay()
  root.textContent = ''

  const card = document.createElement('section')
  card.className = 'checkred-card'

  const header = document.createElement('header')
  const title = document.createElement('h2')
  title.textContent = options.title
  header.appendChild(title)
  header.appendChild(buildBadge(options.risk))
  card.appendChild(header)

  const body = document.createElement('p')
  body.textContent = options.message
  card.appendChild(body)

  if (options.pills?.length) {
    card.appendChild(buildPills(options.pills))
  }

  if (typeof options.preview === 'string' && options.preview.trim().length > 0) {
    card.appendChild(buildPreview(options.preview, options.previewLabel))
  }

  if (options.highlighted && options.highlighted.fragments.length > 0) {
    card.appendChild(buildHighlightedPreview(options.highlighted))
  }

  if (options.extraContent) {
    card.appendChild(options.extraContent)
  }

  const dismissButton = document.createElement('button')
  dismissButton.className = 'checkred-dismiss'
  dismissButton.type = 'button'
  dismissButton.textContent = options.dismissLabel ?? 'Dismiss'
  const handleDismiss = () => {
    options.onDismiss?.()
    dismissPanel()
  }
  dismissButton.addEventListener('click', handleDismiss)
  card.appendChild(dismissButton)

  if (options.actions?.length) {
    const footer = document.createElement('footer')
    options.actions.forEach((action) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `checkred-button checkred-button--${action.variant ?? 'ghost'}`
      button.textContent = action.label
      button.addEventListener('click', () => {
        try {
          action.handler()
        } finally {
          dismissPanel()
        }
      })
      footer.appendChild(button)
    })
    card.appendChild(footer)
  }

  root.appendChild(card)
  highlightTarget(options.target ?? null)

  if (options.autoDismissMs && options.autoDismissMs > 0) {
    autoDismissTimer = window.setTimeout(handleDismiss, options.autoDismissMs)
  }
}

export function showBlockPanel({
  target,
  reason,
  risk,
  pills,
  onRequestException,
  fragments,
  findingsLabel = 'Detected spans',
}: {
  target?: HTMLElement | null
  reason: string
  risk: PanelRisk
  pills?: string[]
  onRequestException?: () => void
  fragments?: HighlightFragment[]
  findingsLabel?: string
}) {
  const actions: PanelAction[] = []
  if (onRequestException) {
    actions.push({ label: 'Request exception', variant: 'primary', handler: onRequestException })
  }
  renderPanel({
    title: 'Prompt blocked',
    message: reason,
    risk,
    pills,
    dismissLabel: 'Dismiss',
    actions,
    target,
    highlighted: fragments && fragments.length > 0 ? { label: findingsLabel, fragments } : undefined,
  })
}

export function showSanitizedPanel({
  target,
  sanitized,
  redactions,
  reasons,
  risk,
  fragments,
  findingsLabel = 'Flagged spans',
}: {
  target?: HTMLElement | null
  sanitized: string
  redactions: number
  reasons: string[]
  risk: PanelRisk
  fragments?: HighlightFragment[]
  findingsLabel?: string
}) {
  const summary = redactions === 1 ? '1 redaction applied' : `${redactions} redactions applied`
  renderPanel({
    title: 'Prompt sanitized',
    message: `${summary} before submission. Review the safe copy below.`,
    risk,
    pills: reasons,
    preview: sanitized,
    previewLabel: 'Sanitized prompt',
    dismissLabel: 'Close',
    target,
    autoDismissMs: 7000,
    highlighted: fragments && fragments.length > 0 ? { label: findingsLabel, fragments } : undefined,
  })
}

export function showInfoPanel({
  target,
  title,
  message,
  pills,
  autoDismissMs = 5000,
  fragments,
  findingsLabel = 'Detected spans',
}: {
  target?: HTMLElement | null
  title: string
  message: string
  pills?: string[]
  autoDismissMs?: number
  fragments?: HighlightFragment[]
  findingsLabel?: string
}) {
  renderPanel({
    title,
    message,
    risk: 'info',
    pills,
    dismissLabel: 'Dismiss',
    target,
    autoDismissMs,
    highlighted: fragments && fragments.length > 0 ? { label: findingsLabel, fragments } : undefined,
  })
}

export function coercePanelRisk(risk?: string): PanelRisk {
  if (risk === 'low' || risk === 'medium' || risk === 'high' || risk === 'critical') {
    return risk
  }
  return 'medium'
}

export function confirmSanitizePanel({
  target,
  sanitized,
  original,
  redactions,
  reasons,
  risk,
  fragments,
  findingsLabel = 'Sanitized spans',
}: {
  target?: HTMLElement | null
  sanitized: string
  original: string
  redactions: number
  reasons: string[]
  risk: PanelRisk
  fragments?: HighlightFragment[]
  findingsLabel?: string
}): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false
    const resolveOnce = (value: boolean) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    const wrapper = document.createElement('div')
    wrapper.className = 'checkred-diff'

    const originalColumn = document.createElement('div')
    originalColumn.className = 'checkred-diff__column'
    const originalLabel = document.createElement('span')
    originalLabel.className = 'checkred-subtle'
    originalLabel.textContent = 'Original prompt'
    const originalPre = document.createElement('pre')
    originalPre.className = 'checkred-diff__pre'
    originalPre.textContent = original
    originalColumn.appendChild(originalLabel)
    originalColumn.appendChild(originalPre)

    const sanitizedColumn = document.createElement('div')
    sanitizedColumn.className = 'checkred-diff__column'
    const sanitizedLabel = document.createElement('span')
    sanitizedLabel.className = 'checkred-subtle'
    sanitizedLabel.textContent = 'Sanitized prompt'
    const sanitizedPre = document.createElement('pre')
    sanitizedPre.className = 'checkred-diff__pre'
    sanitizedPre.textContent = sanitized
    sanitizedColumn.appendChild(sanitizedLabel)
    sanitizedColumn.appendChild(sanitizedPre)

    wrapper.appendChild(originalColumn)
    wrapper.appendChild(sanitizedColumn)

    renderPanel({
      title: 'Review sanitized prompt',
      message:
        redactions === 1
          ? 'One redaction is required before sending. Confirm to submit the sanitized copy.'
          : `${redactions} redactions are required before sending. Confirm to submit the sanitized copy.`,
      risk,
      pills: reasons,
      preview: undefined,
      dismissLabel: 'Cancel',
      highlighted: fragments && fragments.length > 0 ? { label: findingsLabel, fragments } : undefined,
      extraContent: wrapper,
      onDismiss: () => resolveOnce(false),
      actions: [
        {
          label: 'Send sanitized',
          variant: 'primary',
          handler: () => resolveOnce(true),
        },
      ],
      target,
    })
  })
}
