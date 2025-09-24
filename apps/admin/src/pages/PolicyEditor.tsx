import React, { useEffect, useMemo, useState } from 'react'
import { Check, PlusCircle } from 'lucide-react'
import type { PolicyRecord } from '@checkred-ai-security/shared'
import { defaultPolicySpec } from '@checkred-ai-security/shared'
import { toast } from 'sonner'

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Skeleton,
  Textarea,
} from '../components/security-theme'
import { createPolicy, fetchPolicies, updatePolicy, type PoliciesResponse } from '../lib/api'
import { validatePolicySpec, type PolicySpecInput } from '../lib/policySchema'

const EMPTY_SPEC = JSON.stringify(defaultPolicySpec, null, 2)

type Draft = {
  name: string
  mode: 'enforce' | 'monitor' | 'disabled'
  is_active: boolean
  specText: string
}

type DraftErrors = Partial<Record<keyof Draft, string>>

const initialDraft: Draft = {
  name: '',
  mode: 'enforce',
  is_active: true,
  specText: EMPTY_SPEC,
}

const formatIssuePath = (path: (string | number)[]) =>
  path.reduce<string>((acc, segment) => {
    if (typeof segment === 'number') {
      return `${acc}[${segment}]`
    }
    return acc ? `${acc}.${segment}` : segment
  }, '')

const PolicyEditor: React.FC = () => {
  const [policies, setPolicies] = useState<PolicyRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(initialDraft)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [isFetching, setIsFetching] = useState(true)
  const [savingAction, setSavingAction] = useState<'save' | 'create' | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 10
  const [meta, setMeta] = useState<PoliciesResponse['meta'] | null>(null)

  useEffect(() => {
    let canceled = false
    setIsFetching(true)
    fetchPolicies(page, pageSize)
      .then((data) => {
        if (canceled) return
        if (data.items.length === 0 && data.meta.pages > 0 && page > data.meta.pages) {
          setPage(data.meta.pages)
          return
        }
        setPolicies(data.items)
        setMeta(data.meta)
        setErrors({})

        let nextSelected: PolicyRecord | null = null
        setSelectedId((previous) => {
          const existing = data.items.find((policy) => policy.id === previous)
          if (existing) {
            nextSelected = existing
            return previous
          }
          nextSelected = data.items[0] ?? null
          return nextSelected?.id ?? null
        })

        if (nextSelected) {
          setDraft({
            name: nextSelected.name,
            mode: nextSelected.mode,
            is_active: nextSelected.is_active,
            specText: JSON.stringify(nextSelected.spec, null, 2),
          })
        } else {
          setDraft(initialDraft)
        }
      })
      .catch((error) => {
        if (canceled) return
        console.error(error)
        toast.error('Failed to load policies')
      })
      .finally(() => {
        if (!canceled) setIsFetching(false)
      })

    return () => {
      canceled = true
    }
  }, [page, pageSize])

  const selectedPolicy = useMemo(() => policies.find((policy) => policy.id === selectedId) ?? null, [policies, selectedId])

  const selectPolicy = (policy: PolicyRecord) => {
    setSelectedId(policy.id)
    setDraft({
      name: policy.name,
      mode: policy.mode,
      is_active: policy.is_active,
      specText: JSON.stringify(policy.spec, null, 2),
    })
    setErrors({})
  }

  const validateDraft = (): PolicySpecInput | null => {
    const nextErrors: DraftErrors = {}
    const trimmedName = draft.name.trim()
    if (!trimmedName) {
      nextErrors.name = 'Policy name is required'
    }

    let spec: PolicySpecInput | null = null
    try {
      const parsed = JSON.parse(draft.specText)
      const result = validatePolicySpec(parsed)
      if (result.success) {
        spec = result.data
      } else {
        const issue = result.error.issues[0]
        const path = issue.path.length ? ` (${formatIssuePath(issue.path)})` : ''
        nextErrors.specText = `${issue.message}${path}`
      }
    } catch {
      nextErrors.specText = 'Spec must be valid JSON'
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return null
    }

    setErrors({})
    return spec
  }

  const handleSave = async () => {
    if (!selectedPolicy) return
    const spec = validateDraft()
    if (!spec) return

    const payload = {
      name: draft.name.trim(),
      mode: draft.mode,
      is_active: draft.is_active,
      spec,
    }

    setSavingAction('save')
    try {
      const updated = await updatePolicy(selectedPolicy.id, payload)
      setPolicies((prev) => prev.map((policy) => (policy.id === updated.id ? updated : policy)))
      setDraft({
        name: updated.name,
        mode: updated.mode,
        is_active: updated.is_active,
        specText: JSON.stringify(updated.spec, null, 2),
      })
      toast.success('Policy updated')
    } catch (error) {
      console.error(error)
      toast.error('Policy update failed')
    } finally {
      setSavingAction(null)
    }
  }

  const handleCreate = async () => {
    const spec = validateDraft()
    if (!spec) return

    const payload = {
      name: draft.name.trim(),
      mode: draft.mode,
      is_active: draft.is_active,
      spec,
    }

    setSavingAction('create')
    try {
      const created = await createPolicy(payload)
      setMeta((prev) => {
        if (!prev) return prev
        const total = prev.total + 1
        const pages = Math.max(1, Math.ceil(total / pageSize))
        return {
          ...prev,
          total,
          pages,
          has_next: page < pages,
          has_prev: page > 1,
        }
      })
      if (page === 1) {
        setPolicies((prev) => [created, ...prev].slice(0, pageSize))
      } else {
        setPage(1)
      }
      setSelectedId(created.id)
      setDraft({
        name: created.name,
        mode: created.mode,
        is_active: created.is_active,
        specText: JSON.stringify(created.spec, null, 2),
      })
      toast.success('Policy created')
    } catch (error) {
      console.error(error)
      toast.error('Unable to create policy')
    } finally {
      setSavingAction(null)
    }
  }

  if (isFetching && policies.length === 0) {
    return <PolicyEditorSkeleton />
  }

  return (
    <div className="grid gap-6 p-6 md:grid-cols-[280px,1fr]" data-testid="policy-editor">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Policies</CardTitle>
          <CardDescription>Manage enforcement packs delivered to the extension.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {policies.map((policy) => (
              <button
                key={policy.id}
                type="button"
                onClick={() => selectPolicy(policy)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition hover:bg-[hsla(var(--foreground),0.04)] ${
                  selectedId === policy.id
                    ? 'border-[hsl(var(--accent-foreground))] text-[hsl(var(--accent-foreground))]'
                    : 'border-[hsla(var(--border),0.7)] text-[hsl(var(--foreground))]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{policy.name}</span>
                  {policy.is_active ? <Check className="h-3 w-3" aria-hidden /> : null}
                </div>
                <p className="text-xs uppercase text-[hsl(var(--muted-foreground))]">Mode: {policy.mode}</p>
              </button>
            ))}
            {policies.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                No policies yet. Draft configuration on the right and click “New policy” to create your first one.
              </p>
            ) : null}
          </div>
          {meta ? (
            <div className="flex items-center justify-between border-t border-[hsla(var(--border),0.5)] pt-3 text-xs text-[hsl(var(--muted-foreground))]">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => meta.has_prev && setPage((prev) => Math.max(1, prev - 1))}
                disabled={!meta.has_prev || isFetching}
              >
                Previous
              </Button>
              <span>
                Page {meta.page} of {meta.pages} · {meta.total} policies
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => meta.has_next && setPage((prev) => prev + 1)}
                disabled={!meta.has_next || isFetching}
              >
                Next
              </Button>
            </div>
          ) : null}
          <Button variant="outline" size="sm" className="w-full" onClick={handleCreate} disabled={savingAction !== null}>
            <PlusCircle className="mr-2 h-3 w-3" aria-hidden />
            {savingAction === 'create' ? 'Creating…' : 'New policy'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{selectedPolicy ? 'Edit policy' : 'Create policy'}</CardTitle>
          <CardDescription>
            {selectedPolicy
              ? 'Update schema and rollout mode. Spec must be valid JSON.'
              : 'Define a policy spec and save it to publish to the extension.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Policy name"
            value={draft.name}
            onChange={(event) => {
              const value = event.target.value
              setDraft((prev) => ({ ...prev, name: value }))
              setErrors((prev) => ({ ...prev, name: undefined }))
            }}
            error={errors.name}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <Select
              label="Mode"
              value={draft.mode}
              onChange={(event) => setDraft((prev) => ({ ...prev, mode: event.target.value as Draft['mode'] }))}
            >
              <option value="enforce">Enforce</option>
              <option value="monitor">Monitor</option>
              <option value="disabled">Disabled</option>
            </Select>
            <label className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--foreground))]">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(event) => setDraft((prev) => ({ ...prev, is_active: event.target.checked }))}
              />
              Active
            </label>
          </div>
          <Textarea
            label="Policy spec"
            minRows={16}
            value={draft.specText}
            onChange={(event) => {
              const value = event.target.value
              setDraft((prev) => ({ ...prev, specText: value }))
              setErrors((prev) => ({ ...prev, specText: undefined }))
            }}
            error={errors.specText}
          />
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={!selectedPolicy || savingAction !== null}>
              {savingAction === 'save' ? 'Saving…' : 'Save changes'}
            </Button>
            {selectedPolicy ? null : (
              <span className="text-xs text-[hsl(var(--muted-foreground))]">Create a policy first, then edits will be enabled.</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

const PolicyEditorSkeleton: React.FC = () => (
  <div className="grid gap-6 p-6 md:grid-cols-[280px,1fr]" data-testid="policy-editor">
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-40" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-md" />
          ))}
        </div>
        <Skeleton className="h-8 w-full rounded-md" />
      </CardContent>
    </Card>
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-3 w-64" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-10 w-32" />
      </CardContent>
    </Card>
  </div>
)

export default PolicyEditor
