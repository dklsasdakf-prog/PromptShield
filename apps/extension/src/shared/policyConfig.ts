import type { PolicySpec } from '@checkred-ai-security/shared'
import { defaultPolicySpec } from '@checkred-ai-security/shared'
import nacl from 'tweetnacl'

import { apiFetch } from './api'

const ENV = typeof process !== 'undefined' && process.env ? process.env : undefined
const DEFAULT_PUBKEY_B64 = 'nMoZCTrEbjD7u8ywsG32IOzBSSMSmc5QwDFi1Cdm42w='

function decodeBase64(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(b64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }
  const nodeBuffer = (globalThis as { Buffer?: { from(input: string, encoding: string): Uint8Array } }).Buffer
  if (nodeBuffer) {
    const buf = nodeBuffer.from(b64, 'base64')
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  }
  throw new Error('Base64 decoding not supported in this environment')
}

function canonicalPayload(payload: Record<string, unknown>): Uint8Array {
  const sortedObj: Record<string, unknown> = {}
  Object.keys(payload)
    .filter((key) => key !== 'signature')
    .sort()
    .forEach((key) => {
      sortedObj[key] = payload[key]
    })
  return new TextEncoder().encode(JSON.stringify(sortedObj))
}

function verifySignature(
  payload: Record<string, unknown>,
  publicKeyB64: string | undefined,
  signatureB64: string | undefined,
): boolean {
  if (!signatureB64) return false
  const runtimeKey = (globalThis as { CHECKRED_CONFIG_PUBKEY?: string }).CHECKRED_CONFIG_PUBKEY
  const resolvedKey = publicKeyB64 ?? runtimeKey ?? ENV?.CHECKRED_CONFIG_PUBKEY ?? DEFAULT_PUBKEY_B64
  try {
    const verifyKey = decodeBase64(resolvedKey)
    const message = new Uint8Array(canonicalPayload(payload))
    const signature = decodeBase64(signatureB64)
    return nacl.sign.detached.verify(message, signature, verifyKey)
  } catch (error) {
    console.warn('[Checkred] config signature verification failed', error)
    return false
  }
}

export interface PolicyConfig {
  org_id: string | null
  policy_pack: PolicySpec
  sanctioned_domains: string[]
  feature_flags: Record<string, boolean>
  signature_valid: boolean
  signature_public_key: string | null
}

export async function fetchPolicyConfig(): Promise<PolicyConfig> {
  const response = await apiFetch('/v1/config/extension')
  if (!response.ok) {
    throw new Error(`Config endpoint failed (${response.status})`)
  }
  const payload = (await response.json()) as Record<string, unknown>
  const signaturePublicKey = typeof payload.signature_public_key === 'string' ? payload.signature_public_key : undefined
  const signatureValid = verifySignature(payload, signaturePublicKey, payload.signature as string | undefined)
  return {
    org_id: typeof payload.org_id === 'string' ? payload.org_id : null,
    policy_pack: (payload.policy_pack as PolicySpec) ?? defaultPolicySpec,
    sanctioned_domains: (payload.sanctioned_domains as string[]) ?? [],
    feature_flags: (payload.feature_flags as Record<string, boolean>) ?? {},
    signature_valid: signatureValid,
    signature_public_key: signaturePublicKey ?? null,
  }
}

export function canonicalizeConfigPayload(payload: Record<string, unknown>): Uint8Array {
  return canonicalPayload(payload)
}

export function verifyConfigSignature(
  payload: Record<string, unknown>,
  publicKeyB64?: string,
  signatureB64?: string,
): boolean {
  return verifySignature(payload, publicKeyB64, signatureB64 ?? (payload.signature as string | undefined))
}
