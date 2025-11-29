import { scoreAtBoardPoint, BoardRadii } from '../vision'
import { describe, test, expect } from 'vitest'

describe('scoreAtBoardPoint', () => {
  test('inner bull mapped correctly', () => {
    const p = { x: 0, y: 0 }
    const s = scoreAtBoardPoint(p)
    expect(s.base).toBe(50)
    expect(s.ring).toBe('INNER_BULL')
    expect(s.mult).toBe(2)
    expect(s.sector).toBe(25)
  })

  test('outer bull mapped correctly', () => {
    const p = { x: 10, y: 0 }
    const s = scoreAtBoardPoint(p)
    expect(s.base).toBe(25)
    expect(s.ring).toBe('BULL')
    expect(s.mult).toBe(1)
    expect(s.sector).toBe(25)
  })

  test('triple 20 region', () => {
    // Treble ring at top (sector 20), radius roughly between trebleInner and trebleOuter
    const r = (BoardRadii.trebleInner + BoardRadii.trebleOuter) / 2
    const p = { x: 0, y: -r }
    const s = scoreAtBoardPoint(p)
    expect(s.sector).toBe(20)
    expect(s.mult).toBe(3)
    expect(s.base).toBe(60)
    expect(s.ring).toBe('TRIPLE')
  })

  test('double ring miss', () => {
    const r = BoardRadii.doubleOuter + 1
    const p = { x: 0, y: -r }
    const s = scoreAtBoardPoint(p)
    expect(s.base).toBe(0)
    expect(s.mult).toBe(0)
    expect(s.ring).toBe('MISS')
  })
})
