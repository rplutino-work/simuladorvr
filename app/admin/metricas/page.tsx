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
  revenueToday: number;
  revenueMonth: number;
  usagePerPuesto: { name: string; count: number }[];
  bookingsByDuration: { duration: number; count: number }[];
  hourlyHeatmap: { hour: number; count: number }[];
};

export default function MetricasPage() {
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
        <h1 className="text-2xl font-semibold text-slate-900">Métricas</h1>
        <p className="mt-1 text-slate-600">
          Análisis de negocio e ingresos
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardHeader>
              <CardTitle>Ingresos hoy</CardTitle>
              <CardDescription>Total cobrado hoy</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                ${(metrics?.revenueToday ?? 0).toLocaleString("es-AR")}
              </p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Ingresos últimos 30 días</CardTitle>
              <CardDescription>Total del mes</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                ${(metrics?.revenueMonth ?? 0).toLocaleString("es-AR")}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Mapa de calor horario</CardTitle>
            <CardDescription>
              Distribución de reservas por hora (últimos 30 días)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-1 overflow-x-auto pb-2">
              {(metrics?.hourlyHeatmap ?? []).map((h) => {
                const max = Math.max(
                  ...(metrics?.hourlyHeatmap?.map((x) => x.count) ?? [1]),
                  1
                );
                const opacity = h.count / max;
                return (
                  <div
                    key={h.hour}
                    className="flex min-w-[24px] flex-1 flex-col items-center gap-1"
                    title={`${h.hour}:00 - ${h.count} reservas`}
                  >
                    <div
                      className="w-full rounded-t bg-slate-900 transition"
                      style={{
                        height: `${Math.max(opacity * 120, 4)}px`,
                        opacity: 0.3 + opacity * 0.7,
                      }}
                    />
                    <span className="text-[10px] text-slate-500">
                      {h.hour}h
                    </span>
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
