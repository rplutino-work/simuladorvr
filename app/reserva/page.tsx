"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
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

const HOW_STEPS = [
  {
    n: "01",
    icon: "📅",
    title: "ELEGÍ TU SESIÓN",
    desc: "Seleccioná fecha, duración y el simulador disponible en el calendario de arriba.",
  },
  {
    n: "02",
    icon: "💳",
    title: "PAGÁ ONLINE",
    desc: "Pago 100% seguro con MercadoPago. Tarjeta de crédito, débito o efectivo.",
  },
  {
    n: "03",
    icon: "📧",
    title: "RECIBÍ TU CÓDIGO",
    desc: "En segundos te enviamos un código de 6 caracteres al email. Guardalo: es tu llave de entrada.",
  },
  {
    n: "04",
    icon: "🏎️",
    title: "LLEGÁ AL LOCAL",
    desc: "Presentate en el simulador a la hora exacta de tu reserva. No es necesario avisar.",
  },
  {
    n: "05",
    icon: "📱",
    title: "INGRESÁ EL CÓDIGO EN LA TABLET",
    desc: "Cada simulador tiene una tablet. Tocá 'Iniciar sesión', ingresá tu código de 6 caracteres y la pantalla se activa automáticamente.",
  },
  {
    n: "06",
    icon: "🏁",
    title: "¡A CORRER!",
    desc: "Tu sesión arranca al instante. El tiempo corre desde que confirmás en la tablet.",
  },
];

// ── Step indicator ─────────────────────────────────────────────────────────
function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div
      className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-racing transition-all ${
        done
          ? "bg-[#E50014] text-white"
          : active
          ? "bg-[#E50014] text-white ring-2 ring-[#E50014] ring-offset-2 ring-offset-[#0D0008]"
          : "bg-white/10 text-white/30 border border-white/10"
      }`}
    >
      {done ? <CheckCircle className="h-3.5 w-3.5" /> : n}
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
  const [dayData, setDayData] = useState<DayAvailability | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [selectedPuestoId, setSelectedPuestoId] = useState<string | null>(null);
  const [selectedStartTime, setSelectedStartTime] = useState<string | null>(null);
  const [activeMobilePuestoId, setActiveMobilePuestoId] = useState<string | null>(null);

  const [duration, setDuration] = useState<number>(60);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    errorParam === "payment_failed" ? "El pago no pudo completarse. Intentalo de nuevo." : null
  );

  useEffect(() => {
    fetch("/api/puestos").then((r) => r.json()).then(setPuestos).catch(() => {});
  }, []);

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
  const price = selectedPuesto ? (selectedPuesto[priceKey] ?? 0) : 0;
  const priceStr =
    price > 0
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

  const mobilePuestoData = dayData?.puestos.find((p) => p.id === activeMobilePuestoId);
  const mobilePuesto = puestos.find((p) => p.id === activeMobilePuestoId);

  return (
    <div className="min-h-screen bg-[#0D0008]">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#080C2E]/95 backdrop-blur-sm shadow-lg">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white transition font-condensed tracking-widest uppercase"
          >
            <ChevronLeft className="h-4 w-4" />
            INICIO
          </Link>
          <span className="flex items-center gap-2 font-racing tracking-widest text-white text-base">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-[#E50014] text-white font-racing text-xs leading-none">
              V
            </span>
            RESERVAR SESIÓN
          </span>
          <div className="w-16" />
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-3xl">

        {/* ── Steps indicator ──────────────────────────────────────────── */}
        <div className="mb-8 flex items-center gap-2">
          <StepDot n={1} active={false} done={true} />
          <div className="h-px flex-1 bg-gradient-to-r from-[#E50014]/60 to-white/10" />
          <StepDot n={2} active={step === 2} done={step > 2} />
          <div className={`h-px flex-1 transition-all ${step > 2 ? "bg-[#E50014]/60" : "bg-white/10"}`} />
          <StepDot n={3} active={step === 3} done={false} />
          <span className="ml-2 text-xs font-condensed tracking-widest uppercase text-white/40">
            {step === 2 ? "ELEGÍ HORARIO" : step === 3 ? "CONFIRMÁ" : ""}
          </span>
        </div>

        {/* ── Date + Duration row ─────────────────────────────────────── */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-[1fr_auto]">
          {/* Date */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-condensed font-medium tracking-widest uppercase text-white/40">
              <Calendar className="h-3.5 w-3.5" /> FECHA
            </label>
            <input
              id="date"
              type="date"
              min={minDate}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 w-full rounded-xl border border-white/10 bg-[#080C2E] px-3 text-white font-condensed tracking-wide text-sm focus:outline-none focus:ring-2 focus:ring-[#E50014]/50 focus:border-[#E50014]/50 transition [color-scheme:dark]"
            />
          </div>

          {/* Duration */}
          <div className="space-y-2 col-span-2 sm:col-span-1">
            <label className="flex items-center gap-1.5 text-xs font-condensed font-medium tracking-widest uppercase text-white/40">
              <Clock className="h-3.5 w-3.5" /> DURACIÓN
            </label>
            <div className="flex gap-2 h-11">
              {DURATIONS.map((d) => (
                <motion.button
                  key={d}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setDuration(d)}
                  className={`flex-1 rounded-xl border text-sm font-racing tracking-widest uppercase transition-all ${
                    duration === d
                      ? "border-[#E50014] bg-[#E50014] text-white shadow-[0_0_12px_rgba(229,0,20,0.4)]"
                      : "border-white/10 bg-[#080C2E] text-white/50 hover:border-[#E50014]/50 hover:text-white"
                  }`}
                >
                  {d}m
                </motion.button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Slot grid label ─────────────────────────────────────────── */}
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-condensed font-medium uppercase tracking-widest text-white/40">
            HORARIOS DISPONIBLES
          </p>
          <span className="flex gap-3 text-xs font-condensed">
            <span className="flex items-center gap-1.5 text-white/30">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#E50014]/30 border border-[#E50014]/50" />
              LIBRE
            </span>
            <span className="flex items-center gap-1.5 text-white/30">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#E50014]" />
              ELEGIDO
            </span>
          </span>
        </div>

        {/* ── Slot grid ──────────────────────────────────────────────── */}
        <div className="mb-6">
          {loadingSlots ? (
            <div className="flex h-40 items-center justify-center rounded-2xl border border-white/10 bg-[#080C2E]">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/10 border-t-[#E50014]" />
            </div>
          ) : !dayData || dayData.puestos.length === 0 ? (
            <div className="rounded-2xl border border-yellow-500/20 bg-yellow-900/20 p-5 text-sm text-yellow-300 font-condensed">
              <p className="font-bold tracking-wide uppercase">Sin simuladores configurados</p>
              <p className="mt-1 text-yellow-400/70 text-xs tracking-wide">
                Configurá los puestos y horarios desde el panel de administración.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile / Tablet: tabs per puesto */}
              <div className="lg:hidden">
                <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                  {dayData.puestos.map((p) => {
                    const pricingPuesto = puestos.find((x) => x.id === p.id);
                    const tabPrice = pricingPuesto ? pricingPuesto[priceKey] : 0;
                    return (
                      <motion.button
                        key={p.id}
                        type="button"
                        whileTap={{ scale: 0.96 }}
                        onClick={() => {
                          setActiveMobilePuestoId(p.id);
                          setSelectedPuestoId(null);
                          setSelectedStartTime(null);
                        }}
                        className={`flex-shrink-0 rounded-xl border px-3 py-2 text-left transition-all ${
                          activeMobilePuestoId === p.id
                            ? "border-[#E50014] bg-[#E50014] text-white shadow-[0_0_10px_rgba(229,0,20,0.3)]"
                            : "border-white/10 bg-[#080C2E] text-white/60 hover:border-white/20"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Car className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="text-sm font-condensed font-bold whitespace-nowrap tracking-wide">
                            {p.name}
                          </span>
                        </div>
                        {tabPrice > 0 && (
                          <p
                            className={`mt-0.5 text-xs font-condensed ${
                              activeMobilePuestoId === p.id ? "text-white/70" : "text-white/30"
                            }`}
                          >
                            ${(tabPrice / 100).toLocaleString("es-AR")}
                          </p>
                        )}
                      </motion.button>
                    );
                  })}
                </div>

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
                        <div className="rounded-2xl border border-white/10 bg-[#080C2E] p-8 text-center text-sm text-white/30 font-condensed tracking-wide">
                          Sin horarios disponibles para este simulador hoy
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-white/10 bg-[#080C2E] p-3 sm:p-4">
                          {mobilePuesto && (
                            <p className="mb-2 text-xs font-condensed tracking-widest uppercase text-white/25 text-center">
                              {mobilePuesto.name} &mdash; {duration} MIN &mdash;{" "}
                              ${(mobilePuesto[priceKey] / 100).toLocaleString("es-AR")}
                            </p>
                          )}
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
                                  whileTap={available ? { scale: 0.92 } : {}}
                                  className={`rounded-xl py-2.5 text-sm font-racing tracking-wider transition-all ${
                                    isSelected
                                      ? "bg-[#E50014] text-white shadow-[0_0_12px_rgba(229,0,20,0.5)] ring-2 ring-[#E50014] ring-offset-1 ring-offset-[#080C2E]"
                                      : available
                                      ? "bg-[#E50014]/15 text-[#E50014] border border-[#E50014]/30 hover:bg-[#E50014]/25"
                                      : "cursor-not-allowed bg-white/5 text-white/15 border border-white/5"
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

              {/* Desktop: full table grid */}
              <div className="hidden lg:block overflow-x-auto rounded-2xl border border-white/10 bg-[#080C2E]">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-[#0D0008]">
                      <th className="w-20 p-3 text-left text-xs font-condensed font-semibold uppercase tracking-widest text-white/30">
                        HORA
                      </th>
                      {dayData.puestos.map((p) => {
                        const pricingPuesto = puestos.find((x) => x.id === p.id);
                        const tabPrice = pricingPuesto ? pricingPuesto[priceKey] : 0;
                        return (
                          <th
                            key={p.id}
                            className="border-l border-white/10 p-3 text-center text-xs font-condensed font-semibold uppercase tracking-widest text-white/50"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <Car className="h-3.5 w-3.5 text-[#E50014]/60" />
                              {p.name}
                            </span>
                            {tabPrice > 0 && (
                              <span className="ml-1.5 text-[#E50014]/70 font-racing text-sm">
                                ${(tabPrice / 100).toLocaleString("es-AR")}
                              </span>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {dayData.slots.map((slotTime, i) => (
                      <tr
                        key={slotTime}
                        className={`border-b border-white/5 last:border-0 transition-colors ${
                          i % 2 === 0 ? "bg-transparent" : "bg-white/[0.02]"
                        }`}
                      >
                        <td className="whitespace-nowrap p-3 text-xs font-racing tracking-wider text-white/40">
                          {fmt(slotTime)}
                        </td>
                        {dayData.puestos.map((p) => {
                          const available = isAvailable(p.id, slotTime);
                          const isSelected =
                            selectedPuestoId === p.id && selectedStartTime === slotTime;
                          return (
                            <td key={p.id} className="border-l border-white/5 p-1.5">
                              <motion.button
                                type="button"
                                disabled={!available}
                                onClick={() => {
                                  if (available) {
                                    setSelectedPuestoId(p.id);
                                    setSelectedStartTime(slotTime);
                                  }
                                }}
                                whileHover={available ? { scale: 1.05 } : {}}
                                whileTap={available ? { scale: 0.95 } : {}}
                                className={`h-9 w-full rounded-lg text-xs font-racing tracking-wider transition-all ${
                                  isSelected
                                    ? "bg-[#E50014] text-white shadow-[0_0_12px_rgba(229,0,20,0.5)] ring-2 ring-[#E50014] ring-offset-1 ring-offset-[#080C2E]"
                                    : available
                                    ? "bg-[#E50014]/15 text-[#E50014] border border-[#E50014]/30 hover:bg-[#E50014]/25"
                                    : "cursor-not-allowed bg-white/5 text-white/15"
                                }`}
                              >
                                {available ? "LIBRE" : "—"}
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
              className="mb-6 overflow-hidden"
            >
              <div className="flex items-center gap-3 rounded-2xl border border-[#E50014]/40 bg-[#E50014]/10 px-4 py-3.5 shadow-[0_0_20px_rgba(229,0,20,0.1)]">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E50014] flex-shrink-0">
                  <CheckCircle className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-racing tracking-widest uppercase text-white">
                    {dayData?.puestos.find((p) => p.id === selectedPuestoId)?.name}
                  </p>
                  <p className="text-xs font-condensed text-white/50 tracking-wide mt-0.5">
                    {fmt(selectedStartTime)} &nbsp;·&nbsp; {duration} MIN
                    {priceStr && ` · ${priceStr}`}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedPuestoId(null);
                    setSelectedStartTime(null);
                  }}
                  className="text-xs font-condensed tracking-widest uppercase text-[#E50014] hover:text-white transition flex-shrink-0"
                >
                  CAMBIAR
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Email ───────────────────────────────────────────────────── */}
        <div className="mb-6 space-y-2">
          <label
            htmlFor="email"
            className="flex items-center gap-1.5 text-xs font-condensed font-medium uppercase tracking-widest text-white/40"
          >
            EMAIL PARA RECIBIR TU CÓDIGO{" "}
            <span className="text-white/20 normal-case tracking-normal">(opcional)</span>
          </label>
          <input
            id="email"
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full rounded-xl border border-white/10 bg-[#080C2E] px-4 text-white font-condensed tracking-wide text-sm placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-[#E50014]/50 focus:border-[#E50014]/50 transition"
          />
        </div>

        {/* ── Error ───────────────────────────────────────────────────── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-900/20 px-4 py-3 text-sm text-red-400 font-condensed tracking-wide"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Pay panel ──────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-white/10 bg-[#080C2E] p-5 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <span className="font-condensed text-xs tracking-widest uppercase text-white/30">
              TOTAL A PAGAR
            </span>
            <span className="font-racing text-3xl tracking-wider text-white">
              {priceStr ?? (
                <span className="text-white/20 text-lg">
                  Seleccioná un horario
                </span>
              )}
            </span>
          </div>

          <motion.button
            whileHover={!loading && selectedPuestoId && selectedStartTime ? { scale: 1.01 } : {}}
            whileTap={!loading && selectedPuestoId && selectedStartTime ? { scale: 0.98 } : {}}
            className={`w-full h-14 rounded-xl font-racing text-lg tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-3 ${
              loading || !selectedPuestoId || !selectedStartTime
                ? "bg-white/5 text-white/20 cursor-not-allowed border border-white/5"
                : "bg-[#E50014] hover:bg-[#ff1a2b] text-white shadow-[0_0_24px_rgba(229,0,20,0.4)] border border-[#E50014]"
            }`}
            onClick={handleCheckout}
            disabled={loading || !selectedPuestoId || !selectedStartTime}
          >
            {loading ? (
              <>
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                PROCESANDO...
              </>
            ) : (
              <>
                IR A PAGAR
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            )}
          </motion.button>

          <div className="mt-3 flex items-center justify-center gap-4 text-xs font-condensed tracking-widest uppercase text-white/20">
            <span>🔒 Pago seguro</span>
            <span>·</span>
            <span>Tarjeta · Débito · Efectivo</span>
            <span>·</span>
            <span>MercadoPago</span>
          </div>
        </div>

        <div className="mt-4 text-center">
          <Link
            href="/"
            className="text-xs font-condensed tracking-widest uppercase text-white/20 hover:text-white/60 transition"
          >
            ← VOLVER AL INICIO
          </Link>
        </div>
      </div>

      {/* ── Cómo funciona ─────────────────────────────────────────────── */}
      <section className="border-t border-white/10 bg-[#080C2E] mt-12 py-16 px-4">
        <div className="container mx-auto max-w-4xl">
          {/* Title */}
          <div className="mb-12 text-center">
            <p className="font-condensed text-xs tracking-[0.3em] uppercase text-[#E50014] mb-2">
              PROCESO
            </p>
            <h2 className="font-racing text-4xl md:text-5xl tracking-widest text-white">
              ¿CÓMO FUNCIONA?
            </h2>
            <div className="mx-auto mt-3 h-0.5 w-16 bg-[#E50014]" />
          </div>

          {/* Steps grid */}
          <div className="grid gap-px bg-white/5 rounded-2xl overflow-hidden border border-white/10 md:grid-cols-2 lg:grid-cols-3">
            {HOW_STEPS.map((step, i) => (
              <motion.div
                key={step.n}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: i * 0.07, duration: 0.4 }}
                className="relative bg-[#080C2E] p-6 hover:bg-[#0D0008] transition-colors group"
              >
                {/* Step number — large background */}
                <span className="absolute top-3 right-4 font-racing text-6xl text-white/[0.04] select-none group-hover:text-white/[0.07] transition-colors">
                  {step.n}
                </span>

                {/* Icon */}
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-[#E50014]/30 bg-[#E50014]/10 text-2xl">
                  {step.icon}
                </div>

                {/* Red step number */}
                <p className="mb-1 font-condensed text-xs tracking-[0.2em] uppercase text-[#E50014]">
                  PASO {step.n}
                </p>

                {/* Title */}
                <h3 className="mb-2 font-racing text-base tracking-widest text-white">
                  {step.title}
                </h3>

                {/* Description */}
                <p className="font-condensed text-sm leading-relaxed text-white/50 tracking-wide">
                  {step.desc}
                </p>

                {/* Highlight special step (tablet) */}
                {i === 4 && (
                  <div className="mt-3 rounded-lg border border-[#E50014]/20 bg-[#E50014]/5 px-3 py-2">
                    <p className="font-condensed text-xs text-[#E50014]/80 tracking-wide leading-relaxed">
                      💡 El código es personal e intransferible. Lo recibís por email al confirmar el pago.
                    </p>
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          {/* CTA al final */}
          <div className="mt-10 text-center">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#E50014] hover:bg-[#ff1a2b] text-white font-racing tracking-[0.2em] text-sm rounded-xl shadow-[0_0_24px_rgba(229,0,20,0.3)] transition-all"
            >
              RESERVAR AHORA
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.button>
            <p className="mt-3 font-condensed text-xs tracking-widest uppercase text-white/20">
              Sin registro · Pago en segundos · Confirmación inmediata
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="bg-[#0D0008] border-t border-white/5 px-6 py-4 text-center">
        <p className="text-white/15 font-condensed text-xs tracking-widest uppercase">
          © {new Date().getFullYear()} Simulador VR
        </p>
      </footer>
    </div>
  );
}

export default function BookingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0D0008] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[#E50014]" />
        </div>
      }
    >
      <ReservaContent />
    </Suspense>
  );
}
