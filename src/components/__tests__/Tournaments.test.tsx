// @vitest-environment jsdom
import React from 'react'
import { render, screen, within, cleanup, act } from '@testing-library/react'
import Tournaments from '../Tournaments'
import { useMatch } from '../../store/match'
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest'

describe('Tournaments', () => {
  beforeEach(() => {
    // reset match state
    useMatch.getState().importState({ roomId: '', players: [], currentPlayerIdx: 0, startingScore: 501, inProgress: false })
  })
  afterEach(() => {
    cleanup()
    useMatch.getState().importState({ roomId: '', players: [], currentPlayerIdx: 0, startingScore: 501, inProgress: false })
  })

  test('shows start overlay when match starts', async () => {
    const user = { email: 'a@example.com', username: 'Alice' }
    render(<Tournaments user={user} />)
    // Simulate a match starting
  await act(async () => { useMatch.getState().newMatch(['Alice', 'Bob'], 501) })
    // Now the overlay should show via our useEffect
    expect(await screen.findByRole('dialog')).toBeTruthy()
    // Close overlay by flipping inProgress false
  await act(async () => { useMatch.getState().endGame() })
  })
})
