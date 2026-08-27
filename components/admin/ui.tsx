"use client";

import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Sparkline } from "./charts";

// ── Panel ────────────────────────────────────────────────────────────────────
// The admin's card surface: white, soft border + shadow, optional header.
export function Panel({
  title,
  description,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)] ${className}`}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            {title && <h3 className="font-semibold tracking-tight text-slate-900">{title}</h3>}
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={`p-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

// ── StatCard ─────────────────────────────────────────────────────────────────
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  spark,
  accent = false,
  delay = 0,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon?: React.ComponentType<{ className?: string }>;
  trend?: number | null;
  spark?: number[];
  accent?: boolean;
  delay?: number;
}) {
  const up = (trend ?? 0) >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className={`relative overflow-hidden rounded-2xl border p-4 shadow-[0_1px_3px_rgba(16,24,40,0.06)] sm:p-5 ${
        accent
          ? "border-[#E60012]/20 bg-gradient-to-br from-[#E60012] to-[#c00010] text-white"
          : "border-slate-200/80 bg-white"
      }`}
    >
      <div className="flex items-start justify-between">
        <p className={`text-xs font-medium uppercase tracking-wider ${accent ? "text-white/70" : "text-slate-400"}`}>
          {label}
        </p>
        {Icon && (
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              accent ? "bg-white/15 text-white" : "bg-[#E60012]/10 text-[#E60012]"
            }`}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className={`mt-2 text-2xl font-bold tracking-tight tabular-nums sm:mt-3 sm:text-3xl ${accent ? "text-white" : "text-slate-900"}`}>
        {value}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        {trend !== undefined && trend !== null && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
              accent
                ? "bg-white/15 text-white"
                : up
                ? "bg-emerald-50 text-emerald-600"
                : "bg-red-50 text-red-600"
            }`}
          >
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend)}%
          </span>
        )}
        {sub && <span className={`text-xs ${accent ? "text-white/70" : "text-slate-400"}`}>{sub}</span>}
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-3 -mb-1">
          <Sparkline data={spark} stroke={accent ? "#ffffff" : "#E60012"} />
        </div>
      )}
    </motion.div>
  );
}
