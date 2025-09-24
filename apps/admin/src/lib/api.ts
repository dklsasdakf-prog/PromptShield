import type { PolicyRecord, PolicySpec } from '@checkred-ai-security/shared'
import { z } from 'zod'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8081'
const API_TOKEN = import.meta.env.VITE_API_TOKEN

export interface ApiError extends Error {
  status?: number
}

async function apiFetch<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (API_TOKEN) {
    headers.set('Authorization', `Bearer ${API_TOKEN}`)
  }

  const response = await fetch(url, { ...init, headers })
  if (!response.ok) {
    const message = await response.text()
    const error = new Error(message || `Request failed with status ${response.status}`) as ApiError
    error.status = response.status
    throw error
  }

  if (response.status === 204) {
    return schema.parse(undefined)
  }

  const text = await response.text()
  const data = text ? JSON.parse(text) : undefined
  return schema.parse(data)
}

const UserMetricsSchema = z.object({
  total_users: z.number(),
  with_extension: z.number(),
  using_genai_24h: z.number(),
  using_genai_7d: z.number(),
})

export type UserMetricsResponse = z.infer<typeof UserMetricsSchema>

export async function fetchUserMetrics(): Promise<UserMetricsResponse> {
  return apiFetch('/v1/metrics/users', UserMetricsSchema)
}

const EventRecordSchema = z
  .object({
    event_id: z.string(),
    ts: z.string(),
    app: z.string(),
    domain: z.string().optional(),
    identity: z.string().optional(),
    session_id: z.string().optional(),
    action: z.string().optional(),
    outcome: z.string().optional(),
    risk: z.number().optional(),
    policy_hits: z.array(z.string()).optional(),
    counters: z.record(z.unknown()).optional(),
    details: z.record(z.unknown()).optional(),
  })
  .passthrough()

const AggregationBucketSchema = z.object({
  key: z.string(),
  doc_count: z.number(),
})

const EventsAggsSchema = z.object({
  by_outcome: z.array(AggregationBucketSchema).optional(),
  by_app: z.array(AggregationBucketSchema).optional(),
  risk_percentiles: z
    .object({
      '50.0': z.number().optional(),
      '75.0': z.number().optional(),
      '90.0': z.number().optional(),
      '95.0': z.number().optional(),
    })
    .optional(),
  uniq_users: z.number().optional(),
})

const EventsResponseSchema = z
  .object({
    hits: z.array(EventRecordSchema),
    total: z.number().default(0),
    next: z.array(z.union([z.string(), z.number()])).nullable().optional(),
    aggregations: EventsAggsSchema.optional(),
    aggs: EventsAggsSchema.optional(),
  })
  .transform((value) => {
    const rawAggs = value.aggregations ?? value.aggs ?? {}
    return {
      hits: value.hits,
      total: value.total,
      next: value.next ?? null,
      aggregations: {
        by_outcome: rawAggs.by_outcome ?? [],
        by_app: rawAggs.by_app ?? [],
        risk_percentiles: rawAggs.risk_percentiles ?? {},
        uniq_users: rawAggs.uniq_users ?? 0,
      },
    }
  })

export type EventRecord = z.infer<typeof EventRecordSchema>
export type EventsResponse = z.infer<typeof EventsResponseSchema>

export interface EventsQuery {
  identity?: string
  app?: string
  outcome?: string
  riskMin?: number
  tsFrom?: string
  tsTo?: string
  size?: number
  searchAfter?: (string | number)[]
}

export async function fetchEvents(query: EventsQuery = {}): Promise<EventsResponse> {
  const params = new URLSearchParams()
  if (query.identity) params.set('identity', query.identity)
  if (query.app) params.set('app', query.app)
  if (query.outcome) params.set('outcome', query.outcome)
  if (typeof query.riskMin === 'number') params.set('risk_min', String(query.riskMin))
  if (query.tsFrom) params.set('ts_from', query.tsFrom)
  if (query.tsTo) params.set('ts_to', query.tsTo)
  if (query.size) params.set('size', String(query.size))
  if (query.searchAfter?.length) {
    query.searchAfter.forEach((value) => params.append('search_after', String(value)))
  }
  const suffix = params.toString() ? `?${params.toString()}` : ''
  return apiFetch(`/v1/events/search${suffix}`, EventsResponseSchema)
}

const DeltaSchema = z.object({
  absolute: z.number(),
  percent: z.number().nullable(),
})

const KpiSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number(),
  previous: z.number().nullable(),
  delta: DeltaSchema.nullable(),
})

const MetricsWindowSchema = z.object({
  start: z.string(),
  end: z.string(),
})

const MetricsOverviewSchema = z.object({
  generated_at: z.string(),
  window: z.object({
    current: MetricsWindowSchema,
    previous: MetricsWindowSchema,
  }),
  kpis: z.array(KpiSchema),
  risk_posture: z.record(z.number()),
  active_policies: z.number(),
})

export type MetricsOverviewResponse = z.infer<typeof MetricsOverviewSchema>

export async function fetchMetricsOverview(): Promise<MetricsOverviewResponse> {
  return apiFetch('/v1/metrics/overview', MetricsOverviewSchema)
}

const AppMetricSchema = z.object({
  app: z.string(),
  display_name: z.string().optional(),
  category: z.string().optional(),
  unique_users: z.number().optional(),
  total_events: z.number().optional(),
  last_seen: z.string().optional(),
  top_hosts: z.array(z.string()).optional(),
  risk: z.string().optional(),
  status: z.string().optional(),
})

const AppMetricsMetaSchema = z.object({
  page: z.number(),
  page_size: z.number(),
  total: z.number(),
  pages: z.number(),
  has_next: z.boolean(),
  has_prev: z.boolean(),
})

const AppMetricsResponseSchema = z.object({
  apps: z.array(AppMetricSchema),
  meta: AppMetricsMetaSchema,
  updated_at: z.string().optional(),
})

export type AppMetric = z.infer<typeof AppMetricSchema>
export type AppMetricsResponse = z.infer<typeof AppMetricsResponseSchema>

export async function fetchAppMetrics(page = 1, size = 5): Promise<AppMetricsResponse> {
  const params = new URLSearchParams({ page: String(page), size: String(size) })
  return apiFetch(`/v1/metrics/apps?${params.toString()}`, AppMetricsResponseSchema)
}

export interface PolicyPayload {
  name: string
  mode: PolicyRecord['mode']
  is_active: boolean
  spec: PolicySpec
}

const PolicyRecordSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  name: z.string(),
  mode: z.string(),
  is_active: z.boolean(),
  spec: z.record(z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
})

const PoliciesMetaSchema = z.object({
  page: z.number(),
  page_size: z.number(),
  total: z.number(),
  pages: z.number(),
  has_next: z.boolean(),
  has_prev: z.boolean(),
})

const PoliciesResponseSchema = z.object({
  items: z.array(PolicyRecordSchema),
  meta: PoliciesMetaSchema,
})

export type PoliciesResponse = z.infer<typeof PoliciesResponseSchema>

export async function fetchPolicies(page = 1, size = 10): Promise<PoliciesResponse> {
  const params = new URLSearchParams({ page: String(page), size: String(size) })
  return apiFetch(`/v1/policies?${params.toString()}`, PoliciesResponseSchema)
}

export async function createPolicy(payload: PolicyPayload): Promise<PolicyRecord> {
  return apiFetch('/v1/policies', PolicyRecordSchema, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updatePolicy(id: string, payload: Partial<PolicyPayload>): Promise<PolicyRecord> {
  return apiFetch(`/v1/policies/${id}`, PolicyRecordSchema, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}
