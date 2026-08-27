"use client";

import { useEffect, useState } from "react";
import { DollarSign, TrendingUp, Clock, Ticket } from "lucide-react";
import { Panel, StatCard } from "@/components/admin/ui";
import { AreaChart, BarChart, Donut, HourlyBars } from "@/components/admin/charts";

type Metrics = {
  revenueToday: number;
  revenueMonth: number;
  totalBookings: number;
  usagePerPuesto: { name: string; count: number }[];
  bookingsByDuration: { duration: number; count: number }[];
  hourlyHeatmap: { hour: number; count: number }[];
  dailySeries: { date: string; revenue: number; count: number; trials: number }[];
  trialsToday: number;
  trialsMonth: number;
  trialsByType: { label: string; count: number }[];
};

function fmtMoney(n: number) {
  return `$${Math.round(n).toLocaleString("es-AR")}`;
}
const ES_DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
function dayLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${ES_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}`;
}
const DURATION_COLORS = ["#E60012", "#ff6b76", "#fca5a5", "#fecdd3"];

export default function MetricasPage() {
  const [m, setM] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/metrics")
      .then((r) => r.json())
      .then(setM)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !m) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-[#E60012]" />
      </div>
    );
  }

  const series = m.dailySeries ?? [];
  const rev14 = series.reduce((s, d) => s + d.revenue, 0);
  const book14 = series.reduce((s, d) => s + d.count, 0);
  const avgTicket = book14 ? rev14 / book14 : 0;
  const avgPerDay = series.length ? rev14 / series.length : 0;
  const busiest = [...(m.hourlyHeatmap ?? [])].sort((a, b) => b.count - a.count)[0];

  const usage = [...(m.usagePerPuesto ?? [])].sort((a, b) => b.count - a.count).map((p) => ({ label: p.name, value: p.count }));
  const durations = (m.bookingsByDuration ?? [])
    .sort((a, b) => a.duration - b.duration)
    .map((d, i) => ({ label: `${d.duration} min`, value: d.count, color: DURATION_COLORS[i % DURATION_COLORS.length] }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Ingresos del mes" value={fmtMoney(m.revenueMonth)} sub="acumulado" accent delay={0} />
        <StatCard label="Ticket promedio" value={fmtMoney(avgTicket)} sub="por reserva (14d)" icon={Ticket} delay={0.05} />
        <StatCard label="Promedio diario" value={fmtMoney(avgPerDay)} sub="últimos 14 días" icon={TrendingUp} delay={0.1} />
        <StatCard label="Hora pico" value={busiest ? `${busiest.hour}:00` : "—"} sub={busiest ? `${busiest.count} reservas` : "sin datos"} icon={Clock} delay={0.15} />
      </div>

      <Panel
        title="Ingresos — últimos 14 días"
        description="Pagos aprobados por día (ARS)"
        action={
          <div className="text-right">
            <p className="text-2xl font-bold tracking-tight text-slate-900">{fmtMoney(rev14)}</p>
            <p className="text-xs text-slate-400">total período</p>
          </div>
        }
      >
        {series.length ? (
          <AreaChart data={series.map((d) => ({ label: dayLabel(d.date), value: d.revenue }))} height={260} valueFormat={fmtMoney} />
        ) : (
          <p className="py-8 text-center text-sm text-slate-400">Sin datos todavía</p>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Reservas por día" description="Cantidad de turnos (14 días)">
          {series.length ? (
            <AreaChart data={series.map((d) => ({ label: dayLabel(d.date), value: d.count }))} height={200} />
          ) : (
            <p className="text-sm text-slate-400">Sin datos</p>
          )}
        </Panel>
        <Panel title="Uso por simulador" description="Reservas totales">
          <BarChart data={usage} />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Pruebas gratis — últimos 14 días"
          description={`${m.trialsMonth ?? 0} en el mes · ${m.trialsToday ?? 0} hoy (códigos 8888 / RRRR / 9999)`}
        >
          {series.length ? (
            <AreaChart data={series.map((d) => ({ label: dayLabel(d.date), value: d.trials ?? 0 }))} height={200} />
          ) : (
            <p className="text-sm text-slate-400">Sin datos</p>
          )}
        </Panel>
        <Panel title="Pruebas por tipo de código" description="Últimos 14 días">
          {(m.trialsByType ?? []).length ? (
            <BarChart data={(m.trialsByType ?? []).map((t) => ({ label: t.label, value: t.count }))} />
          ) : (
            <p className="py-8 text-center text-sm text-slate-400">Sin pruebas en el período</p>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Duración elegida" description="Distribución de turnos">
          {durations.length ? (
            <Donut data={durations} centerLabel="turnos" centerValue={durations.reduce((s, d) => s + d.value, 0)} />
          ) : (
            <p className="text-sm text-slate-400">Sin datos</p>
          )}
        </Panel>
        <div className="lg:col-span-2">
          <Panel title="Actividad por hora" description="Reservas por hora del día — últimos 30 días">
            <HourlyBars data={m.hourlyHeatmap ?? []} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
