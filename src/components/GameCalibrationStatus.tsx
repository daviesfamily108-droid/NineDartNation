import React from 'react'
import { AlertTriangle, CheckCircle, AlertCircle, Zap } from 'lucide-react'
import { useCalibration } from '../store/calibration'
import {
  getCalibrationConfidenceForGame,
  isCalibrationSuitableForGame,
  getCalibrationQualityText,
  getRecalibrationRecommendation,
  GAME_CALIBRATION_REQUIREMENTS
} from '../utils/gameCalibrationRequirements'

interface GameCalibrationStatusProps {
  gameMode: string
  compact?: boolean // Show minimal version
  onRecalibrate?: () => void // Optional callback for recalibrate button
}

export default function GameCalibrationStatus({
  gameMode,
  compact = false,
  onRecalibrate
}: GameCalibrationStatusProps) {
  const { H, errorPx } = useCalibration()

  const confidence = getCalibrationConfidenceForGame(gameMode, errorPx)
  const suitable = isCalibrationSuitableForGame(gameMode, errorPx)
  const { quality, text } = getCalibrationQualityText(gameMode, errorPx)
  const recommendation = getRecalibrationRecommendation(gameMode)
  const requirement = GAME_CALIBRATION_REQUIREMENTS[gameMode]

  // Not calibrated
  if (!H || !errorPx) {
    if (compact) {
      return (
        <div className="text-xs px-2 py-1 rounded bg-slate-600/40 text-slate-300 inline-flex items-center gap-1 border border-slate-500/30">
          <AlertTriangle className="w-3 h-3" />
          Not calibrated
        </div>
      )
    }

    return (
      <div className="px-3 py-2 rounded bg-red-500/20 border border-red-600/30 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
        <div className="flex-1">
          <div className="font-medium text-red-300">Calibration Required</div>
          <div className="text-xs opacity-80">Please calibrate before playing {gameMode}</div>
        </div>
        {onRecalibrate && (
          <button
            className="btn px-2 py-1 text-xs bg-red-600 hover:bg-red-700"
            onClick={onRecalibrate}
          >
            Calibrate
          </button>
        )}
      </div>
    )
  }

  // Determine colors based on suitability
  const bgColor = suitable
    ? 'bg-emerald-500/20 border-emerald-600/30'
    : 'bg-amber-500/20 border-amber-600/30'

  const textColor = suitable ? 'text-emerald-300' : 'text-amber-300'
  const icon = suitable ? CheckCircle : AlertTriangle

  if (compact) {
    return (
      <div className={`text-xs px-2 py-1 rounded inline-flex items-center gap-1 border ${bgColor} ${textColor}`}>
        {React.createElement(icon, { className: 'w-3 h-3' })}
        <span>{text}</span>
        {!suitable && recommendation && (
          <span className="w-3 h-3 cursor-help" title={recommendation}>
            <AlertCircle className="w-3 h-3 inline" />
          </span>
        )}
      </div>
    )
  }

  // Full version
  return (
    <div className={`px-3 py-2 rounded border ${bgColor} space-y-1`}>
      <div className="flex items-center gap-2">
        {React.createElement(icon, {
          className: `w-4 h-4 ${suitable ? 'text-emerald-400' : 'text-amber-400'} flex-shrink-0`
        })}
        <div className="flex-1">
          <div className={`font-medium ${suitable ? 'text-emerald-300' : 'text-amber-300'}`}>
            Calibration for {gameMode}
          </div>
          <div className="text-xs opacity-80">Error: {Math.round(errorPx)}px | {text}</div>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded bg-black/30 overflow-hidden">
          <div
            className={`h-full transition-all ${
              suitable ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
            style={{ width: `${Math.min(100, confidence)}%` }}
          />
        </div>
        <span className="text-xs font-mono">{Math.round(confidence)}%</span>
      </div>

      {/* Requirements */}
      {requirement && (
        <div className="text-xs opacity-75">
          <div>Tolerance: ±{requirement.tolerancePx}px | Min: {requirement.minConfidence}%</div>
        </div>
      )}

      {/* Warning and recommendation */}
      <div className="space-y-1">
        {!suitable && (
          <div className="text-xs px-2 py-1 rounded bg-amber-900/30 text-amber-200 border border-amber-600/20 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
            Calibration quality is below minimum for {gameMode}
          </div>
        )}

        {recommendation && (
          <div className="text-xs px-2 py-1 rounded bg-blue-900/30 text-blue-200 border border-blue-600/20 flex items-center gap-1">
            <Zap className="w-3 h-3 flex-shrink-0" />
            {recommendation}
          </div>
        )}
      </div>

      {!suitable && onRecalibrate && (
        <button
          className="w-full btn px-2 py-1 text-sm mt-2 bg-amber-600 hover:bg-amber-700"
          onClick={onRecalibrate}
        >
          Recalibrate for {gameMode}
        </button>
      )}
    </div>
  )
}
