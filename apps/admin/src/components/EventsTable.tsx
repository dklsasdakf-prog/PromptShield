import React from 'react'
import type { EventRecord } from '../lib/api'
import { RiskBadge } from './ComponentLibrarySpec'

interface EventsTableProps {
  events: EventRecord[]
  loading?: boolean
  emptyMessage?: string
  onSelect?: (event: EventRecord) => void
  selectedId?: string | null
}

const outcomeIntent: Record<string, string> = {
  allowed: 'bg-emerald-500/10 text-emerald-600',
  sanitized: 'bg-amber-500/10 text-amber-600',
  blocked: 'bg-red-500/10 text-red-600',
  warn: 'bg-orange-500/10 text-orange-600',
}

const getRiskLevel = (risk?: number) => {
  if (typeof risk !== 'number') return undefined
  if (risk >= 80) return 'critical'
  if (risk >= 60) return 'high'
  if (risk >= 35) return 'medium'
  return 'low'
}

const EventsTable: React.FC<EventsTableProps> = ({ events, loading, emptyMessage, onSelect, selectedId }) => {
  if (loading) {
    return <p className="py-6 text-sm text-[hsl(var(--muted-foreground))]">Loading events…</p>
  }

  if (!events.length) {
    return <p className="py-6 text-sm text-[hsl(var(--muted-foreground))]">{emptyMessage ?? 'No events yet.'}</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-[hsla(var(--border),0.6)] text-sm">
        <thead className="bg-[hsla(var(--background),0.9)] text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          <tr>
            <th className="whitespace-nowrap px-4 py-2 text-left">ID</th>
            <th className="whitespace-nowrap px-4 py-2 text-left">Timestamp</th>
            <th className="whitespace-nowrap px-4 py-2 text-left">App</th>
            <th className="whitespace-nowrap px-4 py-2 text-left">Identity</th>
            <th className="whitespace-nowrap px-4 py-2 text-left">Outcome</th>
            <th className="whitespace-nowrap px-4 py-2 text-left">Risk</th>
            <th className="whitespace-nowrap px-4 py-2 text-left">Policy hits</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[hsla(var(--border),0.4)]">
          {events.map((event) => (
            <tr
              key={event.event_id}
              onClick={() => onSelect?.(event)}
              onKeyDown={(keyboardEvent) => {
                if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
                  keyboardEvent.preventDefault()
                  onSelect?.(event)
                }
              }}
              role="button"
              tabIndex={0}
              aria-selected={selectedId === event.event_id}
              className={`cursor-pointer transition-colors hover:bg-[hsla(var(--foreground),0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsla(var(--accent),0.45)] ${
                selectedId === event.event_id ? 'bg-[hsla(var(--accent),0.12)]' : ''
              }`}
            >
              <td className="px-4 py-2 font-medium text-[hsl(var(--foreground))]">{event.event_id}</td>
              <td className="px-4 py-2 text-[hsl(var(--muted-foreground))]">{new Date(event.ts).toLocaleString()}</td>
              <td className="px-4 py-2 font-medium text-[hsl(var(--foreground))]">{event.app}</td>
              <td className="px-4 py-2 text-[hsl(var(--muted-foreground))]">{event.identity ?? '—'}</td>
              <td className="px-4 py-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                    outcomeIntent[event.outcome ?? ''] ?? 'bg-[hsla(var(--muted),0.4)] text-[hsl(var(--muted-foreground))]'
                  }`}
                >
                  {event.outcome ?? 'unknown'}
                </span>
              </td>
              <td className="px-4 py-2">
                {(() => {
                  const level = getRiskLevel(event.risk)
                  return level ? (
                    <div className="flex items-center gap-2">
                      <RiskBadge level={level} condensed />
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">{event.risk}</span>
                    </div>
                  ) : (
                    <span className="text-[hsl(var(--muted-foreground))]">—</span>
                  )
                })()}
              </td>
              <td className="px-4 py-2 text-xs text-[hsl(var(--muted-foreground))]">
                {event.policy_hits?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {event.policy_hits.map((hit) => (
                      <span key={hit} className="rounded-full bg-[hsla(var(--muted),0.5)] px-2 py-0.5">
                        {hit}
                      </span>
                    ))}
                  </div>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default EventsTable
