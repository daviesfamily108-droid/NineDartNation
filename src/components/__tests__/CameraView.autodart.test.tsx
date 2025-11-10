import React from 'react'
import { render, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// (not using jest-dom matchers here)

// Mock the DartDetector to produce one deterministic detection
vi.mock('../../utils/dartDetector', () => {
  return {
    DartDetector: class {
      setROI() {}
      detect() {
        return { tip: { x: 160, y: 120 }, confidence: 0.9, bbox: { x: 150, y: 110, w: 20, h: 20 } }
      }
      accept() {}
    }
  }
})

// We'll dynamically import zustand stores after stubbing localStorage
let useCalibration: any
let useUserSettings: any

import CameraView from '../CameraView'

// Helper to stub canvas getContext and video properties
function stubCanvasContext(canvas: HTMLCanvasElement) {
  ;(canvas as any).getContext = (type: string) => {
    if (type !== '2d') return null
    return {
      drawImage: () => {},
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      putImageData: () => {},
      beginPath: () => {},
      stroke: () => {},
      arc: () => {},
      moveTo: () => {},
      lineTo: () => {},
      strokeRect: () => {},
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      fillRect: () => {},
      fillStyle: '',
    }
  }
}

describe.skip('CameraView autoscore detection -> onAutoDart', () => {
  let restoreRAF: (() => void) | null = null

  beforeEach(async () => {
    // Provide a minimal localStorage implementation for zustand persistence middleware
    ;(global as any).localStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {}),
      removeItem: vi.fn(() => {}),
    }
    // Replace zustand persistence behavior in tests to avoid storage side-effects
    vi.doMock('zustand/middleware', async () => {
      const actual = await vi.importActual<any>('zustand/middleware')
      return {
        ...actual,
        // Make persist a no-op wrapper so stores don't try to access real storage
        persist: (config: any) => config,
        createJSONStorage: () => () => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} }),
      }
    })
    // Dynamically import stores now that localStorage is available
    const modUS = await import('../../store/userSettings')
    const modCal = await import('../../store/calibration')
    useUserSettings = modUS.useUserSettings
    useCalibration = modCal.useCalibration
    // Ensure user settings expect built-in autoscore
    useUserSettings.setState({ autoscoreProvider: 'built-in', preferredCameraLabel: '' } as any)
    // Provide a basic calibration homography and imageSize
    useCalibration.setState({ H: [[1,0,0],[0,1,0],[0,0,1]], imageSize: { w: 320, h: 240 } } as any)

    // Stub requestAnimationFrame to call immediately to drive the detection loop synchronously
    const originalRAF = (global as any).requestAnimationFrame
    (global as any).requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 1 }
    (global as any).cancelAnimationFrame = (_id: number) => {}
    restoreRAF = () => { (global as any).requestAnimationFrame = originalRAF }
  })

  afterEach(() => {
    if (restoreRAF) restoreRAF()
    vi.resetAllMocks()
  })

  it('calls onAutoDart when detector finds a dart', async () => {
    const onAutoDart = vi.fn()

    // Render component
    const { container } = render(<CameraView onAutoDart={onAutoDart} />)

    // Provide a fake video element with non-zero dimensions
    const video = container.querySelector('video') as HTMLVideoElement
    if (!video) throw new Error('video element not found')
    // Set readable videoWidth/videoHeight
    Object.defineProperty(video, 'videoWidth', { value: 320, configurable: true })
    Object.defineProperty(video, 'videoHeight', { value: 240, configurable: true })

    // Stub canvases used by the component
    const procCanvas = container.querySelector('canvas[ref]') as HTMLCanvasElement
  const canvases = container.querySelectorAll('canvas')
  canvases.forEach((c: Element) => stubCanvasContext(c as HTMLCanvasElement))

    // Trigger a microtask to allow effects to run
    await act(async () => {
      // Wait a tick
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    // The mocked DartDetector returns a detection with confidence 0.9, so onAutoDart should be called
    expect(onAutoDart).toHaveBeenCalled()
    const call = onAutoDart.mock.calls[0]
    // Should be called with (value: number, ring: string, info?) — basic shape check
    expect(call.length).toBeGreaterThanOrEqual(2)
    expect(typeof call[0]).toBe('number')
    expect(typeof call[1]).toBe('string')
  })
})
