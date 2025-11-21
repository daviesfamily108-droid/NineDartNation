import React from 'react'
import { render, act, fireEvent } from '@testing-library/react'
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
// Replace zustand persistence behavior in tests to avoid storage side-effects
vi.doMock('zustand/middleware', async () => {
  const actual = await vi.importActual<any>('zustand/middleware')
  return {
    ...actual,
    // Make persist a no-op wrapper so stores don't try to access real storage
    persist: (config: any) => config,
    // Provide a simple storage object for createJSONStorage
    createJSONStorage: () => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} }),
  }
})

// We'll dynamically import zustand stores after stubbing localStorage
let useCalibration: any
let useUserSettings: any
// Note: We'll use real stores with persistence stubbed out above

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

describe('CameraView autoscore detection -> onAutoDart', () => {
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
        // Return a simple storage object for createJSONStorage to avoid module handling differences
        createJSONStorage: () => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} }),
      }
    })
    // Dynamically import stores now that localStorage is available
  const modUS = await import('../../store/userSettings')
  const modCal = await import('../../store/calibration')
  useUserSettings = modUS.useUserSettings
  useCalibration = modCal.useCalibration
  // Ensure user settings expect built-in autoscore
    useUserSettings.setState({ autoscoreProvider: 'built-in', preferredCameraLabel: '' } as any)
  // Provide a basic calibration homography and imageSize - map board origin to image center
  useCalibration.setState({ H: [1, 0, 160, 0, 1, 120, 0, 0, 1], imageSize: { w: 320, h: 240 } } as any)
  // sanity check our mocked store worked
  expect(useCalibration().H).toEqual([1, 0, 160, 0, 1, 120, 0, 0, 1])

  // Stub requestAnimationFrame to call immediately to drive the detection loop synchronously
  const rafSpy = vi.spyOn(globalThis as any, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => { cb(0); return 1 })
  const cafSpy = vi.spyOn(globalThis as any, 'cancelAnimationFrame').mockImplementation((_id: number) => {})
  restoreRAF = () => { rafSpy.mockRestore(); cafSpy.mockRestore() }

    // Provide a simple increasing performance.now so streaming warm-up passes quickly
    let perfCount = 0
    const originalNow = performance.now
    ;(global as any).performance = { now: () => (++perfCount) * 1000 }
    // restore in afterEach
    ;(global as any).__restorePerfNow = () => { (global as any).performance = { now: originalNow } }
  })

  afterEach(() => {
    if (restoreRAF) restoreRAF()
    try { if ((global as any).__restorePerfNow) (global as any).__restorePerfNow() } catch {}
    vi.resetAllMocks()
  })

  it('calls onAutoDart when detector finds a dart', async () => {
    const onAutoDart = vi.fn()

  // Render component (use immediateAutoCommit to trigger onAutoDart from canvas click handlers)
  const { container } = render(<CameraView onAutoDart={onAutoDart} immediateAutoCommit={true} />)

  // Provide a fake video element with non-zero dimensions
    const video = container.querySelector('video') as HTMLVideoElement
    if (!video) throw new Error('video element not found')
    // Set readable videoWidth/videoHeight
    Object.defineProperty(video, 'videoWidth', { value: 320, configurable: true })
    Object.defineProperty(video, 'videoHeight', { value: 240, configurable: true })

    // Stub canvases used by the component
    const procCanvas = container.querySelector('canvas[ref]') as HTMLCanvasElement
  const canvases = container.querySelectorAll('canvas')
  canvases.forEach((c: Element) => {
    const canvas = c as HTMLCanvasElement
    // Ensure width/height exist for getImageData in sobel
    canvas.width = 320
    canvas.height = 240
    stubCanvasContext(canvas)
  })

  // Click on the overlay canvas to simulate an image hit (immediateAutoCommit triggers onAutoDart)
  const canvasesArr = Array.from(container.querySelectorAll('canvas'))
  const overlayCanvas = canvasesArr.find(c => !c.classList.contains('hidden')) as HTMLCanvasElement
  if (!overlayCanvas) throw new Error('overlay canvas not found')
  // Provide sensible bounding rect and sizes for overlay
  overlayCanvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 240, bottom: 240, right: 320, x: 0, y: 0, toJSON() { return null } }) as DOMRect
  overlayCanvas.width = 320
  overlayCanvas.height = 240
    // Trigger a microtask to allow effects to run
    await act(async () => {
      // Wait a tick
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    // Simulate a click at image center (maps to inner bull) and verify callback
    await act(async () => {
      fireEvent.click(overlayCanvas, { clientX: 160, clientY: 120 })
    })
    expect(onAutoDart).toHaveBeenCalled()
    const call = onAutoDart.mock.calls[0]
    expect(call[0]).toBe(50)
    expect(call[1]).toBe('INNER_BULL')
  })
})
