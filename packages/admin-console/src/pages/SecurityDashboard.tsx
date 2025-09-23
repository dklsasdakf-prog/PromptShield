import React, { useMemo, useState } from 'react'
import {
  AlertTriangle,
  AppWindow,
  BarChart3,
  CheckCircle2,
  Globe2,
  History,
  Layers,
  LifeBuoy,
  ListChecks,
  Radar,
  ShieldCheck,
  ShieldOff,
  Target,
  Workflow,
} from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '../components/security-theme'
import { RiskBadge, VirtualizedTable, type VirtualizedTableEvent } from '../components/ComponentLibrarySpec'
import type { Policy, PolicyRule } from '../../../shared'

const riskSummary: Array<{ label: string; level: 'low' | 'medium' | 'high' | 'critical'; value: number }> = [
  { label: 'Low', level: 'low', value: 128 },
  { label: 'Medium', level: 'medium', value: 64 },
  { label: 'High', level: 'high', value: 18 },
  { label: 'Critical', level: 'critical', value: 5 },
]

const appCatalog = [
  {
    name: 'ChatGPT',
    host: 'chat.openai.com',
    status: 'guarded',
    lastUpdated: '2m ago',
  },
  {
    name: 'Claude',
    host: 'claude.ai',
    status: 'guarded',
    lastUpdated: '12m ago',
  },
  {
    name: 'Gemini',
    host: 'gemini.google.com',
    status: 'observing',
    lastUpdated: '28m ago',
  },
  {
    name: 'GitHub Copilot',
    host: 'copilot.microsoft.com',
    status: 'shadow-ai',
    lastUpdated: '3h ago',
  },
]

const defaultPolicyRules: PolicyRule[] = [
  {
    id: 'rule-ssn-block',
    name: 'Block SSN disclosure',
    condition: String.raw`prompt.matches(/\b\d{3}-\d{2}-\d{4}\b/)`,
    action: 'block',
    enabled: true,
    riskLevel: 'critical',
  },
  {
    id: 'rule-finance-sanitize',
    name: 'Sanitize account numbers',
    condition: String.raw`prompt.matches(/\b(?:\d[ -]?){12,16}\b/)`,
    action: 'sanitize',
    enabled: true,
    riskLevel: 'high',
  },
]

const SecurityDashboard: React.FC = () => {
  const [policyName, setPolicyName] = useState('PromptShield Zero-Trust')
  const [policyDescription, setPolicyDescription] = useState(
    'Redact high-risk secrets from prompts, enforce MFA for policy overrides, and fail-closed on sanitizer errors.',
  )

  const recentEvents = useMemo<VirtualizedTableEvent[]>(
    () => [
      {
        id: 'evt-0421',
        timestamp: new Date().toLocaleTimeString(),
        app: 'chat.openai.com',
        risk: 'critical',
        action: 'block',
        preview: 'SSN detected and prompt blocked',
      },
      {
        id: 'evt-0420',
        timestamp: new Date(Date.now() - 90_000).toLocaleTimeString(),
        app: 'claude.ai',
        risk: 'high',
        action: 'sanitize',
        preview: 'Financial account redacted',
      },
      {
        id: 'evt-0419',
        timestamp: new Date(Date.now() - 540_000).toLocaleTimeString(),
        app: 'gemini.google.com',
        risk: 'medium',
        action: 'flag',
        preview: 'Unsanctioned data source referenced',
      },
      {
        id: 'evt-0418',
        timestamp: new Date(Date.now() - 1_200_000).toLocaleTimeString(),
        app: 'copilot.microsoft.com',
        risk: 'low',
        action: 'allow',
        preview: 'Policy baseline satisfied',
      },
    ],
    [],
  )

  const onSavePolicy = () => {
    const policy: Policy = {
      id: 'policy-local-dev',
      name: policyName.trim() || 'PromptShield Policy',
      version: 1,
      rules: defaultPolicyRules,
    }

    const payload = {
      policy,
      metadata: {
        description: policyDescription.trim(),
        updatedAt: new Date().toISOString(),
        author: 'local-analyst',
      },
    }

    // TODO: Replace console log with persistence to secure storage service.
    console.info('promptshield.policy.save', JSON.stringify(payload, null, 2))
  }

  return (
    <div className="space-y-6 p-6" data-testid="security-dashboard">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">PromptShield Control Tower</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Detect-first guardrails with privacy-preserving telemetry across sanctioned AI surfaces.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm">
            <History className="mr-2 h-3.5 w-3.5" aria-hidden />
            View audit trail
          </Button>
          <Button size="sm">
            <ShieldCheck className="mr-2 h-3.5 w-3.5" aria-hidden />
            Publish policy
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {[
          {
            label: 'Prompts inspected',
            value: '12,487',
            delta: '+14% vs last week',
            icon: <Radar className="h-4 w-4 text-[hsl(var(--accent-foreground))]" aria-hidden />,
          },
          {
            label: 'Secrets redacted',
            value: '312',
            delta: 'Fail-closed on error',
            icon: <AlertTriangle className="h-4 w-4 text-red-400" aria-hidden />,
          },
          {
            label: 'Shadow AI attempts',
            value: '58',
            delta: 'Tokenized transcripts only',
            icon: <ShieldOff className="h-4 w-4 text-amber-400" aria-hidden />,
          },
          {
            label: 'Analyst SLA',
            value: '12m',
            delta: 'P95 response time',
            icon: <LifeBuoy className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden />,
          },
        ].map((card) => (
          <Card key={card.label}>
            <CardHeader className="border-0 pb-0">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
                {card.icon}
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              <p className="text-2xl font-semibold text-[hsl(var(--foreground))]">{card.value}</p>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{card.delta}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Workflow className="h-5 w-5" aria-hidden />
              Event Stream
            </CardTitle>
            <CardDescription>Real-time telemetry (tokenized) with automatic risk tagging.</CardDescription>
          </CardHeader>
          <CardContent>
            <VirtualizedTable events={recentEvents} />
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5" aria-hidden />
              Risk posture
            </CardTitle>
            <CardDescription>Aggregated counts since midnight UTC.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {riskSummary.map((item) => (
              <div key={item.level} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <RiskBadge level={item.level} />
                  <span className="text-sm text-[hsl(var(--muted-foreground))]">{item.label}</span>
                </div>
                <span className="text-base font-semibold text-[hsl(var(--foreground))]">{item.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr] xl:grid-cols-[1.6fr,1fr,1fr]">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Layers className="h-5 w-5" aria-hidden />
              Policy Editor
            </CardTitle>
            <CardDescription>
              Edit risk-adaptive guardrails. Changes require step-up auth before deployment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Policy name"
              value={policyName}
              onChange={(event) => setPolicyName(event.target.value)}
            />
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-[hsl(var(--muted-foreground))]" htmlFor="policy-description">
                Policy description
              </label>
              <textarea
                id="policy-description"
                className="min-h-[120px] rounded-md border border-[hsl(var(--input))] bg-transparent px-[calc(var(--control-padding-x)-4px)] py-2 text-sm text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2"
                value={policyDescription}
                onChange={(event) => setPolicyDescription(event.target.value)}
              />
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                Logs are tokenized by default. Enforcement fails closed if sanitization is inconclusive.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm">
                Preview diff
              </Button>
              <Button size="sm" onClick={onSavePolicy}>
                <CheckCircle2 className="mr-2 h-3.5 w-3.5" aria-hidden />
                Save draft
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AppWindow className="h-5 w-5" aria-hidden />
              App catalog
            </CardTitle>
            <CardDescription>Coverage across sanctioned & shadow AI tooling.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {appCatalog.map((app) => (
              <div key={app.host} className="flex items-center justify-between gap-3 rounded-lg border border-[hsla(var(--border),0.8)] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[hsl(var(--foreground))]">{app.name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{app.host}</p>
                </div>
                <div className="text-right text-xs text-[hsl(var(--muted-foreground))]">
                  <p className="font-semibold uppercase tracking-wide text-[hsl(var(--accent-foreground))]">{app.status}</p>
                  <p>{app.lastUpdated}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5" aria-hidden />
              Trust Zone
            </CardTitle>
            <CardDescription>Tokenized transcripts available for analysts with scope-bound access.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-dashed border-[hsl(var(--border))] px-4 py-3 text-xs">
              <p className="font-semibold text-[hsl(var(--foreground))]">Fail-closed mode engaged</p>
              <p className="mt-1 text-[hsl(var(--muted-foreground))]">
                Sanitizer unavailable? Prompts blocked, transcripts hashed with rotating salt.
              </p>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[hsl(var(--muted-foreground))]">Analysts on-duty</span>
                <span className="font-semibold text-[hsl(var(--foreground))]">6</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[hsl(var(--muted-foreground))]">Tokenized transcripts</span>
                <span className="font-semibold text-[hsl(var(--foreground))]">284</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[hsl(var(--muted-foreground))]">Pending escalations</span>
                <span className="font-semibold text-[hsl(var(--foreground))]">3</span>
              </div>
            </div>
            <Button variant="outline" size="sm" className="w-full">
              <Globe2 className="mr-2 h-3.5 w-3.5" aria-hidden />
              Enter Trust Zone workspace
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListChecks className="h-5 w-5" aria-hidden />
            Operational checklist
          </CardTitle>
          <CardDescription>
            Daily readiness items before enabling auto-approvals or wider tenant rollout.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {[
            'Verify tenant salts rotated',
            'Confirm sanitizer regex bundle',
            'Review yesterday’s shadow AI alerts',
            'Run policy diff approval workflow',
          ].map((item) => (
            <div key={item} className="flex items-center gap-3 rounded-lg border border-[hsla(var(--border),0.7)] px-4 py-3 text-xs">
              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--accent-foreground))]" aria-hidden />
              <span className="text-[hsl(var(--foreground))]">{item}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

export default SecurityDashboard
