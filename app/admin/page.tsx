"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Activity, DollarSign, CalendarClock, Trophy, Tablet, Tv, Gift } from "lucide-react";
import { hasVR } from "@/lib/puestos";
import { Panel } from "@/components/admin/ui";
import { StatCard } from "@/components/admin/ui";
import { AreaChart, BarChart, Donut, HourlyBars } from "@/components/admin/charts";

type Metrics = {
  activeBookingsCount: number;
  revenueToday: number;
  revenueMonth: number;
  totalBookings: number;
  mostUsedPuesto: { name: string; count: number } | null;
  usagePerPuesto: { name: string; count: number }[];
  bookingsByDuration: { duration: number; count: number }[];
  hourlyHeatmap: { hour: number; count: number }[];
  dailySeries: { date: string; revenue: number; count: number; trials: number }[];
  statusBreakdown: { status: string; count: number }[];
  trialsToday: number;
  trialsMonth: number;
  trialsByType: { label: string; count: number }[];
};

type DeviceRow = {
  puestoId: string;
  puestoName: string;
  hasActiveSession: boolean;
  sessionEndTime: string | null;
  tabletLastSeen: string | null;
  tvLastSeen: string | null;
};

const DEVICE_OFFLINE_MS = 45 * 1000;
type DeviceState = "online" | "offline" | "never" | "session";

function deviceState(lastSeen: string | null, nowMs: number, inSession: boolean, isTv: boolean): DeviceState {
  if (isTv && inSession) return "session";
  if (!lastSeen) return "never";
  return nowMs - new Date(lastSeen).getTime() <= DEVICE_OFFLINE_MS ? "online" : "offline";
}

const DEVICE_META: Record<DeviceState, { label: string; dot: string; text: string }> = {
  online: { label: "Online", dot: "bg-emerald-500", text: "text-emerald-600" },
  offline: { label: "Offline", dot: "bg-red-500", text: "text-red-600" },
  never: { label: "Sin señal", dot: "bg-slate-300", text: "text-slate-400" },
  session: { label: "En sesión", dot: "bg-amber-500", text: "text-amber-600" },
};

function fmtMoney(n: number) {
  return `$${Math.round(n).toLocaleString("es-AR")}`;
}

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return Math.round(((curr - prev) / prev) * 100);
}

const ES_DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
function dayLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${ES_DAYS[date.getUTCDay()]} ${d}`;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Pendiente", color: "#f59e0b" },
  PAID: { label: "Pagado", color: "#3b82f6" },
  ACTIVE: { label: "En curso", color: "#10b981" },
  FINISHED: { label: "Finalizado", color: "#94a3b8" },
  EXPIRED: { label: "Expirado", color: "#e11d48" },
  CANCELLED: { label: "Cancelado", color: "#64748b" },
};

const DURATION_COLORS = ["#E60012", "#ff6b76", "#fca5a5", "#fecdd3"];

function DeviceStatusSection() {
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/admin/devices")
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          setRows(data.devices ?? []);
          setLoaded(true);
        })
        .catch(() => {});
    };
    load();
    // Poll cada 30s y SOLO con la pestaña visible → no consume recursos cuando el
    // admin no lo está mirando. Al volver a la pestaña, refresca al instante.
    const poll = setInterval(() => { if (!document.hidden) load(); }, 30000);
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVisible);
    setNowMs(Date.now());
    // Reloj cada 10s (suficiente para el umbral online/offline de 45s) — menos
    // re-renders = sin el "parpadeo" que se notaba.
    const clock = setInterval(() => setNowMs(Date.now()), 10000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  function Dev({ state, label, icon: Icon }: { state: DeviceState; label: string; icon: React.ComponentType<{ className?: string }> }) {
    const m = DEVICE_META[state];
    return (
      <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-slate-100 bg-slate-50/70 px-2 py-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="text-[11px] font-medium text-slate-500">{label}</span>
        <span className="ml-auto flex items-center gap-1">
          <span className="relative flex h-2 w-2">
            {(state === "online" || state === "session") && (
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${m.dot} opacity-60`} />
            )}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${m.dot}`} />
          </span>
          <span className={`text-[11px] font-semibold ${m.text}`}>{m.label}</span>
        </span>
      </div>
    );
  }

  return (
    <Panel title="Estado de dispositivos" description="Tablets y TVs por puesto — en vivo">
      {!loaded ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400">Sin puestos activos</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((row, i) => (
            <motion.div
              key={row.puestoId}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="rounded-xl border border-slate-100 p-3"
            >
              <div className="mb-2.5 flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-slate-800">{row.puestoName}</span>
                {hasVR(row.puestoName) && (
                  <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700">VR</span>
                )}
                {row.hasActiveSession && (
                  <span className="ml-auto shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                    En sesión
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Dev label="Tablet" state={deviceState(row.tabletLastSeen, nowMs, row.hasActiveSession, false)} icon={Tablet} />
                <Dev label="TV" state={deviceState(row.tvLastSeen, nowMs, row.hasActiveSession, true)} icon={Tv} />
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/metrics")
      .then((r) => r.json())
      .then(setMetrics)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !metrics) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-[#E60012]" />
      </div>
    );
  }

  const series = metrics.dailySeries ?? [];
  const revSpark = series.map((d) => d.revenue);
  const bookSpark = series.map((d) => d.count);
  const todayRev = series[series.length - 1]?.revenue ?? metrics.revenueToday;
  const yestRev = series[series.length - 2]?.revenue ?? 0;
  const todayBook = series[series.length - 1]?.count ?? 0;
  const yestBook = series[series.length - 2]?.count ?? 0;

  const usage = [...(metrics.usagePerPuesto ?? [])].sort((a, b) => b.count - a.count).map((p) => ({ label: p.name, value: p.count }));
  const durations = (metrics.bookingsByDuration ?? [])
    .sort((a, b) => a.duration - b.duration)
    .map((d, i) => ({ label: `${d.duration} min`, value: d.count, color: DURATION_COLORS[i % DURATION_COLORS.length] }));
  const statuses = (metrics.statusBreakdown ?? [])
    .map((s) => ({ label: STATUS_META[s.status]?.label ?? s.status, value: s.count, color: STATUS_META[s.status]?.color ?? "#94a3b8" }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Reservas activas"
          value={metrics.activeBookingsCount}
          sub="en curso ahora"
          icon={Activity}
          delay={0}
        />
        <StatCard
          label="Ingresos hoy"
          value={fmtMoney(metrics.revenueToday)}
          trend={pctChange(todayRev, yestRev)}
          sub="vs ayer"
          spark={revSpark}
          accent
          delay={0.05}
        />
        <StatCard
          label="Ingresos del mes"
          value={fmtMoney(metrics.revenueMonth)}
          sub="acumulado"
          icon={DollarSign}
          delay={0.1}
        />
        <StatCard
          label="Reservas hoy"
          value={todayBook}
          trend={pctChange(todayBook, yestBook)}
          sub="vs ayer"
          spark={bookSpark}
          icon={CalendarClock}
          delay={0.15}
        />
        <StatCard
          label="Pruebas hoy"
          value={metrics.trialsToday ?? 0}
          sub={`${metrics.trialsMonth ?? 0} en el mes`}
          spark={(series ?? []).map((d) => d.trials ?? 0)}
          icon={Gift}
          delay={0.2}
        />
      </div>

      {/* Trend + device status */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel
            title="Ingresos — últimos 14 días"
            description="Pagos aprobados por día (ARS)"
            action={
              <div className="text-right">
                <p className="text-2xl font-bold tracking-tight text-slate-900">{fmtMoney(series.reduce((s, d) => s + d.revenue, 0))}</p>
                <p className="text-xs text-slate-400">total 14 días</p>
              </div>
            }
          >
            {series.length ? (
              <AreaChart data={series.map((d) => ({ label: dayLabel(d.date), value: d.revenue }))} valueFormat={fmtMoney} />
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">Sin datos todavía</p>
            )}
          </Panel>
        </div>
        <DeviceStatusSection />
      </div>

      {/* Usage + duration + status */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Uso por simulador" description="Reservas totales">
          <BarChart data={usage} />
        </Panel>
        <Panel title="Duración elegida" description="Distribución de turnos">
          {durations.length ? (
            <Donut data={durations} centerLabel="turnos" centerValue={durations.reduce((s, d) => s + d.value, 0)} />
          ) : (
            <p className="text-sm text-slate-400">Sin datos</p>
          )}
        </Panel>
        <Panel title="Estado de reservas" description={`${metrics.totalBookings} en total`}>
          {statuses.length ? <Donut data={statuses} centerLabel="reservas" centerValue={metrics.totalBookings} /> : <p className="text-sm text-slate-400">Sin datos</p>}
        </Panel>
      </div>

      {/* Hourly heatmap */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Panel title="Actividad por hora" description="Reservas por hora del día — últimos 30 días">
          <HourlyBars data={metrics.hourlyHeatmap ?? []} />
        </Panel>
      </motion.div>
    </div>
  );
}
