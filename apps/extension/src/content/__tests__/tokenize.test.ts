import { describe, expect, it } from 'vitest'

import { tokenizeSensitive } from '../tokenize'

describe('tokenizeSensitive', () => {
  it('tokenizes PII with deterministic masking', async () => {
    const input = 'Contact jane.doe@example.com or call 4111 1111 1111 1111 about the incident.'
    const result = await tokenizeSensitive(input, [], { orgId: 'acme' })

    const emailFragment = result.fragments.find(
      (fragment): fragment is Extract<typeof fragment, { kind: 'pii'; maskType: 'email' }> =>
        fragment.kind === 'pii' && fragment.maskType === 'email',
    )
    const cardFragment = result.fragments.find(
      (fragment): fragment is Extract<typeof fragment, { kind: 'pii'; maskType: 'cc' }> =>
        fragment.kind === 'pii' && fragment.maskType === 'cc',
    )

    expect(result.reasons).toContain('pii')
    expect(result.redactions).toBeGreaterThanOrEqual(2)
    expect(emailFragment?.text).toMatch(/tok:[0-9a-f]{8}-[0-9a-f]{4}@example\.com/i)
    expect(emailFragment?.original).toBe('jane.doe@example.com')
    expect(cardFragment?.text).not.toContain('4111')
    expect(cardFragment?.token).toMatch(/tok:[0-9a-f]{8}-[0-9a-f]{4}/i)
    expect(result.highlights.length).toBeGreaterThanOrEqual(2)
  })

  it('fully redacts when a secret hint is provided', async () => {
    const input = 'sk-live-abcdefghijklmnopqrstuvwxyz12'
    const result = await tokenizeSensitive(input, ['secrets'])

    expect(result.sanitized).toBe('[REDACTED]')
    expect(result.reasons).toContain('secret')
    expect(result.redactions).toBeGreaterThanOrEqual(1)
  })

  it('produces deterministic sanitization for code blocks', async () => {
    const codeSample = 'Context ```console.log(42)``` and more code ```console.log(42)```'
    const first = await tokenizeSensitive(codeSample, [], { orgId: 'acme' })
    const second = await tokenizeSensitive(codeSample, [], { orgId: 'acme' })

    expect(first.sanitized).toBe(second.sanitized)
    expect(first.reasons).toContain('code')
    expect(first.fragments.some((fragment) => fragment.kind === 'code')).toBe(true)
  })

  it('scopes tokens to the organization identifier', async () => {
    const sample = 'Email jane.doe@example.com'
    const acme = await tokenizeSensitive(sample, [], { orgId: 'acme' })
    const beta = await tokenizeSensitive(sample, [], { orgId: 'beta' })

    expect(acme.sanitized).not.toBe(beta.sanitized)
    const again = await tokenizeSensitive(sample, [], { orgId: 'acme' })
    expect(acme.sanitized).toBe(again.sanitized)
  })
})
