import { z } from 'zod'

const promptActions = [
  'allow',
  'block',
  'sanitize',
  'warn',
  'require-approval',
  'redirect',
  'isolate',
  'block_if_not_allowed',
] as const

const nonEmptyString = z.string().trim().min(1, 'Value cannot be empty')
export const policyRuleSchema = z
  .object({
    id: nonEmptyString.describe('Unique rule identifier'),
    category: nonEmptyString.describe('Category label'),
    action: z.enum(promptActions, {
      errorMap: () => ({ message: 'Action must be a supported enforcement type' }),
    }),
    scope: z.array(nonEmptyString).min(1, 'Scope must include at least one entry').max(100, 'Too many scope entries'),
    detect: z
      .array(nonEmptyString)
      .min(1, 'Provide at least one detector id')
      .max(100, 'Too many detector entries')
      .optional(),
    threshold: z
      .number({ invalid_type_error: 'Threshold must be a number' })
      .gte(0, 'Threshold must be at least 0')
      .lte(1, 'Threshold cannot exceed 1')
      .optional(),
    allow: z
      .array(nonEmptyString)
      .min(1, 'Allow list cannot be empty')
      .max(100, 'Too many allow list entries')
      .optional(),
    deny: z
      .array(nonEmptyString)
      .min(1, 'Deny list cannot be empty')
      .max(100, 'Too many deny list entries')
      .optional(),
    message: z.string().trim().min(1, 'Message cannot be empty').optional(),
    redirect_to: z.string().trim().min(1, 'Redirect destination cannot be empty').optional(),
  })
  .strict()

export const policySpecSchema = z
  .object({
    version: nonEmptyString,
    rules: z.array(policyRuleSchema).min(1, 'At least one rule is required'),
  })
  .strict()

type SpecInput = {
  rules?: Array<Record<string, unknown>>
} & Record<string, unknown>

const normalizeRule = (rule: Record<string, unknown>) => {
  const normalized: Record<string, unknown> = {}
  Object.entries(rule).forEach(([key, value]) => {
    if (key === 'redirectTo' && !('redirect_to' in normalized)) {
      normalized.redirect_to = value
      return
    }
    normalized[key] = value
  })
  return normalized
}

export const normalizePolicySpec = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') return value
  const spec = value as SpecInput
  if (!Array.isArray(spec.rules)) return value
  return {
    ...spec,
    rules: spec.rules.map((rule) => (rule && typeof rule === 'object' ? normalizeRule(rule) : rule)),
  }
}

export const validatePolicySpec = (value: unknown) => {
  const normalized = normalizePolicySpec(value)
  return policySpecSchema.safeParse(normalized)
}

export type PolicyRuleInput = z.infer<typeof policyRuleSchema>
export type PolicySpecInput = z.infer<typeof policySpecSchema>
