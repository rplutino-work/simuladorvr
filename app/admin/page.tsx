"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Metrics = {
  activeBookingsCount: number;
  revenueToday: number;
  revenueMonth: number;
  mostUsedPuesto: { name: string; count: number } | null;
  usagePerPuesto: { name: string; count: number }[];
  bookingsByDuration: { duration: number; count: number }[];
  hourlyHeatmap: { hour: number; count: number }[];
};

type DeviceRow = {
  puestoId: string;
  puestoName: string;
  hasActiveSession: boolean;
  sessionEndTime: string | null;
  tabletLastSeen: string | null;
  tvLastSeen: string | null;
};

// A device is considered online if it pinged within this window. Devices ping
// every 15s, so this tolerates ~2 missed beats before flipping to offline.
const DEVICE_OFFLINE_MS = 45 * 1000;

type DeviceState = "online" | "offline" | "never" | "session";

function deviceState(
  lastSeen: string | null,
  nowMs: number,
  inSession: boolean,
  isTv: boolean
): DeviceState {
  // On the TV, an active session means it's on the PlayStation HDMI input and
  // the WebView is frozen — silence is expected, so report "session" not offline.
  if (isTv && inSession) return "session";
  if (!lastSeen) return "never";
  const age = nowMs - new Date(lastSeen).getTime();
  return age <= DEVICE_OFFLINE_MS ? "online" : "offline";
}

const DEVICE_LABELS: Record<DeviceState, string> = {
  online: "Online",
  offline: "Offline",
  never: "Sin señal",
  session: "En sesión (HDMI)",
};

const DEVICE_DOT: Record<DeviceState, string> = {
  online: "bg-green-500",
  offline: "bg-red-500",
  never: "bg-slate-300",
  session: "bg-amber-500",
};

function DeviceBadge({ state }: { state: DeviceState }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        className={`h-2.5 w-2.5 rounded-full ${DEVICE_DOT[state]} ${
          state === "online" || state === "session" ? "animate-pulse" : ""
        }`}
      />
      <span className={state === "offline" ? "font-medium text-red-600" : "text-slate-600"}>
        {DEVICE_LABELS[state]}
      </span>
    </span>
  );
}

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
    const poll = setInterval(load, 5000);
    // Local clock ticks every second so badges expire to offline live between fetches.
    setNowMs(Date.now());
    const clock = setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estado de dispositivos</CardTitle>
        <CardDescription>Tablets y TVs por puesto (en vivo)</CardDescription>
      </CardHeader>
      <CardContent>
        {!loaded ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">Sin puestos activos</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div
                key={row.puestoId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">{row.puestoName}</span>
                  {row.hasActiveSession && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      En sesión
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wide text-slate-400">Tablet</span>
                    <DeviceBadge
                      state={deviceState(row.tabletLastSeen, nowMs, row.hasActiveSession, false)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wide text-slate-400">TV</span>
                    <DeviceBadge
                      state={deviceState(row.tvLastSeen, nowMs, row.hasActiveSession, true)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-slate-600">
          Resumen del negocio en tiempo real
        </p>
      </div>

      <DeviceStatusSection />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: "Reservas activas",
            value: metrics?.activeBookingsCount ?? 0,
            desc: "En curso ahora",
          },
          {
            title: "Ingresos hoy",
            value: `$${(metrics?.revenueToday ?? 0).toLocaleString("es-AR")}`,
            desc: "ARS",
          },
          {
            title: "Ingresos este mes",
            value: `$${(metrics?.revenueMonth ?? 0).toLocaleString("es-AR")}`,
            desc: "Últimos 30 días",
          },
          {
            title: "Puesto más usado",
            value: metrics?.mostUsedPuesto?.name ?? "—",
            desc: metrics?.mostUsedPuesto
              ? `${metrics.mostUsedPuesto.count} reservas`
              : "Sin datos",
          },
        ].map((item, i) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{item.title}</CardDescription>
                <CardTitle className="text-2xl">{item.value}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-500">{item.desc}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Uso por puesto</CardTitle>
              <CardDescription>Reservas por simulador</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(metrics?.usagePerPuesto ?? []).map((p) => (
                  <div key={p.name} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{p.name}</span>
                    <span className="text-sm text-slate-600">{p.count}</span>
                  </div>
                ))}
                {(!metrics?.usagePerPuesto || metrics.usagePerPuesto.length === 0) && (
                  <p className="text-sm text-slate-500">Sin datos</p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Duración más elegida</CardTitle>
              <CardDescription>Reservas por duración</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(metrics?.bookingsByDuration ?? []).map((d) => (
                  <div key={d.duration} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{d.duration} min</span>
                    <span className="text-sm text-slate-600">{d.count}</span>
                  </div>
                ))}
                {(!metrics?.bookingsByDuration || metrics.bookingsByDuration.length === 0) && (
                  <p className="text-sm text-slate-500">Sin datos</p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Mapa de calor horario</CardTitle>
            <CardDescription>Reservas por hora del día (últimos 30 días)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-1 overflow-x-auto pb-2">
              {(metrics?.hourlyHeatmap ?? []).map((h) => {
                const max = Math.max(...(metrics?.hourlyHeatmap?.map((x) => x.count) ?? [1]), 1);
                const opacity = h.count / max;
                return (
                  <div
                    key={h.hour}
                    className="flex flex-1 min-w-[20px] flex-col items-center gap-1"
                    title={`${h.hour}:00 - ${h.count} reservas`}
                  >
                    <div
                      className="w-full rounded-t bg-slate-900 transition"
                      style={{ height: `${Math.max(opacity * 80, 4)}px`, opacity: 0.3 + opacity * 0.7 }}
                    />
                    <span className="text-[10px] text-slate-500">{h.hour}h</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
