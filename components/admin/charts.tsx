"use client";

/**
 * Dependency-free SVG charts for the admin. Theme: Race Room red (#E60012)
 * accent on a light surface. All charts are responsive (viewBox) and animate in.
 */

import { motion } from "framer-motion";

const RED = "#E60012";

// ── Sparkline ────────────────────────────────────────────────────────────────
// Tiny trend line for KPI cards.
export function Sparkline({
  data,
  className = "",
  stroke = RED,
}: {
  data: number[];
  className?: string;
  stroke?: string;
}) {
  const w = 100;
  const h = 32;
  if (!data.length) return <div className={className} style={{ height: h }} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = data.length > 1 ? w / (data.length - 1) : 0;
  const pts = data.map((v, i) => [i * step, h - ((v - min) / range) * (h - 4) - 2]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const id = `spark-${stroke.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} style={{ width: "100%", height: h }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {pts.length > 0 && (
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill={stroke} />
      )}
    </svg>
  );
}

// ── Area / trend chart ───────────────────────────────────────────────────────
export function AreaChart({
  data,
  height = 220,
  valueFormat = (v: number) => String(v),
}: {
  data: { label: string; value: number }[];
  height?: number;
  valueFormat?: (v: number) => string;
}) {
  const w = 720;
  const h = 240;
  const padL = 8;
  const padR = 8;
  const padT = 16;
  const padB = 26;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const max = Math.max(...data.map((d) => d.value), 1);
  const step = data.length > 1 ? innerW / (data.length - 1) : 0;
  const x = (i: number) => padL + i * step;
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const pts = data.map((d, i) => [x(i), y(d.value)] as const);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = pts.length ? `${line} L${x(data.length - 1)},${padT + innerH} L${padL},${padT + innerH} Z` : "";
  const gridVals = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={RED} stopOpacity="0.20" />
            <stop offset="100%" stopColor={RED} stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridVals.map((g) => (
          <line
            key={g}
            x1={padL}
            x2={w - padR}
            y1={padT + innerH - g * innerH}
            y2={padT + innerH - g * innerH}
            stroke="currentColor"
            className="text-slate-200"
            strokeWidth="1"
            strokeDasharray={g === 0 ? "0" : "3 4"}
          />
        ))}
        {area && <motion.path initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} d={area} fill="url(#area-fill)" />}
        {line && (
          <motion.path
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            d={line}
            fill="none"
            stroke={RED}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p[0]} cy={p[1]} r="8" fill="transparent">
              <title>{`${data[i].label}: ${valueFormat(data[i].value)}`}</title>
            </circle>
            {i === pts.length - 1 && <circle cx={p[0]} cy={p[1]} r="3.5" fill={RED} />}
          </g>
        ))}
      </svg>
      <div className="mt-1 flex justify-between px-1 text-[11px] text-slate-400">
        {data.map((d, i) => (
          <span key={i} className={data.length > 8 && i % 2 !== 0 ? "hidden sm:inline" : ""}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Horizontal bar chart ─────────────────────────────────────────────────────
export function BarChart({
  data,
  valueFormat = (v: number) => String(v),
}: {
  data: { label: string; value: number }[];
  valueFormat?: (v: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  if (!data.length) return <p className="text-sm text-slate-400">Sin datos</p>;
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-sm font-medium text-slate-700" title={d.label}>
            {d.label}
          </span>
          <div className="relative h-7 flex-1 overflow-hidden rounded-lg bg-slate-100">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(d.value / max) * 100}%` }}
              transition={{ duration: 0.6, delay: i * 0.05, ease: "easeOut" }}
              className="absolute inset-y-0 left-0 rounded-lg bg-gradient-to-r from-[#E60012] to-[#ff3b4a]"
            />
          </div>
          <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">
            {valueFormat(d.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Donut chart ──────────────────────────────────────────────────────────────
export function Donut({
  data,
  size = 160,
  centerLabel,
  centerValue,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = 54;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <svg viewBox="0 0 140 140" style={{ width: size, height: size }} className="shrink-0 -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="currentColor" className="text-slate-100" strokeWidth="16" />
        {data.map((d, i) => {
          const frac = d.value / total;
          const dash = frac * c;
          const seg = (
            <motion.circle
              key={d.label}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.08 }}
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </motion.circle>
          );
          offset += dash;
          return seg;
        })}
      </svg>
      <div className="grid w-full grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-1">
        {(centerValue !== undefined || centerLabel) && (
          <div className="col-span-2 mb-1 sm:hidden">
            <p className="text-2xl font-bold text-slate-900">{centerValue}</p>
            <p className="text-xs text-slate-400">{centerLabel}</p>
          </div>
        )}
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="text-slate-600">{d.label}</span>
            <span className="ml-auto font-semibold tabular-nums text-slate-900">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Hourly heatmap (vertical bars) ───────────────────────────────────────────
export function HourlyBars({ data }: { data: { hour: number; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="flex items-end gap-[3px] overflow-x-auto pb-1" style={{ height: 120 }}>
      {data.map((h) => {
        const frac = h.count / max;
        return (
          <div key={h.hour} className="flex min-w-[16px] flex-1 flex-col items-center justify-end gap-1" style={{ height: "100%" }}>
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(frac * 100, 3)}%` }}
              transition={{ duration: 0.5, delay: h.hour * 0.015 }}
              className="w-full rounded-t-md"
              style={{
                background: frac > 0 ? `linear-gradient(to top, #E60012, #ff5763)` : "#e2e8f0",
                opacity: frac > 0 ? 0.35 + frac * 0.65 : 1,
              }}
              title={`${h.hour}:00 — ${h.count} reservas`}
            />
            {h.hour % 3 === 0 && <span className="text-[10px] tabular-nums text-slate-400">{h.hour}</span>}
          </div>
        );
      })}
    </div>
  );
}
