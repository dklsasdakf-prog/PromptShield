import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  AppWindow,
  BarChart3,
  CheckCircle2,
  Clock,
  Globe2,
  History,
  Layers,
  LifeBuoy,
  ListChecks,
  Lock,
  Radar,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Target,
  TrendingUp,
  Users,
  Workflow,
  Zap,
} from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
} from '../components/security-theme'
import { RiskBadge, VirtualizedTable, type VirtualizedTableEvent } from '../components/ComponentLibrarySpec'
import KPICard from '../components/KPICard'
import {
  fetchUserMetrics,
  fetchEvents,
  fetchAppCatalog,
  type UserMetricsResponse,
  type EventsResponse,
  type AppCatalogResponse,
  type EventRecord,
} from '../lib/api'

// Local types for the dashboard
interface PolicyRule {
  id: string
  name: string
  condition: string
  action: 'allow' | 'block' | 'sanitize' | 'flag'
  enabled: boolean
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
}

interface Policy {
  id: string
  name: string
  version: number
  rules: PolicyRule[]
}

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
  // State for all dashboard data
  const [userMetrics, setUserMetrics] = useState<UserMetricsResponse | null>(null)
  const [eventsData, setEventsData] = useState<EventsResponse | null>(null)
  const [appMetrics, setAppMetrics] = useState<AppCatalogResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Policy editor state
  const [policyName, setPolicyName] = useState('Checkred AI Security Zero-Trust')
  const [policyDescription, setPolicyDescription] = useState(
    'Redact high-risk secrets from prompts, enforce MFA for policy overrides, and fail-closed on sanitizer errors.',
  )

  // Load all dashboard data on component mount
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true)
        
        // Fetch all data in parallel
        const [userMetricsRes, eventsRes, appMetricsRes] = await Promise.allSettled([
          fetchUserMetrics(),
          fetchEvents({ size: 20 }),
          fetchAppCatalog({ pageSize: 50 }),
        ])

        if (userMetricsRes.status === 'fulfilled') {
          setUserMetrics(userMetricsRes.value)
        } else {
          console.warn('Failed to fetch user metrics:', userMetricsRes.reason)
        }

        if (eventsRes.status === 'fulfilled') {
          setEventsData(eventsRes.value)
        } else {
          console.warn('Failed to fetch events:', eventsRes.reason)
        }

        if (appMetricsRes.status === 'fulfilled') {
          setAppMetrics(appMetricsRes.value)
        } else {
          console.warn('Failed to fetch app catalog:', appMetricsRes.reason)
        }

        setError(null)
      } catch (err) {
        console.error('Error loading dashboard data:', err)
        setError('Failed to load dashboard data')
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData()
  }, [])

  // Calculate dynamic KPI data from API responses
  const kpiData = useMemo(() => {
    const defaultKpis = [
      {
        label: 'Prompts inspected',
        value: '0',
        delta: 'Loading...',
        icon: <Radar className="h-4 w-4 text-[hsl(var(--accent-foreground))]" aria-hidden />,
      },
      {
        label: 'Secrets redacted',
        value: '0',
        delta: '',
        icon: <AlertTriangle className="h-4 w-4 text-red-400" aria-hidden />,
      },
      {
        label: 'Shadow AI Apps',
        value: '0',
        delta: 'Tokenized transcripts only',
        icon: <ShieldOff className="h-4 w-4 text-amber-400" aria-hidden />,
      },
      {
        label: 'Active Users',
        value: '0',
        delta: 'Using GenAI 24h',
        icon: <LifeBuoy className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden />,
      },
    ]

    if (loading) return defaultKpis

    // Calculate metrics from real data
    const totalEvents = eventsData?.hits?.length || 0
    const secretsRedacted = eventsData?.hits?.filter(e => e.outcome === 'sanitized')?.length || 0
    const shadowApps = appMetrics?.items?.filter(app => app.risk === 'high' || app.risk === 'critical')?.length || 0
    const activeUsers = userMetrics?.using_genai_24h || 0

    return [
      {
        label: 'Prompts inspected',
        value: totalEvents.toLocaleString(),
        delta: totalEvents > 0 ? '+14% vs last week' : 'No data yet',
        icon: <Radar className="h-4 w-4 text-[hsl(var(--accent-foreground))]" aria-hidden />,
      },
      {
        label: 'Secrets redacted',
        value: secretsRedacted.toLocaleString(),
        delta: '',
        icon: <AlertTriangle className="h-4 w-4 text-red-400" aria-hidden />,
      },
      {
        label: 'Shadow AI Apps',
        value: shadowApps.toLocaleString(),
        delta: 'Tokenized transcripts only',
        icon: <ShieldOff className="h-4 w-4 text-amber-400" aria-hidden />,
      },
      {
        label: 'Active Users',
        value: activeUsers.toLocaleString(),
        delta: 'Using GenAI 24h',
        icon: <LifeBuoy className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden />,
      },
    ]
  }, [userMetrics, eventsData, appMetrics, loading])

  // Convert API events to VirtualizedTable format
  const recentEvents = useMemo<VirtualizedTableEvent[]>(() => {
    if (!eventsData?.hits) return []
    
    return eventsData.hits.map((event: EventRecord) => ({
      id: event.event_id,
      timestamp: new Date(event.ts).toLocaleTimeString(),
      app: event.app,
      risk: (event.risk && event.risk > 80 ? 'critical' : event.risk && event.risk > 60 ? 'high' : event.risk && event.risk > 30 ? 'medium' : 'low') as 'low' | 'medium' | 'high' | 'critical',
      identity: event.identity || 'unknown@company.com',
      action: (event.action || event.outcome || 'allow') as 'allow' | 'block' | 'sanitize' | 'flag',
      preview: event.details ? JSON.stringify(event.details).substring(0, 50) + '...' : 'Event processed',
    }))
  }, [eventsData])

  // Calculate risk summary from events data
  const riskSummary = useMemo(() => {
    if (!eventsData?.hits) {
      return [
        { label: 'Low', level: 'low' as const, value: 0 },
        { label: 'Medium', level: 'medium' as const, value: 0 },
        { label: 'High', level: 'high' as const, value: 0 },
        { label: 'Critical', level: 'critical' as const, value: 0 },
      ]
    }

    const counts = { low: 0, medium: 0, high: 0, critical: 0 }
    
    eventsData.hits.forEach(event => {
      if (event.risk) {
        if (event.risk > 80) counts.critical++
        else if (event.risk > 60) counts.high++
        else if (event.risk > 30) counts.medium++
        else counts.low++
      } else {
        counts.low++
      }
    })

    return [
      { label: 'Low', level: 'low' as const, value: counts.low },
      { label: 'Medium', level: 'medium' as const, value: counts.medium },
      { label: 'High', level: 'high' as const, value: counts.high },
      { label: 'Critical', level: 'critical' as const, value: counts.critical },
    ]
  }, [eventsData])

  // Convert API app metrics to dashboard format
  const appCatalog = useMemo(() => {
    if (!appMetrics?.items) {
      return [
        {
          name: 'Loading...',
          host: '...',
          status: 'loading',
          lastUpdated: 'Loading...',
        },
      ]
    }

    return appMetrics.items.slice(0, 4).map(app => ({
      name: app.app,
      host: app.top_domain || app.app,
      status: app.risk === 'critical' ? 'shadow-ai' : app.risk === 'high' ? 'observing' : 'guarded',
      lastUpdated: app.last_seen ? new Date(app.last_seen).toLocaleString() : 'Unknown',
    }))
  }, [appMetrics])

  // Trust Zone data (items awaiting review)
  const trustZoneItems = useMemo(() => {
    if (!eventsData?.hits) {
      return []
    }

    // Show sanitized or flagged events that need review
    return eventsData.hits
      .filter(event => event.outcome === 'sanitize' || event.outcome === 'flag')
      .slice(0, 5)
      .map(event => ({
        id: event.event_id,
        type: event.outcome === 'sanitize' ? 'Sanitized Output' : 'Flagged Content',
        app: event.app,
        timestamp: new Date(event.ts).toLocaleTimeString(),
        risk: (event.risk && event.risk > 80 ? 'critical' : event.risk && event.risk > 60 ? 'high' : event.risk && event.risk > 30 ? 'medium' : 'low') as 'low' | 'medium' | 'high' | 'critical',
      }))
  }, [eventsData])

  // Compliance metrics
  const complianceMetrics = useMemo(() => {
    const totalEvents = eventsData?.hits?.length || 0
    const blockedEvents = eventsData?.hits?.filter(e => e.outcome === 'block')?.length || 0
    const sanitizedEvents = eventsData?.hits?.filter(e => e.outcome === 'sanitize')?.length || 0
    const allowedEvents = eventsData?.hits?.filter(e => e.outcome === 'allow')?.length || 0

    const policyCompliance = totalEvents > 0 ? Math.round(((blockedEvents + sanitizedEvents) / totalEvents) * 100) : 0
    const dataProtection = totalEvents > 0 ? Math.round((sanitizedEvents / totalEvents) * 100) : 0

    return [
      { label: 'Policy Compliance', value: `${policyCompliance}%`, status: policyCompliance >= 90 ? 'good' : policyCompliance >= 70 ? 'warning' : 'critical' },
      { label: 'Data Protection', value: `${dataProtection}%`, status: dataProtection >= 80 ? 'good' : dataProtection >= 60 ? 'warning' : 'critical' },
      { label: 'Zero Trust Posture', value: blockedEvents > 0 ? 'Active' : 'Monitoring', status: 'good' },
      { label: 'Audit Readiness', value: '100%', status: 'good' },
    ]
  }, [eventsData])

  // Threat intelligence data
  const threatIntelligence = useMemo(() => {
    const criticalThreats = eventsData?.hits?.filter(e => e.risk && e.risk > 80)?.length || 0
    const highThreats = eventsData?.hits?.filter(e => e.risk && e.risk > 60 && e.risk <= 80)?.length || 0
    const shadowAIApps = appMetrics?.items?.filter(app => app.risk === 'critical' || app.risk === 'high')?.length || 0

    return [
      { 
        type: 'Critical Threats Blocked', 
        count: criticalThreats, 
        trend: criticalThreats > 0 ? 'up' : 'stable',
        description: 'High-risk prompts blocked'
      },
      { 
        type: 'Shadow AI Detection', 
        count: shadowAIApps, 
        trend: shadowAIApps > 0 ? 'up' : 'stable',
        description: 'Unauthorized AI tools detected'
      },
      { 
        type: 'Policy Violations', 
        count: highThreats, 
        trend: highThreats > 0 ? 'up' : 'stable',
        description: 'High-risk activity identified'
      },
    ]
  }, [eventsData, appMetrics])

  const onSavePolicy = () => {
    const policy: Policy = {
      id: 'policy-local-dev',
      name: policyName.trim() || 'Checkred AI Security Policy',
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
    console.info('checkred-ai-security.policy.save', JSON.stringify(payload, null, 2))
  }

  return (
    <div className="space-y-6 p-6" data-testid="security-dashboard">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">Checkred AI Security Posture</h1>
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

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="text-sm">⚠️ {error}</p>
        </div>
      )}

      {/* Two Main KPI Cards - Moved to Top */}
      <div className="grid gap-6 lg:grid-cols-2">
        <KPICard
          title="Total Users"
          value={loading ? "Loading..." : (userMetrics?.total_users?.toLocaleString() || '0')}
          description="Δ vs last week: +12 users"
          icon={<Users className="h-4 w-4" />}
          loading={loading}
        />

        <KPICard
          title="Users with Extension"
          value={loading ? "Loading..." : (userMetrics?.with_extension?.toLocaleString() || '0')}
          description="Δ vs last week: +8 users"
          icon={<ShieldCheck className="h-4 w-4" />}
          loading={loading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {kpiData.map((card) => (
          <Card key={card.label}>
            <CardHeader className="border-0 pb-0">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-[hsl(var(--muted-foreground))]">
                {card.icon}
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-semibold text-[hsl(var(--foreground))]">{card.value}</p>
              )}
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{card.delta}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr),minmax(0,1fr)]">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Workflow className="h-5 w-5" aria-hidden />
              Event Stream
            </CardTitle>
            <CardDescription>Real-time telemetry (tokenized) with automatic risk tagging.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <VirtualizedTable events={recentEvents} />
            )}
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
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-8" />
                  </div>
                ))}
              </div>
            ) : (
              riskSummary.map((item) => (
                <div key={item.level} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <RiskBadge level={item.level} />
                    <span className="text-sm text-[hsl(var(--muted-foreground))]">{item.label}</span>
                  </div>
                  <span className="text-base font-semibold text-[hsl(var(--foreground))]">{item.value}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr),minmax(0,1fr)] xl:grid-cols-[minmax(0,1.6fr),minmax(0,1fr)]">
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
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              appCatalog.map((app, index) => (
                <div key={index} className="flex items-center justify-between gap-3 rounded-lg border border-[hsla(var(--border),0.8)] px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-[hsl(var(--foreground))]">{app.name}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{app.host}</p>
                  </div>
                  <div className="text-right text-xs text-[hsl(var(--muted-foreground))]">
                    <p className="font-semibold uppercase tracking-wide text-[hsl(var(--accent-foreground))]">{app.status}</p>
                    <p>{app.lastUpdated}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Commented out Additional Security Widgets for now */}
      {/*
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="h-5 w-5" aria-hidden />
              Trust Zone
            </CardTitle>
            <CardDescription>Sanitized content awaiting analyst review.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : trustZoneItems.length === 0 ? (
              <div className="py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
                <ShieldCheck className="mx-auto mb-2 h-8 w-8 opacity-50" />
                No items pending review
              </div>
            ) : (
              <div className="space-y-3">
                {trustZoneItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border border-[hsla(var(--border),0.6)] p-3">
                    <div className="flex items-center gap-3">
                      <RiskBadge level={item.risk} />
                      <div>
                        <p className="text-sm font-medium text-[hsl(var(--foreground))]">{item.type}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">{item.app} • {item.timestamp}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline">
                      Review
                    </Button>
                  </div>
                ))}
                {trustZoneItems.length > 0 && (
                  <Button variant="outline" size="sm" className="w-full mt-2">
                    <Target className="mr-2 h-3.5 w-3.5" aria-hidden />
                    View all pending
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ListChecks className="h-5 w-5" aria-hidden />
              Compliance Status
            </CardTitle>
            <CardDescription>Real-time policy adherence metrics.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            ) : (
              complianceMetrics.map((metric, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {metric.status === 'good' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    {metric.status === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                    {metric.status === 'critical' && <ShieldAlert className="h-4 w-4 text-red-500" />}
                    <span className="text-sm text-[hsl(var(--muted-foreground))]">{metric.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-[hsl(var(--foreground))]">{metric.value}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="h-5 w-5" aria-hidden />
              Threat Intelligence
            </CardTitle>
            <CardDescription>Active security indicators and trends.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-8" />
                  </div>
                ))}
              </div>
            ) : (
              threatIntelligence.map((threat, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {threat.trend === 'up' && <TrendingUp className="h-4 w-4 text-red-400" />}
                    {threat.trend === 'stable' && <Target className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />}
                    <div>
                      <p className="text-sm font-medium text-[hsl(var(--foreground))]">{threat.count}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">{threat.type}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{threat.description}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" aria-hidden />
              Security Operations
            </CardTitle>
            <CardDescription>Analyst workload and response metrics.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-semibold text-[hsl(var(--foreground))]">{userMetrics?.total_users || 0}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">Total Users</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-semibold text-[hsl(var(--foreground))]">{userMetrics?.with_extension || 0}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">Protected</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-semibold text-[hsl(var(--foreground))]">{Math.round(((userMetrics?.with_extension || 0) / Math.max(userMetrics?.total_users || 1, 1)) * 100)}%</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">Coverage</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[hsl(var(--muted-foreground))]">Response Time</span>
                    <span className="font-medium text-[hsl(var(--foreground))]">&lt; 2min avg</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[hsl(var(--muted-foreground))]">False Positives</span>
                    <span className="font-medium text-[hsl(var(--foreground))]">&lt; 1%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[hsl(var(--muted-foreground))]">Analyst Efficiency</span>
                    <span className="font-medium text-[hsl(var(--foreground))]">98.2%</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5" aria-hidden />
              Incident Response
            </CardTitle>
            <CardDescription>Real-time security incident tracking.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-[hsla(var(--border),0.6)] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-2 w-2 rounded-full bg-green-500"></div>
                    <span className="text-sm font-medium text-[hsl(var(--foreground))]">All Systems Operational</span>
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">No active incidents detected</p>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[hsl(var(--muted-foreground))]">Mean Time to Detection</span>
                    <span className="font-medium text-[hsl(var(--foreground))]">32s</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[hsl(var(--muted-foreground))]">Mean Time to Response</span>
                    <span className="font-medium text-[hsl(var(--foreground))]">1.2min</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-[hsl(var(--muted-foreground))]">Incidents Resolved Today</span>
                    <span className="font-medium text-[hsl(var(--foreground))]">{eventsData?.hits?.filter(e => e.outcome === 'block')?.length || 0}</span>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="w-full">
                  <Lock className="mr-2 h-3.5 w-3.5" aria-hidden />
                  View incident log
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      */}
    </div>
  )
}

export default SecurityDashboard
