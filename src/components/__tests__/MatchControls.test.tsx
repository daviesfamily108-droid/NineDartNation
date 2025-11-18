// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import MatchControls from '../MatchControls'

describe('MatchControls component', () => {
  test('calls onAddVisit, onUndo, onNextPlayer, onEndLeg, onEndGame as expected', async () => {
    const onAddVisit = vi.fn()
    const onUndo = vi.fn()
    const onNextPlayer = vi.fn()
    const onEndLeg = vi.fn()
    const onEndGame = vi.fn()

    render(
      <MatchControls
        inProgress={true}
        startingScore={501}
        onAddVisit={onAddVisit}
        onUndo={onUndo}
        onNextPlayer={onNextPlayer}
        onEndLeg={onEndLeg}
        onEndGame={onEndGame}
      />
    )

    // Enter score and add visit
    const input = screen.getByRole('spinbutton') as HTMLInputElement
    fireEvent.change(input, { target: { value: '60' } })
    const addButton = screen.getByText('Add Visit')
    fireEvent.click(addButton)
    expect(onAddVisit).toHaveBeenCalledWith(60, 3)
  // Quick button
  const quick = screen.getByText('180')
  fireEvent.click(quick)
  expect(onAddVisit).toHaveBeenCalledWith(180, 3)

    // Undo
  const undo = screen.getByTitle('Undo')
    fireEvent.click(undo)
    expect(onUndo).toHaveBeenCalled()

    // Next Player
    const next = screen.getByText('Next Player')
    fireEvent.click(next)
    expect(onNextPlayer).toHaveBeenCalled()

    // End Leg
    const endLeg = screen.getByText(/End Leg/) as HTMLButtonElement
    fireEvent.click(endLeg)
    expect(onEndLeg).toHaveBeenCalled()

    // End Game
    const endGame = screen.getByText('End Game')
    fireEvent.click(endGame)
    expect(onEndGame).toHaveBeenCalled()
  })
})
