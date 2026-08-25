"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Car, Calendar, Clock, ChevronLeft, AlertCircle, CheckCircle, Users, Instagram } from "lucide-react";
import { groupDiscountPct } from "@/lib/group-discount";

type Puesto = {
  id: string;
  name: string;
  price30: number;
  price60: number;
  price120: number;
};

type DiscountConfig = {
  groupDiscountEnabled: boolean;
  groupDiscountTiers: unknown;
  groupDiscountFrom: Date | null;
  groupDiscountTo: Date | null;
};

type SlotItem = { startTime: string; available: boolean };

type DayAvailability = {
  slots: string[];
  puestos: { id: string; name: string; slots: SlotItem[] }[];
};

const DURATIONS = [30, 60, 120] as const;

function fmt(iso: string) {
  // Siempre en hora de Argentina, no la del navegador (un cliente con el reloj
  // en otra zona veía una hora distinta a la del email de confirmación).
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

/** Los Simuladores 3 y 4 usan lentes de Realidad Virtual (VR). Mismo precio. */
function isVRPuesto(name: string) {
  const n = parseInt(name.replace(/\D/g, ""), 10);
  return n === 3 || n === 4;
}

function VRBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Realidad Virtual — mismo precio"
      className={`inline-flex items-center rounded border border-[#E60012]/50 bg-[#E60012]/20 px-1.5 py-0.5 text-[9px] font-bold leading-none tracking-widest text-[#E60012] ${className}`}
    >
      VR
    </span>
  );
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
    desc: "En segundos te enviamos un código de 4 caracteres al email. Guardalo: es tu llave de entrada.",
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
    desc: "Cada simulador tiene una tablet. Tocá 'Iniciar sesión', ingresá tu código de 4 caracteres y la pantalla se activa automáticamente.",
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
          ? "bg-[#E60012] text-white"
          : active
          ? "bg-[#E60012] text-white ring-2 ring-[#E60012] ring-offset-2 ring-offset-[#0A0A0C]"
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
    // "Hoy" en hora de Argentina (UTC-3), no la del navegador ni UTC — si no,
    // a la tarde la fecha por defecto se corría uno o dos días.
    const ar = new Date(Date.now() - 3 * 60 * 60 * 1000);
    if (ar.getUTCHours() >= 20) ar.setUTCDate(ar.getUTCDate() + 1);
    return ar.toISOString().slice(0, 10);
  });
  const [dayData, setDayData] = useState<DayAvailability | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Multi-select: a group plays together at ONE time slot. `selectedIds` holds
  // the puestos chosen at `selectedStartTime`. One selected → single booking;
  // two or more → group booking with the progressive discount.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedStartTime, setSelectedStartTime] = useState<string | null>(null);
  const [activeMobilePuestoId, setActiveMobilePuestoId] = useState<string | null>(null);
  const [discount, setDiscount] = useState<DiscountConfig | null>(null);

  const [duration, setDuration] = useState<number>(60);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(
    errorParam === "payment_failed" ? "El pago no pudo completarse. Intentalo de nuevo." : null
  );

  useEffect(() => {
    fetch("/api/puestos").then((r) => r.json()).then(setPuestos).catch(() => {});
    fetch("/api/group-discount")
      .then((r) => r.json())
      .then((d) =>
        setDiscount({
          groupDiscountEnabled: d.enabled ?? false,
          groupDiscountTiers: d.tiers ?? null,
          groupDiscountFrom: d.from ? new Date(d.from) : null,
          groupDiscountTo: d.to ? new Date(d.to) : null,
        })
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!date) return;
    setLoadingSlots(true);
    setSelectedIds([]);
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

  const priceKey = duration === 30 ? "price30" : duration === 60 ? "price60" : "price120";

  // Group-aware pricing over the current selection.
  const selectedPuestos = selectedIds
    .map((id) => puestos.find((p) => p.id === id))
    .filter((p): p is Puesto => Boolean(p));
  const baseTotal = selectedPuestos.reduce((s, p) => s + (p[priceKey] ?? 0), 0);
  const isGroup = selectedIds.length >= 2;
  const discountPct =
    isGroup && discount ? groupDiscountPct(discount, selectedIds.length) : 0;
  const total = Math.round(baseTotal * (1 - discountPct / 100));
  const totalStr =
    total > 0
      ? (total / 100).toLocaleString("es-AR", { style: "currency", currency: "ARS" })
      : null;
  const baseTotalStr = (baseTotal / 100).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
  });

  const hasSelection = selectedIds.length > 0 && !!selectedStartTime;

  function isAvailable(puestoId: string, startTime: string) {
    const p = dayData?.puestos.find((x) => x.id === puestoId);
    if (!p) return false;
    const ms = new Date(startTime).getTime();
    return p.slots.find((s) => new Date(s.startTime).getTime() === ms)?.available ?? false;
  }

  // Toggle a puesto at a given slot. Selecting a different time starts a fresh
  // group (a group always plays together at the same hour).
  function toggleCell(puestoId: string, startTime: string) {
    if (selectedStartTime !== startTime) {
      setSelectedStartTime(startTime);
      setSelectedIds([puestoId]);
      return;
    }
    setSelectedIds((prev) => {
      const next = prev.includes(puestoId)
        ? prev.filter((x) => x !== puestoId)
        : [...prev, puestoId];
      if (next.length === 0) setSelectedStartTime(null);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds([]);
    setSelectedStartTime(null);
  }

  async function handleCheckout() {
    // Guard sincrónico: dos clicks en el mismo frame pasan el chequeo de
    // `loading` (que es async) y disparan dos POST. Este ref los frena al toque.
    if (submittingRef.current) return;
    if (!hasSelection || !selectedStartTime) {
      setError("Seleccioná un horario primero");
      return;
    }
    submittingRef.current = true;
    setError(null);
    setLoading(true);
    try {
      const isSandbox = process.env.NEXT_PUBLIC_MERCADOPAGO_SANDBOX === "true";
      if (isGroup) {
        const res = await fetch("/api/bookings/group", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            puestoIds: selectedIds,
            duration,
            startTime: selectedStartTime,
            customerEmail: email || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Error al crear la reserva grupal");
        const initPoint = isSandbox ? (data.sandboxInitPoint ?? data.initPoint) : data.initPoint;
        if (initPoint) window.location.href = initPoint;
        else router.push(`/reserva/confirmacion?groupId=${data.groupId}`);
        return;
      }
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          puestoId: selectedIds[0],
          duration,
          startTime: selectedStartTime,
          customerEmail: email || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al crear reserva");
      const initPoint = isSandbox ? (data.sandboxInitPoint ?? data.initPoint) : data.initPoint;
      if (initPoint) window.location.href = initPoint;
      else router.push(`/reserva/confirmacion?bookingId=${data.bookingId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al procesar");
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }

  const minDate = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const step: 1 | 2 | 3 = !hasSelection ? 2 : 3;

  const mobilePuestoData = dayData?.puestos.find((p) => p.id === activeMobilePuestoId);
  const mobilePuesto = puestos.find((p) => p.id === activeMobilePuestoId);

  return (
    <div className="min-h-screen bg-[#0A0A0C]">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0A0A0C]/95 backdrop-blur-sm shadow-lg">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition font-condensed tracking-widest uppercase"
          >
            <ChevronLeft className="h-4 w-4" />
            INICIO
          </Link>
          <Link href="/" className="flex items-center">
            <Image
              src="/race-room-logo.png"
              alt="Race Room"
              width={512}
              height={512}
              className="h-10 w-auto"
            />
          </Link>
          <div className="w-16" />
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-3xl">

        {/* ── Steps indicator ──────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8 flex items-center gap-2"
        >
          <StepDot n={1} active={false} done={true} />
          <div className="h-px flex-1 bg-gradient-to-r from-[#E60012]/60 to-white/10" />
          <StepDot n={2} active={step === 2} done={step > 2} />
          <div className={`h-px flex-1 transition-all duration-500 ${step > 2 ? "bg-[#E60012]/60" : "bg-white/10"}`} />
          <StepDot n={3} active={step === 3} done={false} />
          <span className="ml-2 text-xs font-condensed tracking-widest uppercase text-white/50">
            {step === 2 ? "ELEGÍ HORARIO" : step === 3 ? "CONFIRMÁ" : ""}
          </span>
        </motion.div>

        {/* ── Date row ────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="mb-4"
        >
          <label className="flex items-center gap-1.5 mb-2 text-xs font-condensed font-semibold tracking-widest uppercase text-white/60">
            <Calendar className="h-3.5 w-3.5 text-[#E60012]" /> FECHA
          </label>
          <input
            id="date"
            type="date"
            min={minDate}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-12 w-full rounded-xl border border-white/15 bg-[#0A0A0C] px-4 text-white font-condensed tracking-wide text-sm focus:outline-none focus:ring-2 focus:ring-[#E60012]/50 focus:border-[#E60012]/60 transition [color-scheme:dark] hover:border-white/25"
          />
        </motion.div>

        {/* ── Duration row (full width, bigger) ──────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.12 }}
          className="mb-6"
        >
          <label className="flex items-center gap-1.5 mb-2 text-xs font-condensed font-semibold tracking-widest uppercase text-white/60">
            <Clock className="h-3.5 w-3.5 text-[#E60012]" /> DURACIÓN DE LA SESIÓN
          </label>
          <div className="grid grid-cols-3 gap-3">
            {DURATIONS.map((d, i) => (
              <motion.button
                key={d}
                type="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.06 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => setDuration(d)}
                className={`relative flex flex-col items-center justify-center py-4 rounded-xl border transition-all duration-200 ${
                  duration === d
                    ? "border-[#E60012] bg-[#E60012] text-white shadow-[0_0_18px_rgba(230,0,18,0.45)]"
                    : "border-white/15 bg-[#0A0A0C] text-white/70 hover:border-[#E60012]/50 hover:bg-[#E60012]/8"
                }`}
              >
                <span className={`font-racing text-3xl leading-none ${duration === d ? "text-white" : "text-white/80"}`}>
                  {d}
                </span>
                <span className={`font-condensed text-xs tracking-widest mt-0.5 ${duration === d ? "text-white/80" : "text-white/40"}`}>
                  MINUTOS
                </span>
                {duration === d && (
                  <motion.div
                    layoutId="dur-active"
                    className="absolute inset-0 rounded-xl ring-2 ring-[#E60012] ring-offset-2 ring-offset-[#0A0A0C]"
                  />
                )}
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* ── Slot grid label ─────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.22 }}
          className="mb-3 flex items-center justify-between"
        >
          <p className="text-xs font-condensed font-semibold uppercase tracking-widest text-white/60">
            HORARIOS DISPONIBLES
          </p>
          <span className="flex gap-3 text-xs font-condensed">
            <span className="flex items-center gap-1.5 text-white/50">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#E60012]/30 border border-[#E60012]/50" />
              LIBRE
            </span>
            <span className="flex items-center gap-1.5 text-white/50">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#E60012]" />
              ELEGIDO
            </span>
          </span>
        </motion.div>

        {/* ── Group discount hint ─────────────────────────────────────── */}
        {discount?.groupDiscountEnabled && groupDiscountPct(discount, 5) > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.24 }}
            className="mb-3 flex items-start gap-2.5 rounded-xl border border-[#E60012]/25 bg-[#E60012]/8 px-3.5 py-2.5"
          >
            <Users className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#E60012]" />
            <p className="text-xs font-condensed tracking-wide text-white/70 leading-relaxed">
              <span className="font-bold text-white">¿Vienen en grupo?</span> Elegí{" "}
              <span className="text-[#E60012] font-bold">2 o más simuladores</span> en el mismo
              horario y el descuento se aplica solo — hasta{" "}
              <span className="text-[#E60012] font-bold">
                {groupDiscountPct(discount, 5)}% off
              </span>{" "}
              con 5 puestos.
            </p>
          </motion.div>
        )}

        {/* ── VR hint ─────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.26 }}
          className="mb-3 flex items-start gap-2.5 rounded-xl border border-[#E60012]/25 bg-[#E60012]/8 px-3.5 py-2.5"
        >
          <VRBadge className="mt-0.5 flex-shrink-0" />
          <p className="text-xs font-condensed tracking-wide text-white/70 leading-relaxed">
            <span className="font-bold text-white">Simuladores 3 y 4 con Realidad Virtual opcional.</span>{" "}
            Tienen lentes VR disponibles: podés jugar{" "}
            <span className="text-[#E60012] font-bold">con VR o de forma normal</span>, como
            prefieras — al mismo precio que los demás.
          </p>
        </motion.div>

        {/* ── Slot grid ──────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.28 }}
          className="mb-6"
        >
          {loadingSlots ? (
            <div className="flex h-40 items-center justify-center rounded-2xl border border-white/10 bg-[#0A0A0C]">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/10 border-t-[#E60012]" />
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
                        onClick={() => setActiveMobilePuestoId(p.id)}
                        className={`flex-shrink-0 rounded-xl border px-3 py-2 text-left transition-all ${
                          activeMobilePuestoId === p.id
                            ? "border-[#E60012] bg-[#E60012] text-white shadow-[0_0_10px_rgba(230,0,18,0.3)]"
                            : "border-white/10 bg-[#0A0A0C] text-white/60 hover:border-white/20"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Car className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="text-sm font-condensed font-bold whitespace-nowrap tracking-wide">
                            {p.name}
                          </span>
                          {isVRPuesto(p.name) && <VRBadge />}
                        </div>
                        {tabPrice > 0 && (
                          <p
                            className={`mt-1 text-xs font-racing tracking-wider ${
                              activeMobilePuestoId === p.id ? "text-white" : "text-white/50"
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
                        <div className="rounded-2xl border border-white/10 bg-[#0A0A0C] p-8 text-center text-sm text-white/30 font-condensed tracking-wide">
                          Sin horarios disponibles para este simulador hoy
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-white/10 bg-[#0A0A0C] p-3 sm:p-4">
                          {mobilePuesto && (
                            <p className="mb-2 text-xs font-condensed tracking-widest uppercase text-white/25 text-center">
                              {mobilePuesto.name} &mdash; {duration} MIN &mdash;{" "}
                              ${(mobilePuesto[priceKey] / 100).toLocaleString("es-AR")}
                            </p>
                          )}
                          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                            {mobilePuestoData.slots.map((slot, si) => {
                              const available = slot.available;
                              const isSelected =
                                !!activeMobilePuestoId &&
                                selectedStartTime === slot.startTime &&
                                selectedIds.includes(activeMobilePuestoId);
                              return (
                                <motion.button
                                  key={slot.startTime}
                                  type="button"
                                  disabled={!available}
                                  initial={{ opacity: 0, scale: 0.85 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ delay: si * 0.018, duration: 0.2 }}
                                  onClick={() => {
                                    if (available && activeMobilePuestoId) {
                                      toggleCell(activeMobilePuestoId, slot.startTime);
                                    }
                                  }}
                                  whileTap={available ? { scale: 0.92 } : {}}
                                  className={`rounded-xl py-2.5 text-sm font-racing tracking-wider transition-all ${
                                    isSelected
                                      ? "bg-[#E60012] text-white shadow-[0_0_12px_rgba(230,0,18,0.5)] ring-2 ring-[#E60012] ring-offset-1 ring-offset-[#0A0A0C]"
                                      : available
                                      ? "bg-[#E60012]/15 text-[#E60012] border border-[#E60012]/30 hover:bg-[#E60012]/25"
                                      : "cursor-not-allowed bg-white/5 text-white/20 border border-white/5"
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
              <div className="hidden lg:block overflow-x-auto rounded-2xl border border-white/10 bg-[#0A0A0C]">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-[#0A0A0C]">
                      <th className="w-20 p-3 text-left text-xs font-condensed font-semibold uppercase tracking-widest text-white/30">
                        HORA
                      </th>
                      {dayData.puestos.map((p) => {
                        const pricingPuesto = puestos.find((x) => x.id === p.id);
                        const tabPrice = pricingPuesto ? pricingPuesto[priceKey] : 0;
                        return (
                          <th
                            key={p.id}
                            className="border-l border-white/10 p-3 text-center"
                          >
                            <div className="flex flex-col items-center gap-1">
                              <span className="inline-flex items-center gap-1.5 text-xs font-condensed font-semibold uppercase tracking-widest text-white/70">
                                <Car className="h-3.5 w-3.5 text-[#E60012]/80 flex-shrink-0" />
                                {p.name}
                                {isVRPuesto(p.name) && <VRBadge />}
                              </span>
                              {tabPrice > 0 && (
                                <span className="font-racing text-base tracking-wider text-[#E60012]">
                                  ${(tabPrice / 100).toLocaleString("es-AR")}
                                </span>
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {dayData.slots.map((slotTime, i) => (
                      <motion.tr
                        key={slotTime}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.022, duration: 0.25 }}
                        className={`border-b border-white/5 last:border-0 transition-colors ${
                          i % 2 === 0 ? "bg-transparent" : "bg-white/[0.015]"
                        }`}
                      >
                        <td className="whitespace-nowrap p-3 text-xs font-racing tracking-wider text-white/60">
                          {fmt(slotTime)}
                        </td>
                        {dayData.puestos.map((p) => {
                          const available = isAvailable(p.id, slotTime);
                          const isSelected =
                            selectedStartTime === slotTime && selectedIds.includes(p.id);
                          return (
                            <td key={p.id} className="border-l border-white/5 p-1.5">
                              <motion.button
                                type="button"
                                disabled={!available}
                                onClick={() => {
                                  if (available) toggleCell(p.id, slotTime);
                                }}
                                whileHover={available ? { scale: 1.06 } : {}}
                                whileTap={available ? { scale: 0.94 } : {}}
                                className={`h-9 w-full rounded-lg text-xs font-racing tracking-wider transition-all ${
                                  isSelected
                                    ? "bg-[#E60012] text-white shadow-[0_0_12px_rgba(230,0,18,0.5)] ring-2 ring-[#E60012] ring-offset-1 ring-offset-[#0A0A0C]"
                                    : available
                                    ? "bg-[#E60012]/15 text-[#E60012] border border-[#E60012]/30 hover:bg-[#E60012]/25"
                                    : "cursor-not-allowed bg-white/5 text-white/20"
                                }`}
                              >
                                {isSelected ? "✓" : available ? "LIBRE" : "—"}
                              </motion.button>
                            </td>
                          );
                        })}
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </motion.div>

        {/* ── Selection summary ────────────────────────────────────────── */}
        <AnimatePresence>
          {hasSelection && selectedStartTime && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 overflow-hidden"
            >
              <div className="rounded-2xl border border-[#E60012]/40 bg-[#E60012]/10 px-4 py-3.5 shadow-[0_0_20px_rgba(230,0,18,0.1)]">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E60012] flex-shrink-0">
                    {isGroup ? (
                      <Users className="h-5 w-5 text-white" />
                    ) : (
                      <CheckCircle className="h-5 w-5 text-white" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-racing tracking-widest uppercase text-white">
                      {isGroup
                        ? `GRUPO · ${selectedIds.length} SIMULADORES`
                        : selectedPuestos[0]?.name}
                    </p>
                    <p className="text-xs font-condensed text-white/50 tracking-wide mt-0.5">
                      {fmt(selectedStartTime)} &nbsp;·&nbsp; {duration} MIN
                    </p>
                  </div>
                  <button
                    onClick={clearSelection}
                    className="text-xs font-condensed tracking-widest uppercase text-[#E60012] hover:text-white transition flex-shrink-0"
                  >
                    CAMBIAR
                  </button>
                </div>

                {isGroup && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#E60012]/20 pt-3">
                    {selectedPuestos.map((p) => (
                      <span
                        key={p.id}
                        className="inline-flex items-center gap-1 rounded-md bg-[#E60012]/15 px-2 py-1 text-xs font-condensed tracking-wide text-white/80"
                      >
                        <Car className="h-3 w-3 text-[#E60012]" />
                        {p.name}
                        {isVRPuesto(p.name) && <VRBadge className="ml-0.5" />}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Email ───────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.18 }}
          className="mb-6 space-y-2"
        >
          <label
            htmlFor="email"
            className="flex items-center gap-1.5 text-xs font-condensed font-semibold uppercase tracking-widest text-white/60"
          >
            EMAIL PARA RECIBIR TU CÓDIGO
            <span className="text-white/30 font-condensed normal-case tracking-normal font-normal">(opcional)</span>
          </label>
          <input
            id="email"
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 w-full rounded-xl border border-white/15 bg-[#0A0A0C] px-4 text-white font-condensed tracking-wide text-sm placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#E60012]/50 focus:border-[#E60012]/60 transition hover:border-white/25"
          />
        </motion.div>

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
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.24 }}
          className="rounded-2xl border border-white/10 bg-[#0A0A0C] p-5 shadow-xl"
        >
          {isGroup && discountPct > 0 && (
            <div className="mb-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-condensed tracking-wide text-white/45">
                <span>{selectedIds.length} simuladores · precio normal</span>
                <span className="line-through">{baseTotalStr}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-[#E60012]/15 px-2 py-0.5 text-xs font-racing tracking-wider text-[#E60012]">
                  <Users className="h-3 w-3" /> DESCUENTO GRUPO
                </span>
                <span className="text-sm font-racing tracking-wider text-[#E60012]">
                  −{discountPct}%
                </span>
              </div>
            </div>
          )}

          <div className="mb-4 flex items-center justify-between">
            <span className="font-condensed text-xs tracking-widest uppercase text-white/55">
              TOTAL A PAGAR
            </span>
            <span className="font-racing text-3xl tracking-wider text-white">
              {totalStr ?? (
                <span className="text-white/20 text-lg">
                  Seleccioná un horario
                </span>
              )}
            </span>
          </div>

          <motion.button
            whileHover={!loading && hasSelection ? { scale: 1.01 } : {}}
            whileTap={!loading && hasSelection ? { scale: 0.98 } : {}}
            className={`w-full h-14 rounded-xl font-racing text-lg tracking-[0.2em] uppercase transition-all flex items-center justify-center gap-3 ${
              loading || !hasSelection
                ? "bg-white/5 text-white/20 cursor-not-allowed border border-white/5"
                : "bg-[#E60012] hover:bg-[#ff1a2b] text-white shadow-[0_0_24px_rgba(230,0,18,0.4)] border border-[#E60012]"
            }`}
            onClick={handleCheckout}
            disabled={loading || !hasSelection}
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

          <div className="mt-3 flex items-center justify-center gap-4 text-xs font-condensed tracking-widest uppercase text-white/35">
            <span>🔒 Pago seguro</span>
            <span>·</span>
            <span>Tarjeta · Débito · Efectivo</span>
            <span>·</span>
            <span>MercadoPago</span>
          </div>
        </motion.div>

        <div className="mt-5 text-center">
          <Link
            href="/"
            className="text-xs font-condensed tracking-widest uppercase text-white/35 hover:text-white/70 transition"
          >
            ← VOLVER AL INICIO
          </Link>
        </div>
      </div>

      {/* ── Cómo funciona ─────────────────────────────────────────────── */}
      <section className="border-t border-white/10 bg-[#0A0A0C] mt-12 py-16 px-4">
        <div className="container mx-auto max-w-4xl">
          {/* Title */}
          <div className="mb-12 text-center">
            <p className="font-condensed text-xs tracking-[0.3em] uppercase text-[#E60012] mb-2">
              PROCESO
            </p>
            <h2 className="font-racing text-4xl md:text-5xl tracking-widest text-white">
              ¿CÓMO FUNCIONA?
            </h2>
            <div className="mx-auto mt-3 h-0.5 w-16 bg-[#E60012]" />
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
                className="relative bg-[#0A0A0C] p-6 hover:bg-[#0A0A0C] transition-colors group"
              >
                {/* Step number — large background */}
                <span className="absolute top-3 right-4 font-racing text-6xl text-white/[0.04] select-none group-hover:text-white/[0.07] transition-colors">
                  {step.n}
                </span>

                {/* Icon */}
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-[#E60012]/30 bg-[#E60012]/10 text-2xl">
                  {step.icon}
                </div>

                {/* Red step number */}
                <p className="mb-1 font-condensed text-xs tracking-[0.2em] uppercase text-[#E60012]">
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
                  <div className="mt-3 rounded-lg border border-[#E60012]/20 bg-[#E60012]/5 px-3 py-2">
                    <p className="font-condensed text-xs text-[#E60012]/80 tracking-wide leading-relaxed">
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
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#E60012] hover:bg-[#ff1a2b] text-white font-racing tracking-[0.2em] text-sm rounded-xl shadow-[0_0_24px_rgba(230,0,18,0.3)] transition-all"
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
      <footer className="bg-[#0A0A0C] border-t border-white/5 px-6 py-5 text-center">
        <a
          href="https://instagram.com/raceroom.ar"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-white/60 transition hover:border-[#E60012]/50 hover:text-white"
        >
          <Instagram className="h-4 w-4" />
          <span className="font-condensed text-sm tracking-widest">@raceroom.ar</span>
        </a>
        <p className="mt-3 text-white/15 font-condensed text-xs tracking-widest uppercase">
          © {new Date().getFullYear()} Race Room
        </p>
      </footer>
    </div>
  );
}

export default function BookingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0A0A0C] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[#E60012]" />
        </div>
      }
    >
      <ReservaContent />
    </Suspense>
  );
}
