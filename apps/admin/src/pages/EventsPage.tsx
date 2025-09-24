import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Filter, RefreshCcw } from 'lucide-react'

import EventsTable from '../components/EventsTable'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from '../components/security-theme'
import { fetchEvents, type EventRecord, type EventsResponse } from '../lib/api'

interface EventFilters {
  identity: string
  app: string
  outcome: string
  riskMin: string
}

const defaultFilters: EventFilters = {
  identity: '',
  app: '',
  outcome: '',
  riskMin: '',
}

const PAGE_SIZE = 25

const EventsPage: React.FC = () => {
  const [filters, setFilters] = useState<EventFilters>(defaultFilters)
  const [pendingFilters, setPendingFilters] = useState<EventFilters>(defaultFilters)
  const [pageTokens, setPageTokens] = useState<Array<(string | number)[] | null>>([null])
  const [currentPage, setCurrentPage] = useState(0)
  const [eventsResponse, setEventsResponse] = useState<EventsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<EventRecord | null>(null)

  const activeToken = pageTokens[currentPage] ?? null

  const applyFilters = () => {
    setFilters(pendingFilters)
    setPageTokens([null])
    setCurrentPage(0)
  }

  const resetFilters = () => {
    setFilters(defaultFilters)
    setPendingFilters(defaultFilters)
    setPageTokens([null])
    setCurrentPage(0)
  }

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetchEvents({
          identity: filters.identity || undefined,
          app: filters.app || undefined,
          outcome: filters.outcome || undefined,
          riskMin: filters.riskMin ? Number(filters.riskMin) : undefined,
          size: PAGE_SIZE,
          searchAfter: activeToken ?? undefined,
        })
        if (controller.signal.aborted) return
        setEventsResponse(response)
        setSelectedEvent((prev) => {
          if (prev) {
            return response.hits.find((event) => event.event_id === prev.event_id) ?? prev
          }
          return response.hits[0] ?? null
        })
        setPageTokens((prev) => {
          const base = prev.slice(0, currentPage + 1)
          base[currentPage] = activeToken
          base[currentPage + 1] = response.next ?? null
          return base
        })
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error(err)
          setError('Unable to load events')
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }
    void load()
    return () => {
      controller.abort()
    }
  }, [filters, currentPage, activeToken])

  const totalEvents = eventsResponse?.total ?? 0
  const hasPrev = currentPage > 0
  const nextToken = pageTokens[currentPage + 1]
  const hasNext = Array.isArray(nextToken) && nextToken.length > 0

  const summaryBuckets = useMemo(() => {
    return eventsResponse?.aggregations.by_outcome ?? []
  }, [eventsResponse])

  const riskPercentiles = useMemo(() => {
    const values = eventsResponse?.aggregations.risk_percentiles ?? {}
    return [
      { label: 'p50', value: values['50.0'] },
      { label: 'p75', value: values['75.0'] },
      { label: 'p90', value: values['90.0'] },
      { label: 'p95', value: values['95.0'] },
    ].filter((item) => typeof item.value === 'number')
  }, [eventsResponse])

  const pageStart = currentPage * PAGE_SIZE + 1
  const pageEnd = Math.min(pageStart + (eventsResponse?.hits.length ?? 0) - 1, totalEvents)

  return (
    <div className="space-y-6 p-6" data-testid="events-page">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">Events stream</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Inspect sanitized telemetry, filter by identity or outcome, and inspect details inline.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle className="text-lg">Filters</CardTitle>
            <CardDescription>Scope the stream by actor, application, or enforcement outcome.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Reset
            </Button>
            <Button variant="outline" size="sm" onClick={applyFilters}>
              <Filter className="mr-2 h-3 w-3" aria-hidden /> Apply
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Input
            label="Identity"
            placeholder="alice@acme.com"
            value={pendingFilters.identity}
            onChange={(event) => setPendingFilters((prev) => ({ ...prev, identity: event.target.value }))}
          />
          <Input
            label="App"
            placeholder="chatgpt"
            value={pendingFilters.app}
            onChange={(event) => setPendingFilters((prev) => ({ ...prev, app: event.target.value }))}
          />
          <Input
            label="Outcome"
            placeholder="sanitized"
            value={pendingFilters.outcome}
            onChange={(event) => setPendingFilters((prev) => ({ ...prev, outcome: event.target.value }))}
          />
          <Input
            label="Minimum risk"
            type="number"
            min={0}
            max={100}
            value={pendingFilters.riskMin}
            onChange={(event) => setPendingFilters((prev) => ({ ...prev, riskMin: event.target.value }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-lg">Results</CardTitle>
            <CardDescription>
              {error
                ? error
                : totalEvents > 0
                  ? `Showing ${pageStart}-${pageEnd} of ${totalEvents.toLocaleString()} matching events.`
                  : 'No events match your filters yet.'}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setFilters((prev) => ({ ...prev }))} disabled={loading}>
            <RefreshCcw className="mr-2 h-3 w-3" aria-hidden /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {summaryBuckets.length ? (
            <div className="flex flex-wrap gap-3 text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              {summaryBuckets.map((bucket) => (
                <span key={bucket.key} className="rounded-full border border-[hsla(var(--border),0.5)] px-3 py-1">
                  {bucket.key} · {bucket.doc_count}
                </span>
              ))}
              {riskPercentiles.length ? (
                <span className="rounded-full border border-[hsla(var(--border),0.5)] px-3 py-1 capitalize">
                  Risk percentiles ·{' '}
                  {riskPercentiles
                    .map((item) => `${item.label}:${Math.round((item.value ?? 0) as number)}`)
                    .join(' · ')}
                </span>
              ) : null}
            </div>
          ) : null}

          <EventsTable
            events={eventsResponse?.hits ?? []}
            loading={loading && !(eventsResponse?.hits.length)}
            emptyMessage={error ?? 'No events match your filters yet.'}
            onSelect={(event) => setSelectedEvent(event)}
            selectedId={selectedEvent?.event_id ?? null}
          />

          <div className="flex items-center justify-between border-t border-[hsla(var(--border),0.5)] pt-4">
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              Page {currentPage + 1} · page size {PAGE_SIZE}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => hasPrev && setCurrentPage((prev) => prev - 1)} disabled={!hasPrev || loading}>
                <ArrowLeft className="mr-1 h-3 w-3" aria-hidden /> Previous
              </Button>
              <Button variant="ghost" size="sm" onClick={() => hasNext && setCurrentPage((prev) => prev + 1)} disabled={!hasNext || loading}>
                Next <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedEvent ? (
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Event details</CardTitle>
              <CardDescription>{selectedEvent.event_id}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-[hsl(var(--muted-foreground))]">
              {selectedEvent.outcome ? (
                <span className="rounded-full border border-[hsla(var(--border),0.6)] px-3 py-1 uppercase">
                  Outcome · {selectedEvent.outcome}
                </span>
              ) : null}
              {typeof selectedEvent.risk === 'number' ? (
                <span className="rounded-full border border-[hsla(var(--border),0.6)] px-3 py-1 uppercase">
                  Risk · {selectedEvent.risk}
                </span>
              ) : null}
              {selectedEvent.policy_hits?.map((hit) => (
                <span
                  key={hit}
                  className="rounded-full bg-[hsla(var(--muted),0.45)] px-3 py-1 uppercase text-[hsl(var(--muted-foreground))]"
                >
                  {hit}
                </span>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[320px] overflow-auto rounded border border-[hsla(var(--border),0.5)] bg-[hsl(var(--muted))] p-4 text-xs text-[hsl(var(--foreground))]">
              {JSON.stringify(selectedEvent, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

export default EventsPage
