import type { Risk } from './index'
import type { DetectorMap, DetectorName } from './detectors'

export interface EvaluationContext {
  app?: string
  host?: string
  allowlist?: string[]
  secretsFound?: boolean
  risk?: Risk
  detectors?: DetectorMap
}

const riskOrder: Risk[] = ['low', 'medium', 'high', 'critical']
const riskRank = (value?: Risk) => (value ? riskOrder.indexOf(value) : -1)

export function evalCondition(cond: string, ctx: EvaluationContext): boolean {
  const norm = cond.trim()
  const host = ctx.app || ctx.host || ''

  if (/^(app|host)\s+NOT_IN\s+allowlist$/i.test(norm)) {
    return !(ctx.allowlist ?? []).some((h) => host.endsWith(h))
  }
  if (/^(app|host)\s+IN\s+allowlist$/i.test(norm)) {
    return (ctx.allowlist ?? []).some((h) => host.endsWith(h))
  }
  if (/^contains\(secrets\)$/i.test(norm)) {
    return Boolean(ctx.secretsFound || ctx.detectors?.secrets)
  }
  const riskMatch = norm.match(/^risk\s*>=\s*(low|medium|high|critical)$/i)
  if (riskMatch) {
    const threshold = riskMatch[1].toLowerCase() as Risk
    return riskRank(ctx.risk) >= riskRank(threshold)
  }
  const detectorMatch = norm.match(/^contains\(pattern:([a-z0-9_-]+)\)$/i)
  if (detectorMatch) {
    const key = detectorMatch[1] as DetectorName
    return Boolean(ctx.detectors && ctx.detectors[key])
  }
  return false
}

export function decide(policy: Policy, ctx: EvaluationContext) {
  for (const r of policy.rules) {
    if (!r.enabled) continue
    if (evalCondition(r.condition, ctx)) return { action: r.action, rule: r }
  }
  return { action: 'allow', rule: null }
}
