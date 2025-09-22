export type Risk = 'low' | 'medium' | 'high' | 'critical'
export type Action = 'allow' | 'block' | 'sanitize' | 'flag'

export interface PolicyRule {
  id: string
  name: string
  condition: string
  action: Action
  enabled: boolean
  riskLevel: Risk
}

export interface Policy {
  id: string
  name: string
  rules: PolicyRule[]
  version: number
}

export interface TelemetryEvent {
  ts: number
  userHash: string // sha256(email|tenantSalt)
  hostHash: string // sha256(hostname|tenantSalt)
  app: string // e.g., 'chat.openai.com'
  type: 'prompt' | 'output' | 'shadow-ai' | 'policy'
  action: Action
  risk: Risk
  redactionCount?: number
  sampleHash?: string // sha256(sampleText|rotatingSalt)
}

export interface RedactionResult {
  sanitized: string
  redactions: number
  reasons: string
}
