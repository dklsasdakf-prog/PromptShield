const ENV = typeof process !== 'undefined' && process.env ? process.env : undefined
const runtime = globalThis as {
  CHECKRED_API_URL?: string
  CHECKRED_API_TOKEN?: string
  CHECKRED_AUTH_SCHEME?: 'bearer' | 'cookie'
}

export const API_BASE = runtime.CHECKRED_API_URL ?? ENV?.CHECKRED_API_URL ?? 'http://localhost:8080'
const API_TOKEN = runtime.CHECKRED_API_TOKEN ?? ENV?.CHECKRED_API_TOKEN
const AUTH_SCHEME = (runtime.CHECKRED_AUTH_SCHEME ?? ENV?.CHECKRED_AUTH_SCHEME ?? (API_TOKEN ? 'bearer' : 'cookie')) as
  | 'bearer'
  | 'cookie'

export interface ApiFetchOptions extends RequestInit {
  acceptJson?: boolean
}

export async function apiFetch(path: string, init: ApiFetchOptions = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {})
  if (init.acceptJson ?? true) {
    if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const requestInit: RequestInit = { ...init, headers }

  if (AUTH_SCHEME === 'bearer' && API_TOKEN) {
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${API_TOKEN}`)
    }
    requestInit.credentials = init.credentials ?? 'omit'
  } else {
    requestInit.credentials = init.credentials ?? 'include'
  }

  return fetch(`${API_BASE}${path}`, requestInit)
}

export function getAuthScheme(): 'bearer' | 'cookie' {
  return AUTH_SCHEME
}

export function hasApiToken(): boolean {
  return Boolean(API_TOKEN)
}
