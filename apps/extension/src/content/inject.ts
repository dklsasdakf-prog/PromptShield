import { installPromptInterceptors, announceInstallation } from './hooks'

declare const chrome: typeof globalThis.chrome

installPromptInterceptors()
announceInstallation()

if (chrome?.runtime) {
  chrome.runtime.sendMessage({ type: 'CHECKRED_CONTENT_READY' }).catch(() => undefined)
}
