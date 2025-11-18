// Small adapter helpers to convert generic MatchControls onAddVisit callbacks to the local handlers
export function makeOnlineAddVisitAdapter(submitVisitManual: (v: number) => void) {
  return (score: number, darts: number) => { submitVisitManual(score) }
}

export function makeOfflineAddVisitAdapter(commitManualVisitTotal: (v: number) => boolean) {
  return (score: number, darts: number) => { commitManualVisitTotal(score) }
}
