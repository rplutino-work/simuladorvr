"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Car, Calendar, Clock, ChevronLeft, AlertCircle, CheckCircle } from "lucide-react";

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

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

// ── Step indicator ─────────────────────────────────────────────────────────
function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
          done
            ? "bg-slate-900 text-white"
            : active
            ? "bg-slate-900 text-white ring-2 ring-slate-900 ring-offset-2"
            : "bg-slate-200 text-slate-500"
        }`}
      >
        {done ? <CheckCircle className="h-3.5 w-3.5" /> : n}
      </div>
    </div>
  );
}

// ── Main content ───────────────────────────────────────────────────────────
function ReservaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");

  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [date, setDate] = useState<string>(() => {
    const d = new Date();
    if (d.getHours() >= 20) d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [dayData, setDayData]     = useState<DayAvailability | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [selectedPuestoId, setSelectedPuestoId]   = useState<string | null>(null);
  const [selectedStartTime, setSelectedStartTime] = useState<string | null>(null);
  const [activeMobilePuestoId, setActiveMobilePuestoId] = useState<string | null>(null);

  const [duration, setDuration] = useState<number>(60);
  const [email, setEmail]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(
    errorParam === "payment_failed" ? "El pago no pudo completarse. Intentalo de nuevo." : null
  );

  // ── Fetch puestos (for pricing)
  useEffect(() => {
    fetch("/api/puestos").then((r) => r.json()).then(setPuestos).catch(() => {});
  }, []);

  // ── Fetch availability (re-runs when date OR duration changes)
  useEffect(() => {
    if (!date) return;
    setLoadingSlots(true);
    setSelectedPuestoId(null);
    setSelectedStartTime(null);
    setActiveMobilePuestoId(null);
    fetch(`/api/availability?date=${date}&duration=${duration}`)
      .then((r) => r.json())
      .then((data) => {
        setDayData({ slots: data.slots ?? [], puestos: data.puestos ?? [] });
        if (data.error) setError(data.error);
        else setError(null);
        if ((data.puestos ?? []).length > 0) {
          setActiveMobilePuestoId(data.puestos[0].id);
        }
      })
      .catch(() => {
        setDayData({ slots: [], puestos: [] });
        setError("Error al cargar horarios.");
      })
      .finally(() => setLoadingSlots(false));
  }, [date, duration]);

  const selectedPuesto = puestos.find((p) => p.id === selectedPuestoId);
  const priceKey = duration === 30 ? "price30" : duration === 60 ? "price60" : "price120";
  const price    = selectedPuesto ? (selectedPuesto[priceKey] ?? 0) : 0;
  const priceStr = price > 0
    ? (price / 100).toLocaleString("es-AR", { style: "currency", currency: "ARS" })
    : null;

  function isAvailable(puestoId: string, startTime: string) {
    const p = dayData?.puestos.find((x) => x.id === puestoId);
    if (!p) return false;
    const ms = new Date(startTime).getTime();
    return p.slots.find((s) => new Date(s.startTime).getTime() === ms)?.available ?? false;
  }

  async function handleCheckout() {
    if (!selectedPuestoId || !selectedStartTime) {
      setError("Seleccioná un horario primero");
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
      const isSandbox = process.env.NEXT_PUBLIC_MERCADOPAGO_SANDBOX === "true";
      const initPoint = isSandbox ? (data.sandboxInitPoint ?? data.initPoint) : data.initPoint;
      if (initPoint) window.location.href = initPoint;
      else router.push(`/reserva/confirmacion?bookingId=${data.bookingId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al procesar");
    } finally {
      setLoading(false);
    }
  }

  const minDate = new Date().toISOString().slice(0, 10);
  const step: 1 | 2 | 3 = !selectedPuestoId || !selectedStartTime ? 2 : 3;

  // ── Slots for active mobile puesto tab
  const mobilePuestoData = dayData?.puestos.find((p) => p.id === activeMobilePuestoId);
  const mobilePuesto     = puestos.find((p) => p.id === activeMobilePuestoId);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Sticky header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#080C2E] shadow-lg">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition font-condensed tracking-wide">
            <ChevronLeft className="h-4 w-4" />
            INICIO
          </Link>
          <span className="flex items-center gap-2 font-racing tracking-widest text-white text-sm">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-[#E50014] text-white font-racing text-xs leading-none">V</span>
            RESERVAR SESIÓN
          </span>
          <div className="w-16" />
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-3xl">

        {/* ── Steps indicator ──────────────────────────────────────────── */}
        <div className="mb-6 flex items-center gap-2">
          <StepDot n={1} active={false} done={true} />
          <div className="h-px flex-1 bg-slate-200" />
          <StepDot n={2} active={step === 2} done={step > 2} />
          <div className="h-px flex-1 bg-slate-200" />
          <StepDot n={3} active={step === 3} done={false} />
          <span className="ml-2 text-xs font-condensed tracking-widest uppercase text-slate-500">
            {step === 2 ? "Elegí horario" : step === 3 ? "Confirmá" : ""}
          </span>
        </div>

        {/* ── Date + Duration row ─────────────────────────────────────── */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="date" className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide">
              <Calendar className="h-3.5 w-3.5" /> Fecha
            </Label>
            <Input
              id="date"
              type="date"
              min={minDate}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-1.5 col-span-2 sm:col-span-1">
            <Label className="flex items-center gap-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide">
              <Clock className="h-3.5 w-3.5" /> Duración
            </Label>
            <div className="flex gap-2 h-11">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`flex-1 rounded-xl border text-sm font-condensed font-bold tracking-widest uppercase transition ${
                    duration === d
                      ? "border-[#E50014] bg-[#E50014] text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:border-[#E50014] hover:text-[#E50014]"
                  }`}
                >
                  {d}m
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Slot grid ──────────────────────────────────────────────── */}
        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Horarios disponibles
            </p>
            <span className="flex gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-green-200" /> Libre
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-slate-900" /> Seleccionado
              </span>
            </span>
          </div>

          {loadingSlots ? (
            <div className="flex h-40 items-center justify-center rounded-2xl border border-slate-200 bg-white">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800" />
            </div>
          ) : !dayData || dayData.puestos.length === 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-medium">No hay simuladores configurados</p>
              <p className="mt-1 text-amber-700 text-xs">
                Configurá los puestos y horarios desde el panel de administración.
              </p>
            </div>
          ) : (
            <>
              {/* ── Mobile / Tablet: tabs per puesto ─────────────────── */}
              <div className="lg:hidden">
                {/* Puesto tabs */}
                <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {dayData.puestos.map((p) => {
                    const pricingPuesto = puestos.find((x) => x.id === p.id);
                    const tabPrice = pricingPuesto ? pricingPuesto[priceKey] : 0;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setActiveMobilePuestoId(p.id);
                          setSelectedPuestoId(null);
                          setSelectedStartTime(null);
                        }}
                        className={`flex-shrink-0 rounded-xl border px-3 py-2 text-left transition ${
                          activeMobilePuestoId === p.id
                            ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Car className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="text-sm font-medium whitespace-nowrap">{p.name}</span>
                        </div>
                        {tabPrice > 0 && (
                          <p className={`mt-0.5 text-xs ${activeMobilePuestoId === p.id ? "text-slate-300" : "text-slate-500"}`}>
                            ${(tabPrice / 100).toLocaleString("es-AR")}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Time slots grid for active puesto */}
                <AnimatePresence mode="wait">
                  {mobilePuestoData && (
                    <motion.div
                      key={activeMobilePuestoId}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15 }}
                    >
                      {mobilePuestoData.slots.length === 0 ? (
                        <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-400">
                          No hay horarios disponibles para este simulador hoy
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
                          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                            {mobilePuestoData.slots.map((slot) => {
                              const available = slot.available;
                              const isSelected =
                                selectedPuestoId === activeMobilePuestoId &&
                                selectedStartTime === slot.startTime;
                              return (
                                <motion.button
                                  key={slot.startTime}
                                  type="button"
                                  disabled={!available}
                                  onClick={() => {
                                    if (available && activeMobilePuestoId) {
                                      setSelectedPuestoId(activeMobilePuestoId);
                                      setSelectedStartTime(slot.startTime);
                                    }
                                  }}
                                  whileTap={available ? { scale: 0.94 } : {}}
                                  className={`rounded-xl py-2.5 text-sm font-semibold transition ${
                                    isSelected
                                      ? "bg-slate-900 text-white shadow-sm ring-2 ring-slate-900 ring-offset-1"
                                      : available
                                      ? "bg-green-50 text-green-800 hover:bg-green-100 active:bg-green-200"
                                      : "cursor-not-allowed bg-slate-50 text-slate-300"
                                  }`}
                                >
                                  {fmt(slot.startTime)}
                                </motion.button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Desktop: full table grid ──────────────────────────── */}
              <div className="hidden lg:block overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="w-20 p-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Hora
                      </th>
                      {dayData.puestos.map((p) => (
                        <th key={p.id} className="border-l border-slate-100 p-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600">
                          <span className="inline-flex items-center gap-1.5">
                            <motion.span
                              animate={{ rotate: [0, 6, -6, 0] }}
                              transition={{ repeat: Infinity, duration: 4, repeatDelay: 2 }}
                            >
                              <Car className="h-3.5 w-3.5 text-slate-400" />
                            </motion.span>
                            {p.name}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dayData.slots.map((slotTime) => (
                      <tr key={slotTime} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                        <td className="whitespace-nowrap p-3 text-xs font-medium text-slate-500">
                          {fmt(slotTime)}
                        </td>
                        {dayData.puestos.map((p) => {
                          const available  = isAvailable(p.id, slotTime);
                          const isSelected = selectedPuestoId === p.id && selectedStartTime === slotTime;
                          return (
                            <td key={p.id} className="border-l border-slate-50 p-1.5">
                              <motion.button
                                type="button"
                                disabled={!available}
                                onClick={() => {
                                  if (available) {
                                    setSelectedPuestoId(p.id);
                                    setSelectedStartTime(slotTime);
                                  }
                                }}
                                whileHover={available ? { scale: 1.04 } : {}}
                                whileTap={available ? { scale: 0.96 } : {}}
                                className={`h-9 w-full rounded-lg text-xs font-semibold transition ${
                                  isSelected
                                    ? "bg-slate-900 text-white ring-2 ring-slate-900 ring-offset-1 shadow-sm"
                                    : available
                                    ? "bg-green-50 text-green-700 hover:bg-green-100"
                                    : "cursor-not-allowed bg-slate-50 text-slate-300"
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
          )}
        </div>

        {/* ── Selection summary ────────────────────────────────────────── */}
        <AnimatePresence>
          {selectedPuestoId && selectedStartTime && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-5"
            >
              <div className="flex items-center gap-3 rounded-2xl border border-[#E50014]/30 bg-[#E50014]/8 px-4 py-3">
                <CheckCircle className="h-5 w-5 flex-shrink-0 text-[#E50014]" />
                <div className="min-w-0">
                  <p className="text-sm font-condensed font-bold tracking-wide uppercase text-slate-900">
                    {dayData?.puestos.find((p) => p.id === selectedPuestoId)?.name}
                  </p>
                  <p className="text-xs text-slate-600">
                    {fmt(selectedStartTime)} · {duration} minutos
                    {priceStr && ` · ${priceStr}`}
                  </p>
                </div>
                <button
                  onClick={() => { setSelectedPuestoId(null); setSelectedStartTime(null); }}
                  className="ml-auto text-xs font-condensed tracking-widest uppercase text-[#E50014] hover:text-[#8B0000]"
                >
                  Cambiar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Email ───────────────────────────────────────────────────── */}
        <div className="mb-5 space-y-1.5">
          <Label htmlFor="email" className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Email para recibir tu código (opcional)
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11"
          />
        </div>

        {/* ── Error ───────────────────────────────────────────────────── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Pay button (with price) ──────────────────────────────────── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="font-condensed text-xs tracking-widest uppercase text-slate-400">Total a pagar</span>
            <span className="font-racing text-2xl text-slate-900 tracking-wider">
              {priceStr ?? (selectedPuestoId ? "—" : "Seleccioná un horario")}
            </span>
          </div>
          <button
            className={`w-full h-12 rounded-xl font-condensed font-bold tracking-widest uppercase text-sm transition flex items-center justify-center gap-2 ${
              loading || !selectedPuestoId || !selectedStartTime
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-[#E50014] hover:bg-[#ff1a2b] text-white shadow-[0_0_16px_rgba(229,0,20,0.3)]"
            }`}
            onClick={handleCheckout}
            disabled={loading || !selectedPuestoId || !selectedStartTime}
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                PROCESANDO...
              </>
            ) : (
              "IR A PAGAR CON MERCADOPAGO →"
            )}
          </button>
          <p className="mt-2 text-center text-xs font-condensed tracking-widest uppercase text-slate-400">
            Pago seguro · Tarjeta, débito o efectivo
          </p>
        </div>

        <div className="mt-4 text-center">
          <Link href="/" className="text-xs font-condensed tracking-widest uppercase text-slate-400 hover:text-slate-600 transition">
            ← Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function BookingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
        </div>
      }
    >
      <ReservaContent />
    </Suspense>
  );
}
