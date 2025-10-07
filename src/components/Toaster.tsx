import { useToastStore } from '../store/toast'

export default function Toaster() {
  const toasts = useToastStore(s => s.toasts)
  const remove = useToastStore(s => s.remove)
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map(t => (
        <div key={t.id} className={`p-3 rounded-lg shadow-lg border text-sm ${
          t.type === 'error' ? 'bg-rose-700/80 border-rose-500/60 text-white' :
          t.type === 'success' ? 'bg-emerald-700/80 border-emerald-500/60 text-white' :
          'bg-black/70 border-slate-700 text-slate-100'
        }`}>
          <div className="flex items-center gap-2">
            <span className="flex-1">{t.message}</span>
            <button className="btn btn--ghost px-2 py-1 text-xs" onClick={()=>remove(t.id)}>Dismiss</button>
          </div>
        </div>
      ))}
    </div>
  )
}
