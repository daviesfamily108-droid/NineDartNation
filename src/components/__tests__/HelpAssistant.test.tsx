// @vitest-environment jsdom
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import HelpAssistant from '../HelpAssistant'
import { vi, describe, it, beforeEach, expect } from 'vitest'

// Import the real module and spy on apiFetch so the import resolver works in ESM
import * as api from '../../utils/api'

// Mock WS provider (no-op)
vi.mock('../WSProvider', () => ({ useWS: () => ({ send: () => {}, addListener: () => () => {} }) }))

describe('HelpAssistant escalation', () => {
  beforeEach(() => {
    // reset any existing spies/mocks
    if ((api as any).apiFetch && (api as any).apiFetch.mockReset) (api as any).apiFetch.mockReset()
    vi.restoreAllMocks()
  })

  it('posts a help request when user confirms escalation', async () => {
    // Spy on apiFetch
    const spy = vi.spyOn(api, 'apiFetch').mockImplementation(vi.fn())

    render(<HelpAssistant />)
    // open help
    const openBtn = screen.getByTitle('Help Assistant')
    fireEvent.click(openBtn)

    // type a message that triggers the "not sure" path
    const input = screen.getByPlaceholderText('Ask me anything...') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'blorp unknown topic' } })
    fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', charCode: 13 })

    // the assistant will ask to connect to an admin; wait for that prompt
    await waitFor(() => expect(screen.getByText(/connect you to a member of our admin team/i)).toBeTruthy())

    // Now respond YES
    fireEvent.change(input, { target: { value: 'YES' } })
    fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', charCode: 13 })

    // apiFetch should have been called to create help request
    await waitFor(() => {
      expect(spy).toHaveBeenCalled()
    })
  })
})
