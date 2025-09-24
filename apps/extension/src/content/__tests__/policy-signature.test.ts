import { describe, it, expect } from 'vitest'
import nacl from 'tweetnacl'
import { Buffer } from 'node:buffer'

import { canonicalizeConfigPayload, verifyConfigSignature } from '../policy'

const DEV_PRIVATE_KEY_B64 = 'pQ8d3OrlQ8PGVc3r7c6DL68w6bwOUFVLc80SC49qKC0='
const DEV_PUBLIC_KEY_B64 = '80oEGHRr4FBY1+/pWqTNGE4qe6ghFV0FathO9YvcvZY='

function signConfigPayload(body: Record<string, unknown>): Record<string, unknown> {
  const seedBuffer = Buffer.from(DEV_PRIVATE_KEY_B64, 'base64')
  const seed = new Uint8Array(seedBuffer.buffer, seedBuffer.byteOffset, seedBuffer.byteLength)
  const keyPair = nacl.sign.keyPair.fromSeed(seed)
  const message = new Uint8Array(canonicalizeConfigPayload(body))
  const signature = nacl.sign.detached(message, new Uint8Array(keyPair.secretKey))
  return { ...body, signature: Buffer.from(signature).toString('base64') }
}

describe('verifyConfigSignature', () => {
  const basePayload = {
    org_id: 'org-123',
    policy_pack: { version: '1.1', rules: [] },
    sanctioned_domains: ['chatgpt.com'],
    feature_flags: { domShield: true },
    signature_public_key: DEV_PUBLIC_KEY_B64,
    version: '1.0',
    signed_at: '2024-01-01T00:00:00.000Z',
  }

  it('accepts payload signed with the matching Ed25519 key', () => {
    const signed = signConfigPayload(basePayload)
    expect(verifyConfigSignature(signed, DEV_PUBLIC_KEY_B64)).toBe(true)
  })

  it('rejects tampered payloads', () => {
    const signed = signConfigPayload(basePayload)
    const tampered = { ...signed, feature_flags: { domShield: false } }
    expect(verifyConfigSignature(tampered, DEV_PUBLIC_KEY_B64)).toBe(false)
  })

  it('rejects payloads without a signature', () => {
    const { signature, ...rest } = signConfigPayload(basePayload)
    expect(signature).toBeTypeOf('string')
    expect(verifyConfigSignature(rest, DEV_PUBLIC_KEY_B64)).toBe(false)
  })
})
