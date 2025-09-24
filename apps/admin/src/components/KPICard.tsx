import React from 'react'

import { Skeleton } from './security-theme'

interface KPICardProps {
  title: string
  value: string | number
  description?: string
  icon?: React.ReactNode
  loading?: boolean
}

const KPICard: React.FC<KPICardProps> = ({ title, value, description, icon, loading }) => {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
        <span>{title}</span>
        {icon ? <span className="text-[hsl(var(--accent-foreground))]">{icon}</span> : null}
      </div>
      <div className="mt-3 min-h-[1.75rem] text-3xl font-semibold text-[hsl(var(--foreground))]">
        {loading ? <Skeleton className="h-7 w-24" /> : value}
      </div>
      {description ? <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{description}</p> : null}
    </div>
  )
}

export default KPICard
