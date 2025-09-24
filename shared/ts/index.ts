export type Risk = 'low' | 'medium' | 'high' | 'critical'
export type PromptAction =
  | 'allow'
  | 'block'
  | 'sanitize'
  | 'warn'
  | 'require-approval'
  | 'redirect'
  | 'isolate'
  | 'block_if_not_allowed'

export interface PolicyRule {
  id: string
  category: string
  action: PromptAction
  scope: string[]
  detect?: string[]
  threshold?: number
  allow?: string[]
  deny?: string[]
  message?: string
  redirect_to?: string
}

export interface PolicySpec {
  version: string
  rules: PolicyRule[]
}

export type PolicyMode = 'enforce' | 'monitor' | 'disabled'

export interface PolicyRecord {
  id: string
  org_id?: string
  name: string
  mode: PolicyMode
  is_active: boolean
  spec: PolicySpec
  created_at?: string
  updated_at?: string
}

export const defaultPolicySpec: PolicySpec = {
  version: '1.1',
  rules: [
    {
      id: 'pii',
      category: 'PII',
      detect: ['email', 'phone', 'ssn', 'cc'],
      scope: ['prompt'],
      action: 'sanitize',
    },
    {
      id: 'secrets',
      category: 'Secrets',
      detect: ['api_key', 'token', 'private_key', 'jwt', 'db_url'],
      scope: ['prompt'],
      action: 'block',
    },
    {
      id: 'code',
      category: 'SourceCode',
      detect: ['code_block', 'sql'],
      scope: ['prompt'],
      action: 'sanitize',
    },
    {
      id: 'prompt_injection',
      category: 'PromptInjection',
      detect: ['jailbreak', 'ignore_prior', 'hidden_css', 'bidi', 'zero_width'],
      scope: ['prompt'],
      action: 'block',
    },
    {
      id: 'token_limit',
      category: 'TokenLimit',
      threshold: 0.9,
      scope: ['prompt'],
      action: 'warn',
    },
    {
      id: 'language',
      category: 'Language',
      allow: ['en'],
      scope: ['prompt'],
      action: 'block_if_not_allowed',
    },
  ],
}

export const defaultPolicyRecord: PolicyRecord = {
  id: 'default',
  name: 'Checkred AI Security Default',
  mode: 'enforce',
  is_active: true,
  spec: defaultPolicySpec,
}

export interface TelemetryEvent {
  ts: number
  userHash: string
  hostHash: string
  app: string
  type: 'prompt' | 'output' | 'shadow-ai' | 'policy'
  action: PromptAction
  risk: Risk
  redactionCount?: number
  sampleHash?: string
  findings?: { type: string; line?: number; message: string; severity: Risk }[]
  dryRun?: boolean
}

export interface RedactionResult {
  sanitized: string
  redactions: number
  reasons: string[]
}
