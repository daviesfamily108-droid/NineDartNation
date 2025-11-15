import { create } from 'zustand'

type LastOffline = { mode: string; x01Start: number; firstTo: number; aiLevel: string }

type SettingsState = {
  favoriteDouble: string
  callerEnabled: boolean
  callerVoice: string // voice name
  callerVolume: number // 0..1
  speakCheckoutOnly: boolean
  avgMode: 'all-time' | '24h'
  autoStartOffline: boolean
  rememberLastOffline: boolean
  lastOffline: LastOffline
  reducedMotion: boolean
  compactHeader: boolean
  allowSpectate: boolean
  // UI tuning
  cameraScale: number // 0.5 .. 1.25
  cameraAspect?: 'wide' | 'square'
  cameraFitMode?: 'fit' | 'fill'
  // External autoscore provider
  autoscoreProvider?: 'built-in' | 'external-ws' | 'manual'
  autoscoreWsUrl?: string
  autoCommitMode?: 'wait-for-clear' | 'immediate'
  calibrationGuide: boolean
  // Devices & preferences
  preferredCameraId?: string
  preferredCameraLabel?: string
  preferredCameraLocked?: boolean
  // Camera control
  cameraEnabled: boolean
  hideCameraOverlay: boolean
  ignorePreferredCameraSync: boolean
  // UI variants
  offlineLayout?: 'classic' | 'modern'
  // Text size
  textSize: 'small' | 'medium' | 'large'
  // Box size
  boxSize: 'small' | 'medium' | 'large'
  // Match configuration
  matchType?: 'singles' | 'doubles'
  teamAName?: string
  teamBName?: string
  setFavoriteDouble: (d: string) => void
  setCallerEnabled: (v: boolean) => void
  setCallerVoice: (name: string) => void
  setAvgMode: (mode: 'all-time' | '24h') => void
  setCallerVolume: (v: number) => void
  setSpeakCheckoutOnly: (v: boolean) => void
  setAutoStartOffline: (v: boolean) => void
  setRememberLastOffline: (v: boolean) => void
  setLastOffline: (cfg: Partial<LastOffline>) => void
  setReducedMotion: (v: boolean) => void
  setCompactHeader: (v: boolean) => void
  setAllowSpectate: (v: boolean) => void
  setCameraScale: (n: number) => void
  setCameraAspect: (a: 'wide' | 'square') => void
  setCameraFitMode: (m: 'fit' | 'fill') => void
  setCalibrationGuide: (v: boolean) => void
  setPreferredCamera: (id: string|undefined, label?: string, force?: boolean) => void
  setPreferredCameraLocked: (v: boolean) => void
  setCameraEnabled: (v: boolean) => void
  setIgnorePreferredCameraSync: (v: boolean) => void
  setOfflineLayout: (mode: 'classic'|'modern') => void
  setAutoscoreProvider: (p: 'built-in' | 'external-ws' | 'manual') => void
  setAutoscoreWsUrl: (u: string) => void
  setAutoCommitMode: (mode: 'wait-for-clear' | 'immediate') => void
  setTextSize: (size: 'small' | 'medium' | 'large') => void
  setBoxSize: (size: 'small' | 'medium' | 'large') => void
  setMatchType: (t: 'singles' | 'doubles') => void
  setTeamAName: (name: string) => void
  setTeamBName: (name: string) => void
  // Throw timer per dart
  dartTimerEnabled?: boolean
  dartTimerSeconds?: number
  setDartTimerEnabled: (v: boolean) => void
  setDartTimerSeconds: (n: number) => void
  // X01 rules
  x01DoubleIn?: boolean
  setX01DoubleIn: (v: boolean) => void
}
const KEY = 'ndn_user_settings'

function load(): Pick<SettingsState, 'favoriteDouble' | 'callerEnabled' | 'callerVoice' | 'avgMode' | 'callerVolume' | 'speakCheckoutOnly' | 'autoStartOffline' | 'rememberLastOffline' | 'lastOffline' | 'reducedMotion' | 'compactHeader' | 'allowSpectate' | 'cameraScale' | 'cameraAspect' | 'cameraFitMode' | 'calibrationGuide' | 'preferredCameraId' | 'preferredCameraLabel' | 'preferredCameraLocked' | 'cameraEnabled' | 'hideCameraOverlay' | 'offlineLayout' | 'autoscoreProvider' | 'autoscoreWsUrl' | 'autoCommitMode' | 'textSize' | 'boxSize' | 'matchType' | 'teamAName' | 'teamBName' | 'dartTimerEnabled' | 'dartTimerSeconds' | 'x01DoubleIn'> {
  try {
    const raw = localStorage.getItem(KEY)
  if (!raw) return { favoriteDouble: 'D16', callerEnabled: true, callerVoice: '', callerVolume: 1, speakCheckoutOnly: false, avgMode: 'all-time', autoStartOffline: false, rememberLastOffline: true, lastOffline: { mode: 'X01', x01Start: 501, firstTo: 1, aiLevel: 'None' }, reducedMotion: false, compactHeader: false, allowSpectate: true, cameraScale: 1.0, cameraAspect: 'wide', cameraFitMode: 'fit', calibrationGuide: true, preferredCameraId: undefined, preferredCameraLabel: undefined, cameraEnabled: true, hideCameraOverlay: false, offlineLayout: 'modern', autoscoreProvider: 'built-in', autoscoreWsUrl: '', autoCommitMode: 'wait-for-clear', textSize: 'medium', boxSize: 'medium', matchType: 'singles', teamAName: 'Team A', teamBName: 'Team B', dartTimerEnabled: false, dartTimerSeconds: 10, x01DoubleIn: false }
    const j = JSON.parse(raw)
    return {
      favoriteDouble: j.favoriteDouble || 'D16',
      callerEnabled: typeof j.callerEnabled === 'boolean' ? j.callerEnabled : true,
      callerVoice: j.callerVoice || '',
      callerVolume: (typeof j.callerVolume === 'number') ? Math.max(0, Math.min(1, j.callerVolume)) : 1,
      speakCheckoutOnly: !!j.speakCheckoutOnly,
      avgMode: j.avgMode === '24h' ? '24h' : 'all-time',
      autoStartOffline: !!j.autoStartOffline,
      rememberLastOffline: (typeof j.rememberLastOffline === 'boolean') ? j.rememberLastOffline : true,
      lastOffline: j.lastOffline && typeof j.lastOffline === 'object' ? {
        mode: j.lastOffline.mode || 'X01',
        x01Start: Number(j.lastOffline.x01Start) || 501,
        firstTo: Number(j.lastOffline.firstTo) || 1,
        aiLevel: j.lastOffline.aiLevel || 'None'
      } : { mode: 'X01', x01Start: 501, firstTo: 1, aiLevel: 'None' },
      reducedMotion: !!j.reducedMotion,
      compactHeader: !!j.compactHeader,
      allowSpectate: (typeof j.allowSpectate === 'boolean') ? j.allowSpectate : true,
      cameraScale: (typeof j.cameraScale === 'number' && isFinite(j.cameraScale)) ? Math.max(0.5, Math.min(1.25, j.cameraScale)) : 1.0,
      cameraAspect: j.cameraAspect === 'square' ? 'square' : 'wide',
      cameraFitMode: (j.cameraFitMode === 'fit' || j.cameraFitMode === 'fill') ? j.cameraFitMode : 'fit',
      autoscoreProvider: (j.autoscoreProvider === 'external-ws') ? 'external-ws' : (j.autoscoreProvider === 'manual' ? 'manual' : 'built-in'),
      autoscoreWsUrl: typeof j.autoscoreWsUrl === 'string' ? j.autoscoreWsUrl : '',
      autoCommitMode: (j.autoCommitMode === 'immediate') ? 'immediate' : 'wait-for-clear',
      calibrationGuide: (typeof j.calibrationGuide === 'boolean') ? j.calibrationGuide : true,
      preferredCameraId: typeof j.preferredCameraId === 'string' ? j.preferredCameraId : undefined,
      preferredCameraLabel: typeof j.preferredCameraLabel === 'string' ? j.preferredCameraLabel : undefined,
      preferredCameraLocked: (typeof j.preferredCameraLocked === 'boolean') ? j.preferredCameraLocked : false,
      cameraEnabled: (typeof j.cameraEnabled === 'boolean') ? j.cameraEnabled : true,
      hideCameraOverlay: (typeof j.hideCameraOverlay === 'boolean') ? j.hideCameraOverlay : false,
      offlineLayout: j.offlineLayout === 'classic' ? 'classic' : 'modern',
      textSize: (j.textSize === 'small' || j.textSize === 'large') ? j.textSize : 'medium',
      boxSize: (j.boxSize === 'small' || j.boxSize === 'large') ? j.boxSize : 'medium',
      matchType: (j.matchType === 'doubles') ? 'doubles' : 'singles',
      teamAName: typeof j.teamAName === 'string' ? j.teamAName : 'Team A',
      teamBName: typeof j.teamBName === 'string' ? j.teamBName : 'Team B',
      dartTimerEnabled: (typeof j.dartTimerEnabled === 'boolean') ? j.dartTimerEnabled : false,
      dartTimerSeconds: (typeof j.dartTimerSeconds === 'number' && isFinite(j.dartTimerSeconds)) ? Math.max(3, Math.min(60, j.dartTimerSeconds)) : 10,
      x01DoubleIn: (typeof j.x01DoubleIn === 'boolean') ? j.x01DoubleIn : false,
    }
  } catch {
  return { favoriteDouble: 'D16', callerEnabled: true, callerVoice: '', callerVolume: 1, speakCheckoutOnly: false, avgMode: 'all-time', autoStartOffline: false, rememberLastOffline: true, lastOffline: { mode: 'X01', x01Start: 501, firstTo: 1, aiLevel: 'None' }, reducedMotion: false, compactHeader: false, allowSpectate: true, cameraScale: 1.0, cameraAspect: 'wide', cameraFitMode: 'fit', calibrationGuide: true, preferredCameraId: undefined, preferredCameraLabel: undefined, preferredCameraLocked: false, cameraEnabled: true, hideCameraOverlay: false, offlineLayout: 'modern', autoscoreProvider: 'built-in', autoscoreWsUrl: '', autoCommitMode: 'wait-for-clear', textSize: 'medium', boxSize: 'medium', matchType: 'singles', teamAName: 'Team A', teamBName: 'Team B', dartTimerEnabled: false, dartTimerSeconds: 10, x01DoubleIn: false }
  }
}

function save(partial: Partial<SettingsState>) {
  try {
    const prev = load()
    localStorage.setItem(KEY, JSON.stringify({ ...prev, ...partial }))
  } catch {}
}

export const useUserSettings = create<SettingsState>((set, get) => ({
  ...load(),
  setFavoriteDouble: (d) => { save({ favoriteDouble: d }); set({ favoriteDouble: d }) },
  setCallerEnabled: (v) => { save({ callerEnabled: v }); set({ callerEnabled: v }) },
  setCallerVoice: (name) => { save({ callerVoice: name }); set({ callerVoice: name }) },
  setAvgMode: (mode) => { save({ avgMode: mode }); set({ avgMode: mode }) },
  setCallerVolume: (v) => { const vol = Math.max(0, Math.min(1, v)); save({ callerVolume: vol }); set({ callerVolume: vol }) },
  setSpeakCheckoutOnly: (v) => { save({ speakCheckoutOnly: v }); set({ speakCheckoutOnly: v }) },
  setAutoStartOffline: (v) => { save({ autoStartOffline: v }); set({ autoStartOffline: v }) },
  setRememberLastOffline: (v) => { save({ rememberLastOffline: v }); set({ rememberLastOffline: v }) },
  setLastOffline: (cfg) => { const prev = load().lastOffline; const next = { ...prev, ...cfg }; save({ lastOffline: next }); set({ lastOffline: next }) },
  setReducedMotion: (v) => { save({ reducedMotion: v }); set({ reducedMotion: v }) },
  setCompactHeader: (v) => { save({ compactHeader: v }); set({ compactHeader: v }) },
  setAllowSpectate: (v) => { save({ allowSpectate: v }); set({ allowSpectate: v }) },
  // Temporarily suppress external camera-mode syncing (used while user is interacting with device picker)
  ignorePreferredCameraSync: false,
  setIgnorePreferredCameraSync: (v: boolean) => { save({} as any); set({ ignorePreferredCameraSync: v }) },
  setCameraScale: (n) => { const s = Math.max(0.5, Math.min(1.25, n)); save({ cameraScale: s }); set({ cameraScale: s }) },
  setCameraAspect: (a) => { const v = (a === 'square') ? 'square' : 'wide'; save({ cameraAspect: v }); set({ cameraAspect: v }) },
  setCameraFitMode: (m) => { const v = (m === 'fit') ? 'fit' : 'fill'; save({ cameraFitMode: v }); set({ cameraFitMode: v }) },
  setAutoscoreProvider: (p) => { save({ autoscoreProvider: p }); set({ autoscoreProvider: p }) },
  setAutoscoreWsUrl: (u) => { save({ autoscoreWsUrl: u }); set({ autoscoreWsUrl: u }) },
  setAutoCommitMode: (mode) => {
    const v = mode === 'immediate' ? 'immediate' : 'wait-for-clear'
    save({ autoCommitMode: v })
    set({ autoCommitMode: v })
  },
  setCalibrationGuide: (v) => { save({ calibrationGuide: v }); set({ calibrationGuide: v }) },
  setPreferredCamera: (id, label, force = false) => {
    try {
      const state = get()
      console.log('[USERSETTINGS] setPreferredCamera called:', { id, label, force, locked: state.preferredCameraLocked })
      if (state.preferredCameraLocked && !force) {
        // Locked: ignore programmatic updates unless explicitly forced by user action
        console.log('[USERSETTINGS] Camera selection locked and force=false, ignoring update')
        return
      }
    } catch {}
    console.log('[USERSETTINGS] Saving preferred camera:', { id, label })
    save({ preferredCameraId: id, preferredCameraLabel: label });
    set({ preferredCameraId: id, preferredCameraLabel: label })
  },
  setPreferredCameraLocked: (v) => { save({ preferredCameraLocked: v }); set({ preferredCameraLocked: v }) },
  setCameraEnabled: (v) => { save({ cameraEnabled: v }); set({ cameraEnabled: v }) },
  setHideCameraOverlay: (v) => { save({ hideCameraOverlay: v }); set({ hideCameraOverlay: v }) },
  setOfflineLayout: (mode) => { save({ offlineLayout: mode }); set({ offlineLayout: mode }) },
  setTextSize: (size) => { save({ textSize: size }); set({ textSize: size }) },
  setBoxSize: (size) => { save({ boxSize: size }); set({ boxSize: size }) },
  setMatchType: (t) => { const v = (t === 'doubles') ? 'doubles' : 'singles'; save({ matchType: v }); set({ matchType: v }) },
  setTeamAName: (name) => { const v = name?.trim() || 'Team A'; save({ teamAName: v }); set({ teamAName: v }) },
  setTeamBName: (name) => { const v = name?.trim() || 'Team B'; save({ teamBName: v }); set({ teamBName: v }) },
  setDartTimerEnabled: (v) => { save({ dartTimerEnabled: v }); set({ dartTimerEnabled: v }) },
  setDartTimerSeconds: (n) => { const s = Math.max(3, Math.min(60, Math.round(n))); save({ dartTimerSeconds: s }); set({ dartTimerSeconds: s }) },
  setX01DoubleIn: (v) => { save({ x01DoubleIn: v }); set({ x01DoubleIn: v }) },
}))
