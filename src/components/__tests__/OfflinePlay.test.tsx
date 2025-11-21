// @vitest-environment jsdom
import React from 'react'
import { render, screen, act } from '@testing-library/react'
import OfflinePlay from '../OfflinePlay'
import { useMatch } from '../../store/match'
import { describe, test, expect, beforeEach, afterEach } from 'vitest'

describe('OfflinePlay', () => {
  beforeEach(() => {
    useMatch.getState().importState({ roomId: '', players: [], currentPlayerIdx: 0, startingScore: 501, inProgress: false })
  })
  afterEach(() => {
    useMatch.getState().importState({ roomId: '', players: [], currentPlayerIdx: 0, startingScore: 501, inProgress: false })
  })

  test("shows MatchStartShowcase for offline matches", async () => {
    const user = { email: 'a@example.com', username: 'Alice' }
    render(<OfflinePlay user={user} />)
    // Start a local offline match directly via the store
  await act(async () => { useMatch.getState().newMatch(['Alice','AI'], 301) })
    // Now we show overlay for offline matches on match.inProgress flip
    const found = await screen.findByRole('dialog')
    expect(found).toBeTruthy()
  })
})
