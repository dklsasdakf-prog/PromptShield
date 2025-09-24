import type { PolicyConfig } from '../shared/policyConfig'
import { fetchPolicyConfig } from '../shared/policyConfig'

const CACHE_TTL_MS = 5 * 60 * 1000

let cachedPolicy: { value: PolicyConfig; fetchedAt: number } | null = null

async function getCachedPolicy(force = false): Promise<PolicyConfig> {
  if (!force && cachedPolicy) {
    const age = Date.now() - cachedPolicy.fetchedAt
    if (age < CACHE_TTL_MS) {
      return cachedPolicy.value
    }
  }
  const fetched = await fetchPolicyConfig()
  cachedPolicy = { value: fetched, fetchedAt: Date.now() }
  return fetched
}

chrome.runtime.onInstalled.addListener(() => {
  console.info('[Checkred] Extension installed')
  getCachedPolicy().catch((error) => console.warn('[Checkred] policy prefetch failed', error))
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'CHECKRED_CONTENT_READY') {
    console.info('[Checkred] content script ready', sender.tab?.id)
    sendResponse({ ok: true })
    return undefined
  }

  if (message?.type === 'CHECKRED_FETCH_POLICY') {
    getCachedPolicy(Boolean(message.force))
      .then((config) => sendResponse(config))
      .catch((error) => {
        console.warn('[Checkred] policy fetch failed', error)
        sendResponse({ error: String(error) })
      })
    return true
  }

  if (message?.type === 'CHECKRED_RESET_POLICY') {
    cachedPolicy = null
    sendResponse({ ok: true })
    return undefined
  }

  return undefined
})
