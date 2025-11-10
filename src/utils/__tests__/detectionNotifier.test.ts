import { describe, it, expect, vi } from 'vitest'
import { runDetectionAndNotify } from '../detectionNotifier'

describe('runDetectionAndNotify', () => {
  it('calls onAutoDart when detector returns a good detection', () => {
    const detector = {
      detect: (frame: any) => ({ tip: { x: 0, y: 0 }, confidence: 0.95 })
    }
    const onAutoDart = vi.fn()
    const H: any = [[1,0,0],[0,1,0],[0,0,1]]
    runDetectionAndNotify(detector, null, H, { w: 320, h: 240 }, onAutoDart)
  expect(onAutoDart).toHaveBeenCalled()
  })

  it('does not call onAutoDart for low confidence', () => {
    const detector = {
      detect: (frame: any) => ({ tip: { x: 0, y: 0 }, confidence: 0.2 })
    }
    const onAutoDart = vi.fn()
    const H: any = [[1,0,0],[0,1,0],[0,0,1]]
    runDetectionAndNotify(detector, null, H, { w: 320, h: 240 }, onAutoDart)
    expect(onAutoDart).not.toHaveBeenCalled()
  })
})
