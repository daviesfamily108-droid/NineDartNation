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
  // External autoscore provider
  autoscoreProvider?: 'built-in' | 'external-ws'
  autoscoreWsUrl?: string
  calibrationGuide: boolean
  // Devices & preferences
  preferredCameraId?: string
  preferredCameraLabel?: string
  // UI variants
  offlineLayout?: 'classic' | 'modern'
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
  setCalibrationGuide: (v: boolean) => void
  setPreferredCamera: (id: string|undefined, label?: string) => void
  setOfflineLayout: (mode: 'classic'|'modern') => void
  setAutoscoreProvider: (p: 'built-in' | 'external-ws') => void
  setAutoscoreWsUrl: (u: string) => void
}
const KEY = 'ndn_user_settings'

function load(): Pick<SettingsState, 'favoriteDouble' | 'callerEnabled' | 'callerVoice' | 'avgMode' | 'callerVolume' | 'speakCheckoutOnly' | 'autoStartOffline' | 'rememberLastOffline' | 'lastOffline' | 'reducedMotion' | 'compactHeader' | 'allowSpectate' | 'cameraScale' | 'cameraAspect' | 'calibrationGuide' | 'preferredCameraId' | 'preferredCameraLabel' | 'offlineLayout' | 'autoscoreProvider' | 'autoscoreWsUrl'> {
  try {
    const raw = localStorage.getItem(KEY)
  if (!raw) return { favoriteDouble: 'D16', callerEnabled: true, callerVoice: '', callerVolume: 1, speakCheckoutOnly: false, avgMode: 'all-time', autoStartOffline: false, rememberLastOffline: true, lastOffline: { mode: 'X01', x01Start: 501, firstTo: 1, aiLevel: 'None' }, reducedMotion: false, compactHeader: false, allowSpectate: true, cameraScale: 1.0, cameraAspect: 'wide', calibrationGuide: true, preferredCameraId: undefined, preferredCameraLabel: undefined, offlineLayout: 'modern', autoscoreProvider: 'built-in', autoscoreWsUrl: '' }
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
  autoscoreProvider: (j.autoscoreProvider === 'external-ws') ? 'external-ws' : 'built-in',
  autoscoreWsUrl: typeof j.autoscoreWsUrl === 'string' ? j.autoscoreWsUrl : '',
      calibrationGuide: (typeof j.calibrationGuide === 'boolean') ? j.calibrationGuide : true,
      preferredCameraId: typeof j.preferredCameraId === 'string' ? j.preferredCameraId : undefined,
      preferredCameraLabel: typeof j.preferredCameraLabel === 'string' ? j.preferredCameraLabel : undefined,
      offlineLayout: j.offlineLayout === 'classic' ? 'classic' : 'modern',
    }
  } catch {
  return { favoriteDouble: 'D16', callerEnabled: true, callerVoice: '', callerVolume: 1, speakCheckoutOnly: false, avgMode: 'all-time', autoStartOffline: false, rememberLastOffline: true, lastOffline: { mode: 'X01', x01Start: 501, firstTo: 1, aiLevel: 'None' }, reducedMotion: false, compactHeader: false, allowSpectate: true, cameraScale: 1.0, cameraAspect: 'wide', calibrationGuide: true, preferredCameraId: undefined, preferredCameraLabel: undefined, offlineLayout: 'modern', autoscoreProvider: 'built-in', autoscoreWsUrl: '' }
  }
}

function save(partial: Partial<SettingsState>) {
  try {
    const prev = load()
    localStorage.setItem(KEY, JSON.stringify({ ...prev, ...partial }))
  } catch {}
}

export const useUserSettings = create<SettingsState>((set) => ({
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
  setCameraScale: (n) => { const s = Math.max(0.5, Math.min(1.25, n)); save({ cameraScale: s }); set({ cameraScale: s }) },
  setCameraAspect: (a) => { const v = (a === 'square') ? 'square' : 'wide'; save({ cameraAspect: v }); set({ cameraAspect: v }) },
  setAutoscoreProvider: (p) => { save({ autoscoreProvider: p }); set({ autoscoreProvider: p }) },
  setAutoscoreWsUrl: (u) => { save({ autoscoreWsUrl: u }); set({ autoscoreWsUrl: u }) },
  setCalibrationGuide: (v) => { save({ calibrationGuide: v }); set({ calibrationGuide: v }) },
  setPreferredCamera: (id, label) => { save({ preferredCameraId: id, preferredCameraLabel: label }); set({ preferredCameraId: id, preferredCameraLabel: label }) },
  setOfflineLayout: (mode) => { save({ offlineLayout: mode }); set({ offlineLayout: mode }) },
}))
