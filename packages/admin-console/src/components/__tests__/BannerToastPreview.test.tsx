import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { BannerToastPreview } from '../ComponentLibrarySpec'

describe('BannerToastPreview', () => {
  it('exposes alert role and dismisses via keyboard', async () => {
    const user = userEvent.setup()
    render(<BannerToastPreview />)

    await user.click(screen.getByRole('button', { name: /view transcript/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toBeInTheDocument()

    const dismiss = within(alert).getByRole('button', { name: /dismiss/i })
    dismiss.focus()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})
