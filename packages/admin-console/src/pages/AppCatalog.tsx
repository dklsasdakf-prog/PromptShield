import React, { useEffect, useState } from 'react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from '../components/security-theme'
import type { Policy } from '../../../shared'
import { defaultPolicy } from '../../../shared'
import { getPolicy, savePolicy } from '../lib/bridge'

const AppCatalog: React.FC = () => {
  const [policy, setPolicy] = useState<Policy>(defaultPolicy)
  const [hostInput, setHostInput] = useState('')
  const [loading, setLoading] = useState(true)
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

  const allowlist = policy.allowlist ?? []

  const commit = async (nextPolicy: Policy) => {
    setPolicy(nextPolicy)
    await savePolicy(nextPolicy)
    setSavedAt(Date.now())
  }

  const addHost = async () => {
    const trimmed = hostInput.trim()
    if (!trimmed) return
    if (allowlist.includes(trimmed)) {
      setHostInput('')
      return
    }
    await commit({ ...policy, allowlist: [...allowlist, trimmed] })
    setHostInput('')
  }

  const removeHost = async (host: string) => {
    await commit({ ...policy, allowlist: allowlist.filter((h) => h !== host) })
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-[hsl(var(--muted-foreground))]">
          Loading allowlist…
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="text-lg">AI app catalog</CardTitle>
          <CardDescription>Manage sanctioned hosts for the browser extension.</CardDescription>
        </div>
        {savedAt ? (
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            Updated {new Date(savedAt).toLocaleTimeString()}
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row">
          <Input
            label="Add hostname"
            placeholder="claude.ai"
            value={hostInput}
            onChange={(event) => setHostInput(event.target.value)}
          />
          <Button className="self-start" onClick={addHost}>
            Add host
          </Button>
        </div>
        <div className="divide-y divide-[hsl(var(--border))] rounded-lg border border-[hsl(var(--border))]">
          {allowlist.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[hsl(var(--muted-foreground))]">No sanctioned hosts yet.</p>
          ) : (
            allowlist.map((host) => (
              <div key={host} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-[hsl(var(--foreground))]">{host}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Allowed service</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => removeHost(host)}>
                  Remove
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default AppCatalog
