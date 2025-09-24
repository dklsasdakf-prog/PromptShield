export const Targets = {
  chatgpt: { host: /(^|\.)openai\.com$/, prompt: 'textarea, [data-id=prompt-textarea]', streamSelector: 'div[data-message-author-role=assistant]' },
  claude:  { host: /(^|\.)claude\.ai$/, prompt: 'textarea', streamSelector: '[data-test=message]' },
  gemini:  { host: /(^|\.)gemini\.google\.com$/, prompt: 'textarea', streamSelector: 'chat-message,textarea' },
  copilot: { host: /(^|\.)bing\.com$/, prompt: 'textarea,[contenteditable=true]', streamSelector: '[aria-live=polite]' }
} as const
