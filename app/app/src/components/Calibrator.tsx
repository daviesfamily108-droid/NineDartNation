// Pure re-export of the canonical Calibrator component
export { default } from '../../../../src/components/Calibrator'

// Intentionally a re-export to avoid duplicate implementations in nested app trees.
// Re-export canonical Calibrator to centralize implementation
export { default } from '../../../../src/components/Calibrator'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { useCalibration } from '../store/calibration'
import { BoardRadii, canonicalRimTargets, computeHomographyDLT, drawCross, drawPolyline, rmsError, sampleRing, refinePointsSobel, type Homography, type Point } from '../utils/vision'

type Phase = 'idle' | 'camera' | 'capture' | 'select' | 'computed'
type CamMode = 'local' | 'phone'

export default function Calibrator() {
	const videoRef = useRef<HTMLVideoElement>(null)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const overlayRef = useRef<HTMLCanvasElement>(null)
	// Replace with pure re-export to keep single implementation
	export { default } from '../../../../src/components/Calibrator'
