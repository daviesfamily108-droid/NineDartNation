// @vitest-environment jsdom
import React from 'react'
// using built-in vitest assertions
import { render, screen, fireEvent } from '@testing-library/react'
import HelpdeskChat from '../HelpdeskChat'
import { vi, describe, it, beforeEach, expect } from 'vitest'

let mockSend = vi.fn()

// Mock WS provider used by the chat component
vi.mock('../WSProvider', () => ({
  useWS: () => ({
    send: (m: any) => mockSend(m),
    addListener: (fn: any) => {
      // no-op listener in test
      return () => {}
    }
  })
}))

describe('HelpdeskChat', () => {
  beforeEach(() => { mockSend = vi.fn() })

  it('renders messages and sends new message via WS', async () => {
    const req = { id: 'r1', username: 'testuser', messages: [{ fromName: 'User', message: 'Hello', ts: Date.now(), admin: false }] }
    const user = { email: 'user@example.com', username: 'user' }
    render(<HelpdeskChat request={req} user={user} onClose={() => {}} />)

  expect(screen.getByText('Hello')).toBeTruthy()

    const input = screen.getByPlaceholderText('Write a message...') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Reply from admin' } })
  const btns = screen.getAllByRole('button')
  // second button is the send button in the modal (first is close)
  const btn = btns[1]
  // Click send
  fireEvent.click(btn)

    // send should be called
    expect(mockSend).toHaveBeenCalled()
  })
})
