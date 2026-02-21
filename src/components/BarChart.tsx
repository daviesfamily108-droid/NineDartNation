import React from "react";

type Datum = { label: string | number; value: number };

export default function BarChart({
  data,
  height = 220,
  barWidth = 28,
  gap = 6,
  showValues = false,
}: {
  data: Datum[];
  height?: number;
  barWidth?: number;
  gap?: number;
  showValues?: boolean;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const minBarSlot = barWidth + gap + 8;
  const minChartWidth = data.length * minBarSlot;
  return (
    <div
      className="w-full overflow-x-auto"
      style={{ height: height + 20, WebkitOverflowScrolling: "touch" }}
    >
      <div
        className="h-full flex items-end justify-evenly"
        style={{ minWidth: minChartWidth }}
      >
        {data.map((d, i) => {
          const h = Math.round((d.value / max) * (height - 54));
          return (
            <div
              key={i}
              className="flex flex-col items-center justify-end"
              style={{ flex: "1 1 0%", minWidth: 0 }}
            >
              {showValues && d.value > 0 && (
                <div className="text-[9px] sm:text-xs mb-0.5 text-indigo-200 font-semibold">
                  {d.value}
                </div>
              )}
              <div
                className="rounded-t-md bg-gradient-to-b from-indigo-400 to-fuchsia-500 shadow-sm w-full max-w-[28px] sm:max-w-[32px]"
                style={{ height: h, minWidth: 8 }}
                title={`${d.label}: ${d.value}`}
              />
              <div
                className="text-[7px] sm:text-[10px] leading-tight mt-1 text-slate-200 font-medium select-none text-center"
                style={{
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {d.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
