// @vitest-environment jsdom
import React from 'react'
import { render, screen, act } from '@testing-library/react'
import { vi } from 'vitest'
// Mock WSProvider to avoid real network connections during unit tests
vi.mock('../WSProvider', () => ({
  WSProvider: ({ children }: any) => <>{children}</>,
  useWS: () => ({ connected: false, status: 'disconnected', send: () => {}, addListener: () => () => {}, reconnect: () => {} })
}))
import OnlinePlay from '../OnlinePlay'
import { useMatch } from '../../store/match'
import { describe, test, expect, beforeEach, afterEach } from 'vitest'

describe('OnlinePlay', () => {
  beforeEach(() => {
    useMatch.getState().importState({ roomId: '', players: [], currentPlayerIdx: 0, startingScore: 501, inProgress: false })
  })
  afterEach(() => {
    // Reset match state
    useMatch.getState().importState({ roomId: '', players: [], currentPlayerIdx: 0, startingScore: 501, inProgress: false })
  })

  test('shows MatchStartShowcase when a match starts', async () => {
    const user = { email: 'a@example.com', username: 'Alice' }
    render(<OnlinePlay user={user} />)
    // Start a new match via the store
    await act(async () => {
      useMatch.getState().newMatch(['Alice','Bob'], 501)
    })
    // Expect the overlay dialog to appear; be tolerant of async timing
    expect(await screen.findByRole('dialog', {}, { timeout: 2000 })).toBeTruthy()
  })
})
