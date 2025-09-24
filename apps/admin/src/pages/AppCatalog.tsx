import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  Button,
} from '../components/security-theme'
import { fetchAppMetrics, type ApiError, type AppMetric, type AppMetricsResponse } from '../lib/api'

const formatCount = (value?: number) => (typeof value === 'number' ? value.toLocaleString() : '—')

const formatTimestamp = (value?: string) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

const getRiskAccent = (risk?: AppMetric['risk']) => {
  switch (risk) {
    case 'critical':
      return 'bg-red-500/15 text-red-500'
    case 'high':
      return 'bg-orange-500/15 text-orange-500'
    case 'medium':
      return 'bg-amber-500/15 text-amber-500'
    case 'low':
      return 'bg-emerald-500/15 text-emerald-500'
    default:
      return 'bg-[hsla(var(--muted),0.5)] text-[hsl(var(--muted-foreground))]'
  }
}

const getStatusAccent = (status?: AppMetric['status']) => {
  switch (status) {
    case 'active':
      return 'bg-emerald-500/10 text-emerald-600'
    case 'pilot':
      return 'bg-amber-500/10 text-amber-600'
    case 'under-review':
      return 'bg-blue-500/10 text-blue-600'
    case 'deprecated':
      return 'bg-slate-500/15 text-slate-500'
    default:
      return 'bg-[hsla(var(--muted),0.4)] text-[hsl(var(--muted-foreground))]'
  }
}

const AppCatalog: React.FC = () => {
  const [apps, setApps] = useState<AppMetric[]>([])
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<AppMetricsResponse['meta'] | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 5

  useEffect(() => {
    let canceled = false
    setLoading(true)
    fetchAppMetrics(page, pageSize)
      .then((response) => {
        if (canceled) return
        if (response.apps.length === 0 && response.meta.pages > 0 && page > response.meta.pages) {
          setPage(response.meta.pages)
          return
        }
        setApps(response.apps ?? [])
        setMeta(response.meta)
        setUpdatedAt(response.updated_at ?? null)
        setError(null)
      })
      .catch((err) => {
        if (canceled) return
        const apiError = err as ApiError
        if (apiError?.status === 404) {
          setError('App catalog is not available yet')
        } else {
          console.error(err)
          toast.error('Unable to load app inventory')
          setError('Unable to load app inventory')
        }
      })
      .finally(() => {
        if (!canceled) setLoading(false)
      })

    return () => {
      canceled = true
    }
  }, [page, pageSize])

  const sortedApps = useMemo(() => {
    if (!apps.length) return []
    return [...apps].sort((a, b) => {
      const left = a.total_events ?? a.unique_users ?? 0
      const right = b.total_events ?? b.unique_users ?? 0
      return right - left
    })
  }, [apps])

  return (
    <Card className="m-6" data-testid="app-catalog">
      <CardHeader>
        <CardTitle>App catalog</CardTitle>
        <CardDescription>Read-only inventory aggregated from extension telemetry.</CardDescription>
        {updatedAt ? (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Last updated {formatTimestamp(updatedAt)}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <AppCatalogSkeleton />
        ) : sortedApps.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[hsla(var(--border),0.7)] text-sm">
              <thead className="text-left text-[hsl(var(--muted-foreground))]">
                <tr>
                  <th className="py-2 pr-4 font-medium">App</th>
                  <th className="py-2 pr-4 font-medium">Unique users</th>
                  <th className="py-2 pr-4 font-medium">Total events</th>
                  <th className="py-2 pr-4 font-medium">Last seen</th>
                  <th className="py-2 pr-4 font-medium">Risk</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">Top hosts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsla(var(--border),0.5)]">
                {sortedApps.map((app) => (
                  <tr key={app.app} className="align-top">
                    <td className="py-3 pr-4">
                      <div className="font-medium text-[hsl(var(--foreground))]">{app.display_name ?? app.app}</div>
                      {app.category ? (
                        <div className="text-xs uppercase text-[hsl(var(--muted-foreground))]">{app.category}</div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 text-[hsl(var(--foreground))]">{formatCount(app.unique_users)}</td>
                    <td className="py-3 pr-4 text-[hsl(var(--foreground))]">{formatCount(app.total_events)}</td>
                    <td className="py-3 pr-4 text-[hsl(var(--muted-foreground))]">{formatTimestamp(app.last_seen)}</td>
                    <td className="py-3 pr-4">
                      {app.risk ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold uppercase ${getRiskAccent(app.risk)}`}
                        >
                          {app.risk}
                        </span>
                      ) : (
                        <span className="text-[hsl(var(--muted-foreground))]">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {app.status ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold uppercase ${getStatusAccent(app.status)}`}
                        >
                          {app.status.replace(/-/g, ' ')}
                        </span>
                      ) : (
                        <span className="text-[hsl(var(--muted-foreground))]">—</span>
                      )}
                    </td>
                    <td className="py-3 text-[hsl(var(--muted-foreground))]">
                      {app.top_hosts?.length ? app.top_hosts.slice(0, 3).join(', ') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            No app usage detected yet. Deploy the extension to populate the app inventory.
          </p>
        )}
        {meta ? (
          <div className="flex items-center justify-between border-t border-[hsla(var(--border),0.5)] pt-3 text-xs text-[hsl(var(--muted-foreground))]">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => meta.has_prev && setPage((prev) => Math.max(1, prev - 1))}
              disabled={!meta.has_prev || loading}
            >
              Previous
            </Button>
            <span>
              Page {meta.page} of {meta.pages} · {meta.total} apps
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => meta.has_next && setPage((prev) => prev + 1)}
              disabled={!meta.has_next || loading}
            >
              Next
            </Button>
          </div>
        ) : null}
        {error ? <p className="text-sm text-[hsl(var(--destructive))]">{error}</p> : null}
      </CardContent>
    </Card>
  )
}

const AppCatalogSkeleton: React.FC = () => (
  <div className="space-y-3">
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-24" />
    </div>
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  </div>
)

export default AppCatalog
