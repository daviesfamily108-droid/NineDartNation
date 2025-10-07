import React from 'react'
import { Lock } from 'lucide-react'

export type StatItem = {
  key: string
  label: string
  value: string
  locked?: boolean
}

export default function StatPills({ items, onUnlock }: { items: StatItem[]; onUnlock?: () => void }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((it) => (
        <div key={it.key} className={`relative p-3 rounded-xl border ${it.locked ? 'border-white/10 bg-white/5' : 'border-indigo-500/40 bg-indigo-500/10'}`}>
          <div className={`text-[12px] mb-1 ${it.locked ? 'opacity-50' : 'opacity-80'}`}>{it.label}</div>
          <div className={`text-lg font-semibold ${it.locked ? 'opacity-50 blur-[1px]' : ''}`}>{it.value}</div>
          {it.locked && (
            <button
              className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-900/40 backdrop-blur-[1.5px] hover:bg-slate-900/50 transition"
              onClick={(e)=>{ e.stopPropagation(); onUnlock?.() }}
              title="Unlock with PREMIUM"
            >
              <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-100">
                <Lock className="w-4 h-4" /> PREMIUM
              </div>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
