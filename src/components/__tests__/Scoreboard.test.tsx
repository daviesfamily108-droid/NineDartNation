// @vitest-environment jsdom
import React from 'react'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import Scoreboard from '../Scoreboard'
import { useMatch } from '../../store/match'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Scoreboard', () => {
  const originalStoreFuncs = {
    addVisit: useMatch.getState().addVisit,
    endLeg: useMatch.getState().endLeg,
  }
  beforeEach(() => {
    // Reset to default match state
    useMatch.getState().importState({ roomId: '', players: [], currentPlayerIdx: 0, startingScore: 501, inProgress: false })
  })
  afterEach(() => {
    useMatch.getState().addVisit = originalStoreFuncs.addVisit
    useMatch.getState().endLeg = originalStoreFuncs.endLeg
    vi.resetAllMocks()
    cleanup()
  })

  test('uses provided matchActions.addVisit from quick buttons', async () => {
  let propCalled = false
  const mockAddVisit = vi.fn((s: number, d: number) => { propCalled = true })
  const matchActions = { addVisit: mockAddVisit as any, undoVisit: vi.fn(), nextPlayer: vi.fn(), endLeg: vi.fn(), endGame: vi.fn() }
  // Also spy on the store addVisit to ensure the prop is used instead
  useMatch.getState().addVisit = vi.fn() as any
    // Setup a minimal in-progress match so MatchControls renders
    useMatch.getState().newMatch(['Alice', 'Bob'], 501)
    render(<Scoreboard matchActions={matchActions} />)
    // Click a quick 180 button located in the Score Input card to avoid collisions
  const headings = await screen.findAllByText('Score Input')
  let card: Element | null = null
  for (const h of headings) {
    const c = h.closest('.card')
    if (c && (within(c as HTMLElement).queryByRole('button', { name: '180' }))) { card = c; break }
  }
  if (!card) throw new Error('Could not find Score Input card with quick 180 button')
  const btn = (await within(card as HTMLElement).findAllByRole('button', { name: '180' }))[0]
  // quick action should call the provided prop handler instead of the store
  fireEvent.click(btn)
  expect(mockAddVisit).toHaveBeenCalledWith(180, 3)
  expect(propCalled).toBeTruthy()
  expect(useMatch.getState().addVisit).not.toHaveBeenCalled()
  })

  test('finishing visit triggers endLeg via matchActions when remaining goes to zero', async () => {
  let propCalled2 = false
  const mockAddVisit2 = vi.fn((s:number,d:number) => { propCalled2 = true })
  const matchActions = { addVisit: mockAddVisit2 as any, undoVisit: vi.fn(), nextPlayer: vi.fn(), endLeg: vi.fn(), endGame: vi.fn() }
  // Spy on store functions so we can assert they were NOT called
  useMatch.getState().addVisit = vi.fn() as any
  useMatch.getState().endLeg = vi.fn() as any
  // We expect the matchActions prop handlers to be used instead
    // Import state with current player's leg at 41 remaining
    const now = Date.now()
    useMatch.getState().importState({
      roomId: '',
      players: [
        { id: '0', name: 'Alice', legsWon: 0, legs: [{ visits: [], totalScoreStart: 501, totalScoreRemaining: 41, dartsThrown: 0, finished: false, checkoutScore: null, startTime: now }] },
        { id: '1', name: 'Bob', legsWon: 0, legs: [] }
      ],
      currentPlayerIdx: 0,
      startingScore: 501,
      inProgress: true
    })
    render(<Scoreboard matchActions={matchActions} />)
    // Input 41 within the Score Input card and click Add Visit
    const headings2 = await screen.findAllByText('Score Input')
    let card2: Element | null = null
    for (const h of headings2) {
      const c = h.closest('.card')
      if (c && (within(c as HTMLElement).queryByRole('button', { name: 'Add Visit' }))) { card2 = c; break }
    }
    if (!card2) throw new Error('Could not find Score Input card with Add Visit button')
    const input = within(card2 as HTMLElement).getByPlaceholderText('Score') as HTMLInputElement
  fireEvent.change(input, { target: { value: '41' } })
  // Ensure the input was updated
  expect((input as HTMLInputElement).value).toBe('41')
    const addBtn = within(card2 as HTMLElement).getByRole('button', { name: 'Add Visit' })
  fireEvent.click(addBtn)
  // Assert that the provided matchActions.addVisit and endLeg are called for finishing visit
  // Assert that the provided matchActions.addVisit and endLeg are called for finishing visit
  expect(useMatch.getState().addVisit).not.toHaveBeenCalled()
  expect(propCalled2).toBeTruthy()
  expect(matchActions.addVisit).toHaveBeenCalledWith(41, 3)
  // We assert that the endLeg handler was invoked when the remaining became zero.
  expect(matchActions.endLeg).toHaveBeenCalledWith(41)
  })
})
