import React, { useEffect, useMemo, useState } from 'react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/security-theme'
import type { TelemetryEvent } from '../../../shared'
import { exportEvents, getEvents } from '../lib/bridge'

const ROW_HEIGHT = 60
const TABLE_HEIGHT = 360

const formatTs = (ts: number) => new Date(ts).toLocaleString()

const EventsPage: React.FC = () => {
  const [events, setEvents] = useState<TelemetryEvent[]>([])
  const [scrollTop, setScrollTop] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    refresh()
  }, [])

  const refresh = async () => {
    setLoading(true)
    const data = await getEvents()
    setEvents(Array.isArray(data) ? data.reverse() : [])
    setLoading(false)
  }

  const onExport = () => {
    if (!events.length) return
    const ndjson = events.map((evt) => JSON.stringify(evt)).join('\n')
    exportEvents(ndjson)
  }

  const visible = useMemo(() => {
    const startIndex = Math.floor(scrollTop / ROW_HEIGHT)
    const visibleCount = Math.ceil(TABLE_HEIGHT / ROW_HEIGHT) + 3
    const rows = events.slice(startIndex, startIndex + visibleCount)
    return { rows, startIndex }
  }, [events, scrollTop])

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="text-lg">Telemetry events</CardTitle>
          <CardDescription>Tokenized records from the extension runtime.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            Refresh
          </Button>
          <Button size="sm" onClick={onExport} disabled={!events.length}>
            Export NDJSON
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-10 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading…</p>
        ) : events.length === 0 ? (
          <p className="py-10 text-center text-sm text-[hsl(var(--muted-foreground))]">
            No events logged yet. Trigger a prompt to see telemetry.
          </p>
        ) : (
          <div
            role="table"
            aria-label="Telemetry events"
            className="relative overflow-auto rounded-lg border border-[hsl(var(--border))]"
            style={{ height: TABLE_HEIGHT }}
            onScroll={(event) => setScrollTop((event.currentTarget as HTMLDivElement).scrollTop)}
            data-testid="events-virtual-table"
          >
            <div className="sticky top-0 z-10 grid grid-cols-[160px,180px,120px,100px,80px,1fr] border-b border-[hsl(var(--border))] bg-[hsla(var(--background),0.95)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
              <span>Timestamp</span>
              <span>App</span>
              <span>Action</span>
              <span>Risk</span>
              <span>Redactions</span>
              <span>Type</span>
            </div>
            <div style={{ height: events.length * ROW_HEIGHT }}>
              <div style={{ transform: `translateY(${visible.startIndex * ROW_HEIGHT}px)` }}>
                {visible.rows.map((event, index) => (
                  <div
                    key={`${event.ts}-${index}`}
                    className="grid grid-cols-[160px,180px,120px,100px,80px,1fr] items-center border-b border-[hsla(var(--border),0.6)] px-4 text-sm"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <span>{formatTs(event.ts)}</span>
                    <span className="font-medium text-[hsl(var(--foreground))]">{event.app}</span>
                    <span className="uppercase text-[hsl(var(--muted-foreground))]">{event.action}</span>
                    <span className="capitalize">{event.risk}</span>
                    <span>{event.redactionCount ?? 0}</span>
                    <span className="uppercase text-xs text-[hsl(var(--muted-foreground))]">{event.type}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default EventsPage
