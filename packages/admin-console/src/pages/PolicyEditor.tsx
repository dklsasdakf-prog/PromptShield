import React, { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '../components/security-theme'
import type { Policy, PolicyRule } from '../../../shared'
import { defaultPolicy } from '../../../shared'
import { getPolicy, savePolicy } from '../lib/bridge'

const emptyRule = (): PolicyRule => ({
  id: `rule-${Math.random().toString(36).slice(2, 8)}`,
  name: '',
  condition: '',
  action: 'flag',
  enabled: true,
  riskLevel: 'medium',
})

const actions: PolicyRule['action'][] = ['allow', 'block', 'sanitize', 'flag']
const risks: PolicyRule['riskLevel'][] = ['low', 'medium', 'high', 'critical']

const PolicyEditorPage: React.FC = () => {
  const [policy, setPolicy] = useState<Policy>(defaultPolicy)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    const load = async () => {
      const remote = await getPolicy()
      const stored = localStorage.getItem('ps:policy-ui')
      const hydrated: Policy | null = remote ?? (stored ? JSON.parse(stored) : null)
      setPolicy({ ...defaultPolicy, ...(hydrated ?? {}) })
      setLoading(false)
    }
    load()
  }, [])

  const addRule = () => {
    setPolicy((prev) => ({ ...prev, rules: [emptyRule(), ...prev.rules] }))
  }

  const updateRule = (id: string, patch: Partial<PolicyRule>) => {
    setPolicy((prev) => ({
      ...prev,
      rules: prev.rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    }))
  }

  const removeRule = (id: string) => {
    setPolicy((prev) => ({ ...prev, rules: prev.rules.filter((rule) => rule.id !== id) }))
  }

  const allowlistText = useMemo(() => (policy.allowlist ?? []).join('\n'), [policy.allowlist])

  const onSave = async () => {
    setSaving(true)
    const toPersist: Policy = {
      ...policy,
      rules: policy.rules.map((r) => ({ ...r, name: r.name.trim(), condition: r.condition.trim() })),
    }
    await savePolicy(toPersist)
    setSavedAt(Date.now())
    setSaving(false)
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">
          Loading policy…
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Policy Overview</CardTitle>
          <CardDescription>Configure detect-first rules and dry-run behaviour.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Policy name"
            value={policy.name}
            onChange={(event) => setPolicy((prev) => ({ ...prev, name: event.target.value }))}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[hsl(var(--muted-foreground))]" htmlFor="allowlist">
                Sanctioned hosts (one per line)
              </label>
              <textarea
                id="allowlist"
                className="min-h-[140px] w-full rounded-md border border-[hsl(var(--input))] bg-transparent px-[calc(var(--control-padding-x)-4px)] py-3 text-sm"
                value={allowlistText}
                onChange={(event) =>
                  setPolicy((prev) => ({
                    ...prev,
                    allowlist: event.target.value
                      .split(/\s+/)
                      .map((h) => h.trim())
                      .filter(Boolean),
                  }))
                }
              />
            </div>
            <div className="space-y-4">
              <label className="flex items-center justify-between rounded-md border border-[hsl(var(--border))] px-4 py-3 text-sm">
                <span className="font-medium">Dry-run mode</span>
                <input
                  type="checkbox"
                  checked={Boolean(policy.dryRun)}
                  onChange={(event) => setPolicy((prev) => ({ ...prev, dryRun: event.target.checked }))}
                  aria-label="Toggle dry-run mode"
                />
              </label>
              <Input
                label="Redirect unsanctioned to"
                placeholder="https://chat.openai.com"
                value={policy.redirectTo ?? ''}
                onChange={(event) => setPolicy((prev) => ({ ...prev, redirectTo: event.target.value }))}
              />
              <div className="space-y-2">
                <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Feature flags</p>
                {Object.entries(policy.featureFlags ?? {}).map(([flag, enabled]) => (
                  <label
                    key={flag}
                    className="flex items-center justify-between rounded-md border border-[hsl(var(--border))] px-3 py-2 text-xs uppercase tracking-wide"
                  >
                    <span>{flag}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(enabled)}
                      onChange={(event) =>
                        setPolicy((prev) => ({
                          ...prev,
                          featureFlags: { ...prev.featureFlags, [flag]: event.target.checked },
                        }))
                      }
                      aria-label={`Toggle feature flag ${flag}`}
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-lg">
            <span>Rules</span>
            <Button size="sm" variant="outline" onClick={addRule}>
              Add rule
            </Button>
          </CardTitle>
          <CardDescription>Order evaluated top-down; first match decides the action.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {policy.rules.map((rule) => (
            <div
              key={rule.id}
              className="space-y-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
              data-testid={`policy-rule-${rule.id}`}
            >
              <div className="flex items-center justify-between gap-3">
                <Input
                  label="Rule name"
                  value={rule.name}
                  onChange={(event) => updateRule(rule.id, { name: event.target.value })}
                />
                <button
                  type="button"
                  className="text-xs text-[hsl(var(--destructive))]"
                  onClick={() => removeRule(rule.id)}
                >
                  Remove
                </button>
              </div>
              <Input
                label="Condition"
                placeholder="app NOT_IN allowlist"
                value={rule.condition}
                onChange={(event) => updateRule(rule.id, { condition: event.target.value })}
              />
              <div className="grid gap-3 md:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-[hsl(var(--muted-foreground))]" htmlFor={`action-${rule.id}`}>
                    Action
                  </label>
                  <select
                    id={`action-${rule.id}`}
                    className="h-[var(--control-height)] rounded-md border border-[hsl(var(--input))] bg-transparent px-3 text-sm"
                    value={rule.action}
                    onChange={(event) => updateRule(rule.id, { action: event.target.value as PolicyRule['action'] })}
                  >
                    {actions.map((action) => (
                      <option key={action} value={action}>
                        {action}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-[hsl(var(--muted-foreground))]" htmlFor={`risk-${rule.id}`}>
                    Risk level
                  </label>
                  <select
                    id={`risk-${rule.id}`}
                    className="h-[var(--control-height)] rounded-md border border-[hsl(var(--input))] bg-transparent px-3 text-sm"
                    value={rule.riskLevel}
                    onChange={(event) => updateRule(rule.id, { riskLevel: event.target.value as PolicyRule['riskLevel'] })}
                  >
                    {risks.map((risk) => (
                      <option key={risk} value={risk}>
                        {risk}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs font-medium text-[hsl(var(--muted-foreground))]">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(event) => updateRule(rule.id, { enabled: event.target.checked })}
                  />
                  Enabled
                </label>
              </div>
            </div>
          ))}
          {policy.rules.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">No rules defined. Add one to enforce safeguards.</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save policy'}
        </Button>
        {savedAt ? (
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            Saved {new Date(savedAt).toLocaleTimeString()}
          </span>
        ) : null}
      </div>
    </div>
  )
}

export default PolicyEditorPage
