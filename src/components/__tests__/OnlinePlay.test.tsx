// @vitest-environment jsdom
import React from 'react'
import { render, screen } from '@testing-library/react'
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
    useMatch.getState().newMatch(['Alice','Bob'], 501)
    // Expect the overlay dialog to appear
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })
})
