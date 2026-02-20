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
