import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RiskBadge } from '../ComponentLibrarySpec'

describe('RiskBadge', () => {
  it('announces level and score via aria-label', () => {
    render(<RiskBadge level="high" score={82} />)
    const badge = screen.getByTestId('risk-badge')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveAttribute('aria-label', expect.stringContaining('risk-high-score-82'))
  })
})
