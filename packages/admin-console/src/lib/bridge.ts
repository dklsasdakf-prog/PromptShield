import type { Policy, TelemetryEvent } from '../../../shared'

const POLICY_KEY = 'ps:policy-ui'
const EVENTS_KEY = 'ps:events-ui'

export async function getPolicy(): Promise<Policy | null> {
  const response = await fetch('/api/mock-policy.json').catch(() => null)
  if (response?.ok) {
    return (await response.json()) as Policy
  }
  const stored = localStorage.getItem(POLICY_KEY)
  return stored ? (JSON.parse(stored) as Policy) : null
}

export function savePolicy(policy: Policy): void {
  localStorage.setItem(POLICY_KEY, JSON.stringify(policy))
}

export function getEvents(): TelemetryEvent[] {
  const raw = localStorage.getItem(EVENTS_KEY)
  return raw ? (JSON.parse(raw) as TelemetryEvent[]) : []
}

export function exportEvents(ndjson: string): void {
  const blob = new Blob([ndjson], { type: 'application/x-ndjson' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'checkred-ai-security-telemetry.ndjson'
  link.click()
}
