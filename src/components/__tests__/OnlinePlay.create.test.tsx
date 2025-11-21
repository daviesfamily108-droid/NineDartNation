// @vitest-environment jsdom
import React from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
// Mock WSProvider to avoid real network connections during unit tests
const mockSend = vi.fn()
vi.mock('../WSProvider', () => ({
  WSProvider: ({ children }: any) => <>{children}</>,
  useWS: () => ({ connected: true, status: 'connected', send: mockSend, addListener: () => () => {}, reconnect: () => {} })
}))
import OnlinePlay from '../OnlinePlay'
import { useMatch } from '../../store/match'
import { describe, test, expect, beforeEach, afterEach } from 'vitest'

describe('OnlinePlay create modal', () => {
  beforeEach(() => {
    useMatch.getState().importState({ roomId: '', players: [], currentPlayerIdx: 0, startingScore: 501, inProgress: false })
    mockSend.mockClear()
  })
  afterEach(() => {
    useMatch.getState().importState({ roomId: '', players: [], currentPlayerIdx: 0, startingScore: 501, inProgress: false })
  })

  test('renders create modal and uses per-game mapping options', async () => {
    const user = { email: 'a@example.com', username: 'Alice' }
    render(<OnlinePlay user={user} />)
    // Click the Create Match + button
    const createButton = await screen.findByText('Create Match +')
    await act(async () => { fireEvent.click(createButton) })
    // The modal card should show the header
    expect(await screen.findByText('Create Match')).toBeTruthy()
  // Select game X01 and ensure Starting Score select is present
  const gameSelect = await screen.findByLabelText(/game/i)
  expect(gameSelect).toBeTruthy()
  const startSelect = await screen.findByLabelText(/X01 Starting Score/i)
  expect(startSelect).toBeTruthy()
  })
})
