"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Car } from "lucide-react";

type Puesto = {
  id: string;
  name: string;
  price30: number;
  price60: number;
  price120: number;
};

type SlotItem = { startTime: string; available: boolean };

type DayAvailability = {
  slots: string[];
  puestos: { id: string; name: string; slots: SlotItem[] }[];
};

const DURATIONS = [30, 60, 120] as const;

function formatSlotTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ReservaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");

  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [date, setDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + (d.getHours() >= 20 ? 1 : 0));
    return d.toISOString().slice(0, 10);
  });
  const [dayData, setDayData] = useState<DayAvailability | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedPuestoId, setSelectedPuestoId] = useState<string | null>(null);
  const [selectedStartTime, setSelectedStartTime] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(60);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    errorParam === "payment_failed" ? "El pago no pudo completarse" : null
  );

  useEffect(() => {
    fetch("/api/puestos")
      .then((r) => r.json())
      .then(setPuestos)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!date) return;
    setLoadingSlots(true);
    setSelectedPuestoId(null);
    setSelectedStartTime(null);
    fetch(`/api/availability?date=${date}`)
      .then((r) => r.json())
      .then((data) => {
        setDayData({
          slots: data.slots ?? [],
          puestos: data.puestos ?? [],
        });
        if (data.error) setError(data.error);
        else setError(null);
      })
      .catch(() => {
        setDayData({ slots: [], puestos: [] });
        setError("Error al cargar horarios. Revisá que la base tenga Configuración y Puestos.");
      })
      .finally(() => setLoadingSlots(false));
  }, [date]);

  const selectedPuesto = puestos.find((p) => p.id === selectedPuestoId);
  const priceKey =
    duration === 30 ? "price30" : duration === 60 ? "price60" : "price120";
  const price = selectedPuesto ? (selectedPuesto[priceKey] ?? 0) : 0;
  const priceDisplay = (price / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });

  const getSlotAvailable = (puestoId: string, startTime: string) => {
    const p = dayData?.puestos.find((x) => x.id === puestoId);
    const slotTimeMs = new Date(startTime).getTime();
    const slot = p?.slots.find((s) => new Date(s.startTime).getTime() === slotTimeMs);
    return slot?.available ?? false;
  };

  async function handleCheckout() {
    if (!selectedPuestoId || !selectedStartTime) {
      setError("Selecciona un horario en la grilla");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          puestoId: selectedPuestoId,
          duration,
          startTime: selectedStartTime,
          customerEmail: email || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al crear reserva");
      // Use sandboxInitPoint only when NEXT_PUBLIC_MERCADOPAGO_SANDBOX=true is set.
      // With production credentials (APP_USR-) always use initPoint.
      const isSandbox = process.env.NEXT_PUBLIC_MERCADOPAGO_SANDBOX === "true";
      const initPoint = isSandbox
        ? (data.sandboxInitPoint ?? data.initPoint)
        : data.initPoint;
      if (initPoint) window.location.href = initPoint;
      else router.push(`/reserva/confirmacion?bookingId=${data.bookingId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al procesar");
    } finally {
      setLoading(false);
    }
  }

  const minDate = new Date().toISOString().slice(0, 10);

  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="container mx-auto px-4">
        <Link
          href="/"
          className="mb-6 inline-block text-sm text-slate-600 hover:text-slate-900"
        >
          ← Volver
        </Link>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-4xl"
        >
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Reservar sesión</CardTitle>
              <CardDescription>
                Elige fecha, horario en la grilla (verde = disponible) y duración
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="date">Fecha</Label>
                <Input
                  id="date"
                  type="date"
                  min={minDate}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Grilla del día (click en un slot verde)</Label>
                {loadingSlots ? (
                  <div className="flex h-48 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
                    Cargando...
                  </div>
                ) : dayData ? (
                  <>
                    {dayData.puestos.length === 0 && (
                      <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                        No hay simuladores activos o no está cargada la configuración. Entrá a Admin → Puestos y Configuración, y ejecutá <code className="rounded bg-amber-100 px-1">npm run db:push</code> y <code className="rounded bg-amber-100 px-1">npm run db:seed</code> si falta.
                      </p>
                    )}
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[400px] border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="p-2 text-left font-medium text-slate-600">
                            Hora
                          </th>
                          {dayData.puestos.map((p) => (
                            <th
                              key={p.id}
                              className="border-l border-slate-200 p-2 text-center font-medium text-slate-700"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                <motion.span
                                  animate={{ rotate: [0, 5, -5, 0] }}
                                  transition={{ repeat: Infinity, duration: 4, repeatDelay: 1 }}
                                >
                                  <Car className="h-4 w-4 text-slate-500" />
                                </motion.span>
                                {p.name}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dayData.slots.map((slotTime) => (
                          <tr
                            key={slotTime}
                            className="border-b border-slate-100"
                          >
                            <td className="whitespace-nowrap p-2 text-slate-600">
                              {formatSlotTime(slotTime)}
                            </td>
                            {dayData.puestos.map((p) => {
                              const available = getSlotAvailable(p.id, slotTime);
                              const isSelected =
                                selectedPuestoId === p.id &&
                                selectedStartTime === slotTime;
                              return (
                                <td
                                  key={p.id}
                                  className="border-l border-slate-100 p-1"
                                >
                                  <motion.button
                                    type="button"
                                    disabled={!available}
                                    onClick={() => {
                                      if (available) {
                                        setSelectedPuestoId(p.id);
                                        setSelectedStartTime(slotTime);
                                      }
                                    }}
                                    whileHover={available ? { scale: 1.03 } : {}}
                                    whileTap={available ? { scale: 0.97 } : {}}
                                    className={`h-9 w-full rounded-lg text-xs font-medium transition ${
                                      isSelected
                                        ? "bg-slate-900 text-white ring-2 ring-slate-900 ring-offset-1"
                                        : available
                                          ? "bg-green-100 text-green-800 hover:bg-green-200"
                                          : "cursor-not-allowed bg-slate-100 text-slate-400"
                                    }`}
                                  >
                                    {available ? "Libre" : "—"}
                                  </motion.button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    No hay datos para esta fecha.
                  </p>
                )}
                {selectedPuestoId && selectedStartTime && (
                  <p className="text-sm text-slate-600">
                    Seleccionado:{" "}
                    {dayData?.puestos.find((p) => p.id === selectedPuestoId)
                      ?.name}{" "}
                    a las {formatSlotTime(selectedStartTime)}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Duración (minutos)</Label>
                <div className="flex gap-2">
                  {DURATIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDuration(d)}
                      className={`flex-1 rounded-xl border py-3 text-sm font-medium transition ${
                        duration === d
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {d} min
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email (para recibir tu código)</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="rounded-xl bg-slate-100 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Total</span>
                  <span className="text-lg font-semibold">
                    {selectedPuestoId && selectedStartTime
                      ? priceDisplay
                      : "—"}
                  </span>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <Button
                className="w-full"
                size="lg"
                onClick={handleCheckout}
                disabled={
                  loading || !selectedPuestoId || !selectedStartTime
                }
              >
                {loading ? "Procesando..." : "Ir a pagar (MercadoPago)"}
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </main>
  );
}

export default function BookingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
        </div>
      }
    >
      <ReservaContent />
    </Suspense>
  );
}
