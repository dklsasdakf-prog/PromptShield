import React, { useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ChevronRight,
  ClipboardCopy,
  CopyCheck,
  Eye,
  FileWarning,
  Filter,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  SquareCode,
  Zap,
} from 'lucide-react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from './security-theme'

type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

interface RiskBadgeProps {
  level: RiskLevel
  score?: number
  condensed?: boolean
}

const riskPalette: Record<RiskLevel, { bg: string; fg: string }> = {
  low: {
    bg: 'bg-green-500/10 text-green-500',
    fg: 'text-green-500',
  },
  medium: {
    bg: 'bg-amber-500/15 text-amber-500',
    fg: 'text-amber-500',
  },
  high: {
    bg: 'bg-orange-500/15 text-orange-500',
    fg: 'text-orange-500',
  },
  critical: {
    bg: 'bg-red-500/15 text-red-500',
    fg: 'text-red-500',
  },
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ level, score, condensed }) => (
  <span
    data-testid="risk-badge"
    aria-label={`risk-${level}${score !== undefined ? `-score-${score}` : ''}`}
    className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs font-medium uppercase shrink-0 w-fit ${riskPalette[level].bg}`}
  >
    <span className="inline-flex h-1 w-1 rounded-full bg-current shrink-0" aria-hidden />
    {condensed ? level[0].toUpperCase() : level}
    {score !== undefined ? <span className="font-normal text-[10px]">{score}</span> : null}
  </span>
)

interface PolicyRule {
  id: string
  name: string
  condition: string
  action: 'allow' | 'block' | 'sanitize' | 'flag'
  enabled: boolean
  riskLevel: RiskLevel
}

const defaultRules: PolicyRule[] = [
  {
    id: 'rule-01',
    name: 'Block SSNs',
    condition: 'prompt.matches(/\\b\\d{3}-\\d{2}-\\d{4}\\b/)',
    action: 'block',
    enabled: true,
    riskLevel: 'critical',
  },
  {
    id: 'rule-02',
    name: 'Sanitize access tokens',
    condition: 'prompt.contains("sk-")',
    action: 'sanitize',
    enabled: true,
    riskLevel: 'high',
  },
]

const actions: Array<PolicyRule['action']> = ['allow', 'block', 'sanitize', 'flag']

export interface VirtualizedTableEvent {
  id: string
  timestamp: string
  app: string
  risk: RiskLevel
  identity: string
  action: string
  preview: string
}

export interface VirtualizedTableProps {
  events: VirtualizedTableEvent[]
}

export const VirtualizedTable: React.FC<VirtualizedTableProps> = ({ events }) => {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const rowHeight = 56
  const height = 280

  const rows = useMemo(() => events, [events])

  const startIndex = Math.floor(scrollTop / rowHeight)
  const visibleCount = Math.ceil(height / rowHeight) + 3
  const visibleRows = rows.slice(startIndex, startIndex + visibleCount)
  const offsetY = startIndex * rowHeight

  const onScroll: React.UIEventHandler<HTMLDivElement> = (event) => {
    setScrollTop((event.currentTarget as HTMLDivElement).scrollTop)
  }

  return (
    <div className="space-y-3" data-testid="virtualized-table">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Live Events</h3>
        <Button size="sm" variant="outline">
          <Filter className="mr-2 h-3.5 w-3.5" aria-hidden />
          Filters
        </Button>
      </div>
      <div
        ref={viewportRef}
        className="relative w-full overflow-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-sm"
        style={{ height }}
        onScroll={onScroll}
        role="table"
        aria-label="Virtualized events table"
      >
        <div className="sticky top-0 z-10 grid grid-cols-[120px,160px,160px,120px,120px,1fr] border-b border-[hsl(var(--border))] bg-[hsla(var(--background),0.9)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          <span>ID</span>
          <span>Timestamp</span>
          <span>App</span>
          <span>Risk</span>
          <span>Identity</span>
          <span>Outcome</span>
        </div>
        <div style={{ height: rows.length * rowHeight }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {visibleRows.map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-[120px,160px,160px,120px,120px,1fr] items-center border-b border-[hsla(var(--border),0.6)] px-4"
                style={{ height: rowHeight }}
                role="row"
              >
                <span className="font-medium text-[hsl(var(--foreground))]">{row.id}</span>
                <span className="text-[hsl(var(--muted-foreground))]">{row.timestamp}</span>
                <span className="font-medium text-[hsl(var(--foreground))]">{row.app}</span>
                <RiskBadge level={row.risk} condensed />
                <span className="text-xs text-[hsl(var(--muted-foreground))] font-medium">{row.identity}</span>
                <span className="text-xs text-[hsl(var(--muted-foreground))] break-words overflow-hidden leading-tight max-w-full">
                  <span className="font-semibold text-[hsl(var(--foreground))]">{row.action}</span>
                  {' • '}
                  <span className="truncate inline-block max-w-[200px]" title={row.preview}>{row.preview}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const PolicyRuleBuilder: React.FC = () => {
  const [rules, setRules] = useState<PolicyRule[]>(defaultRules)
  const [pendingRule, setPendingRule] = useState<Omit<PolicyRule, 'id'>>({
    name: '',
    condition: '',
    action: 'flag',
    enabled: true,
    riskLevel: 'medium',
  })

  const resetForm = () =>
    setPendingRule({
      name: '',
      condition: '',
      action: 'flag',
      enabled: true,
      riskLevel: 'medium',
    })

  const addRule = () => {
    if (!pendingRule.name || !pendingRule.condition) return
    const nextRule: PolicyRule = {
      ...pendingRule,
      id: `rule-${Math.random().toString(36).slice(2, 7)}`,
    }
    setRules((prev) => [nextRule, ...prev])
    resetForm()
  }

  return (
    <Card data-testid="policy-rule-builder">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Layers className="h-5 w-5" aria-hidden />
          Policy Rule Builder
        </CardTitle>
        <CardDescription>
          Compose declarative safeguards that redact secrets before prompts leave the browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label="Rule name"
            placeholder="PII Redaction"
            value={pendingRule.name}
            onChange={(event) => setPendingRule((prev) => ({ ...prev, name: event.target.value }))}
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-[hsl(var(--muted-foreground))]" htmlFor="action-select">
              Action
            </label>
            <select
              id="action-select"
              className="block h-[var(--control-height)] w-full rounded-md border border-[hsl(var(--input))] bg-transparent px-[calc(var(--control-padding-x)-4px)] text-sm"
              value={pendingRule.action}
              onChange={(event) =>
                setPendingRule((prev) => ({ ...prev, action: event.target.value as PolicyRule['action'] }))
              }
            >
              {actions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Input
          label="Condition"
          placeholder="prompt.contains('confidential')"
          value={pendingRule.condition}
          onChange={(event) => setPendingRule((prev) => ({ ...prev, condition: event.target.value }))}
        />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="risk-select" className="text-xs font-medium text-[hsl(var(--muted-foreground))]">
              Risk level
            </label>
            <select
              id="risk-select"
              className="rounded border border-[hsl(var(--input))] bg-transparent px-3 py-1 text-sm"
              value={pendingRule.riskLevel}
              onChange={(event) =>
                setPendingRule((prev) => ({ ...prev, riskLevel: event.target.value as RiskLevel }))
              }
            >
              {(['low', 'medium', 'high', 'critical'] as const).map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
            <RiskBadge level={pendingRule.riskLevel} />
          </div>
          <Button onClick={addRule} size="sm">
            <Zap className="mr-2 h-3.5 w-3.5" aria-hidden />
            Add rule
          </Button>
        </div>
        <div className="space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex flex-col gap-2 rounded-lg border border-[hsla(var(--border),0.9)] bg-[hsla(var(--card),0.6)] p-3 text-xs md:flex-row md:items-center md:justify-between"
            >
              <div className="space-y-1">
                <span className="font-semibold text-[hsl(var(--foreground))]">{rule.name}</span>
                <p className="text-[hsl(var(--muted-foreground))]">{rule.condition}</p>
              </div>
              <div className="flex items-center gap-3">
                <RiskBadge level={rule.riskLevel} condensed />
                <span className="rounded-full border border-[hsl(var(--border))] px-2 py-1 text-[hsl(var(--muted-foreground))]">
                  {rule.action}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export const BannerToastPreview: React.FC = () => {
  const [isToastVisible, setIsToastVisible] = useState(false)

  return (
    <div className="space-y-3" data-testid="banner-toast">
      <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))] bg-[hsla(var(--accent),0.15)] px-4 py-3">
        <div className="flex items-start gap-3">
          <BellRing className="mt-0.5 h-4 w-4 text-[hsl(var(--accent-foreground))]" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
              Detected prompt exfiltration attempt
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Shadow AI session identified. Analysts notified and session isolated for review.
            </p>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setIsToastVisible(true)}>
          View transcript
        </Button>
      </div>
      {isToastVisible ? (
        <div
          className="ml-auto w-full max-w-sm rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-overlay"
          role="alert"
        >
          <div className="flex items-start justify-between gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-[hsl(var(--foreground))]">Transcript scrubbed</p>
              <p className="text-[hsl(var(--muted-foreground))]">
                Sanitized output ready. Review in Trust Zone or escalate for step-up auth.
              </p>
            </div>
            <button
              type="button"
              className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--accent-foreground))]"
              onClick={() => setIsToastVisible(false)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const DiffPreview: React.FC = () => {
  const before = `function handlePrompt(text) {\n  return text\n}`
  const after = `function handlePrompt(text) {\n  const sanitized = redactSecrets(text)\n  return sanitized\n}`
  return (
    <div data-testid="diff-view" className="grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-xs">
        <p className="mb-2 flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
          <FileWarning className="h-4 w-4" aria-hidden />
          Before (prompt)
        </p>
        <pre className="overflow-x-auto rounded-md bg-[hsla(var(--muted),0.6)] p-3 text-[hsl(var(--foreground))]">
          <code>{before}</code>
        </pre>
      </div>
      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 text-xs">
        <p className="mb-2 flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          After (sanitized)
        </p>
        <pre className="overflow-x-auto rounded-md bg-[hsla(var(--muted),0.6)] p-3 text-[hsl(var(--foreground))]">
          <code>{after}</code>
        </pre>
      </div>
    </div>
  )
}

const InlineCodeHighlighter: React.FC = () => {
  const code = `POST /invoke\nAuthorization: Bearer sk-test-123\n\n{"prompt":"Summarize payroll.csv"}`
  return (
    <div data-testid="code-highlighter" className="space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">HTTP trace</span>
        <Button size="sm" variant="ghost">
          <ClipboardCopy className="mr-2 h-3.5 w-3.5" aria-hidden />
          Copy tokenized
        </Button>
      </div>
      <div className="relative rounded-lg border border-[hsl(var(--border))] bg-black/75 p-4 text-[hsl(var(--foreground))]">
        <pre className="text-[0.7rem] leading-5 text-green-200">
          <code>{code}</code>
        </pre>
        <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-1 text-[0.65rem] font-semibold text-red-400">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          Secret detected
        </div>
        <div className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-[hsl(var(--accent))]/15 px-2 py-1 text-[0.65rem] font-semibold text-[hsl(var(--accent-foreground))]">
          <Lock className="h-3 w-3" aria-hidden />
          Tokenized
        </div>
      </div>
    </div>
  )
}

const StepUpAuthModal: React.FC = () => {
  const [open, setOpen] = useState(false)

  return (
    <div data-testid="step-up-auth">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <KeyRound className="mr-2 h-4 w-4" aria-hidden />
        Trigger step-up auth
      </Button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="step-up-title"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6"
        >
          <div className="w-full max-w-md rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-overlay">
            <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-6 py-4">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-500" aria-hidden />
                <h2 id="step-up-title" className="text-sm font-semibold text-[hsl(var(--foreground))]">
                  Step-up authentication required
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-transparent p-1 text-[hsl(var(--muted-foreground))] transition hover:border-[hsl(var(--border))] hover:text-[hsl(var(--foreground))]"
                aria-label="Close modal"
              >
                <ChevronRight className="h-4 w-4 rotate-90" aria-hidden />
              </button>
            </div>
            <div className="space-y-5 px-6 py-5 text-sm">
              <p className="text-[hsl(var(--muted-foreground))]">
                Sensitive policy change detected. Verify analyst identity to proceed with this action.
              </p>
              <div className="space-y-2">
                <label className="text-xs font-medium text-[hsl(var(--muted-foreground))]" htmlFor="otp-input">
                  Verification code
                </label>
                <Input id="otp-input" placeholder="••••••" inputMode="numeric" autoFocus />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button>
                  <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
                  Verify
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const ComponentLibrarySpec: React.FC = () => {
  const demoEvents = useMemo<VirtualizedTableEvent[]>(
    () =>
      Array.from({ length: 140 }).map((_, index) => ({
        id: `evt-${(index + 1).toString().padStart(4, '0')}`,
        timestamp: new Date(Date.now() - index * 42000).toLocaleTimeString(),
        app: ['chat.openai.com', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com'][index % 4],
        risk: ['low', 'medium', 'high', 'critical'][index % 4] as RiskLevel,
        identity: ['alice@company.com', 'bob@company.com', 'charlie@company.com', 'diana@company.com'][index % 4],
        action: ['allow', 'flag', 'sanitize', 'block'][index % 4],
        preview: index % 2 === 0 ? 'tokenized payload' : 'policy baseline',
      })),
    [],
  )

  return (
    <div className="space-y-8" data-testid="component-library-spec">
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <SquareCode className="h-5 w-5" aria-hidden />
            Component Library
          </CardTitle>
          <CardDescription>
            Spec-driven primitives that power PromptShield’s analyst workspace and fail-closed safeguards.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-4 w-4 text-[hsl(var(--accent-foreground))]" aria-hidden />
            <span>Design tokens inherit 21st.dev palette, synced via ThemeProvider.</span>
          </div>
          <div className="flex items-center gap-3">
            <Activity className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden />
            <span>Virtualized tables sustain high-volume telemetry without layout shifts.</span>
          </div>
          <div className="flex items-center gap-3">
            <Eye className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden />
            <span>Inline diff and highlight surfaces show redactions before actioning.</span>
          </div>
        </CardContent>
      </Card>
      <Card className="space-y-4 p-6">
        <CardTitle className="flex items-center gap-2 text-base">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Analyst Flow Snapshot
        </CardTitle>
        <div className="space-y-2 text-xs text-[hsl(var(--muted-foreground))]">
          <p>1. Detect prompt exfil attempt.</p>
          <p>2. Tokenize transcript + notify analysts.</p>
          <p>3. Review diff, enforce policy, escalate.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline">
            <CopyCheck className="mr-2 h-3.5 w-3.5" aria-hidden />
            Copy spec link
          </Button>
          <Button size="sm">
            <Lock className="mr-2 h-3.5 w-3.5" aria-hidden />
            View Trust Zone
          </Button>
        </div>
      </Card>
    </div>

    <BannerToastPreview />
    <PolicyRuleBuilder />

    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Layers className="h-5 w-5" aria-hidden />
          Data Surface
        </CardTitle>
        <CardDescription>
          Virtualized events stream, diffing, and inline code highlights for rapid redaction review.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <VirtualizedTable events={demoEvents} />
        <DiffPreview />
        <InlineCodeHighlighter />
      </CardContent>
    </Card>

    <StepUpAuthModal />
  </div>
  )
}

export default ComponentLibrarySpec
