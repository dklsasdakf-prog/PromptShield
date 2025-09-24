export type Risk = 'low'|'medium'|'high'|'critical'
export type Action = 'allow'|'block'|'sanitize'|'flag'

export interface PolicyRule {
  id: string
  name: string
  condition: string   // DSL string (see below)
  action: Action
  enabled: boolean
  riskLevel: Risk
}

export interface Policy {
  id: string
  name: string
  version: number
  rules: PolicyRule[]
  allowlist?: string[]   // sanctioned hosts
  dryRun?: boolean
  featureFlags?: Record<string, boolean>
  redirectTo?: string
}

export interface TelemetryEvent {
  ts: number
  userHash: string
  hostHash: string
  app: string
  type: 'prompt'|'output'|'shadow-ai'|'policy'
  action: Action
  risk: Risk
  redactionCount?: number
  sampleHash?: string
  findings?: { type:string; line?:number; message:string; severity:Risk }[]
  dryRun?: boolean
}

export interface RedactionResult { sanitized: string; redactions: number; reasons: string[] }

export const defaultPolicy: Policy = {
  id: 'default',
  name: 'Checkred AI Security Default',
  version: 1,
  dryRun: false,
  allowlist: ['chat.openai.com','claude.ai','gemini.google.com','bing.com'],
  featureFlags: { outputVetting: true, coachToasts: true, copySafely: true },
  rules: [
    { id:'r1', name:'Block unsanctioned AI', condition:'app NOT_IN allowlist', action:'block', enabled:true, riskLevel:'medium' },
    { id:'r2', name:'Sanitize secrets', condition:'contains(secrets)', action:'sanitize', enabled:true, riskLevel:'high' }
  ]
}
