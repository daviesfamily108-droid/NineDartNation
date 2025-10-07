import React from 'react'

type Datum = { label: string | number; value: number }

export default function BarChart({
  data,
  height = 220,
  barWidth = 28,
  gap = 6,
  showValues = false,
}: {
  data: Datum[]
  height?: number
  barWidth?: number
  gap?: number
  showValues?: boolean
}) {
  const max = Math.max(1, ...data.map(d => d.value))
  const totalWidth = data.length * (barWidth + gap)
  return (
    <div className="w-full overflow-x-auto">
      <div className="relative" style={{ height, width: Math.max(600, totalWidth) }}>
        <div className="absolute inset-0 flex items-end">
          {data.map((d, i) => {
            const h = Math.round((d.value / max) * (height - 40)) // leave room for labels
            return (
              <div key={i} className="flex flex-col items-center justify-end" style={{ width: barWidth, marginRight: gap }}>
                <div
                  className="w-full rounded-t-md bg-gradient-to-b from-indigo-400 to-fuchsia-500 shadow-sm"
                  style={{ height: h }}
                  title={`${d.label}: ${d.value}`}
                />
                {showValues && <div className="text-[10px] mt-1 opacity-80">{d.value}</div>}
                <div className="text-[10px] mt-1 opacity-70 select-none">{d.label}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
