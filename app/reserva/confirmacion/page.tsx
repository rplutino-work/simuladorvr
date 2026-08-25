"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { CheckCircle, Copy, Clock, AlertCircle, Car, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type Booking = {
  id: string;
  status: string;
  code: string | null;
  duration: number;
  startTime: string | null;
  customerEmail: string | null;
  puesto: { name: string };
};

type GroupStatus = {
  status: string;
  code: string | null;
  count: number;
  duration: number;
  startTime: string | null;
  total: number;
  puestos: string[];
};

// A confirmation is either a single booking or a group — normalized to one view.
type View = {
  status: string;
  code: string | null;
  duration: number;
  startTime: string | null;
  customerEmail: string | null;
  puestoLabel: string;
  puestos: string[] | null;
};

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const bookingId  = searchParams.get("bookingId");
  const groupId    = searchParams.get("groupId");
  const mpPaymentId = searchParams.get("payment_id") ?? searchParams.get("collection_id");
  const mpStatus    = searchParams.get("status") ?? searchParams.get("collection_status");
  const hasId = !!bookingId || !!groupId;

  const [booking, setBooking] = useState<Booking | null>(null);
  const [group, setGroup]     = useState<GroupStatus | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [copied, setCopied]   = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const verifiedRef = useRef(false);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If the payment isn't confirmed within this window, stop pretending it's
  // seconds away and show a calmer "it's taking longer" screen — the code
  // still arrives by email once the webhook lands.
  const PROCESSING_TIMEOUT_MS = 90_000;

  async function fetchBooking() {
    if (!bookingId) return;
    let res: Response;
    try {
      res = await fetch(`/api/bookings/${bookingId}`);
    } catch {
      return; // error de red transitorio → el intervalo reintenta, no cortar
    }
    if (res.ok) {
      const data: Booking = await res.json();
      setBooking(data);
      // Cortar el poll en cualquier estado FINAL — incluidos EXPIRED/CANCELLED,
      // que no tienen código (antes seguía pegándole al server para siempre).
      const resolved =
        ((data.status === "PAID" || data.status === "ACTIVE") && !!data.code) ||
        data.status === "EXPIRED" ||
        data.status === "CANCELLED" ||
        data.status === "FINISHED";
      if (resolved && pollRef.current) clearInterval(pollRef.current);
    } else if (res.status === 404) {
      // Sólo un 404 es terminal; un 5xx momentáneo (deploy/cold start) NO debe
      // matar la pantalla — se sigue reintentando.
      setError("Reserva no encontrada");
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }

  async function fetchGroup() {
    if (!groupId) return;
    let res: Response;
    try {
      res = await fetch(`/api/bookings/group/${groupId}`);
    } catch {
      return; // error de red transitorio → reintentar
    }
    if (res.ok) {
      const data: GroupStatus = await res.json();
      setGroup(data);
      const resolved =
        ((data.status === "PAID" || data.status === "ACTIVE") && !!data.code) ||
        data.status === "EXPIRED" ||
        data.status === "CANCELLED" ||
        data.status === "FINISHED";
      if (resolved && pollRef.current) clearInterval(pollRef.current);
    } else if (res.status === 404) {
      setError("Grupo no encontrado");
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }

  async function verifyWithMP() {
    if (!bookingId || !mpPaymentId || verifiedRef.current) return;
    verifiedRef.current = true;
    try {
      const res = await fetch(`/api/bookings/${bookingId}/verify-payment?paymentId=${mpPaymentId}`);
      if (res.ok) {
        const data: Booking = await res.json();
        setBooking(data);
        if ((data.status === "PAID" || data.status === "ACTIVE") && data.code) {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }
    } catch (err) {
      console.error("[confirm] verify-payment:", err);
    }
  }

  async function verifyGroupWithMP() {
    if (!groupId || !mpPaymentId || verifiedRef.current) return;
    verifiedRef.current = true;
    try {
      const res = await fetch(`/api/bookings/group/${groupId}/verify-payment?paymentId=${mpPaymentId}`);
      if (res.ok) {
        const data: GroupStatus = await res.json();
        setGroup(data);
        if ((data.status === "PAID" || data.status === "ACTIVE") && data.code) {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }
    } catch (err) {
      console.error("[confirm] group verify-payment:", err);
    }
  }

  const poll = groupId ? fetchGroup : fetchBooking;

  useEffect(() => {
    if (!hasId) return;
    poll();
    if (mpPaymentId && mpStatus === "approved") {
      if (groupId) verifyGroupWithMP();
      else verifyWithMP();
    }
    pollRef.current = setInterval(poll, 6_000);
    timeoutRef.current = setTimeout(() => setTimedOut(true), PROCESSING_TIMEOUT_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, groupId]);

  const view: View | null = groupId
    ? group
      ? {
          status: group.status,
          code: group.code,
          duration: group.duration,
          startTime: group.startTime,
          customerEmail: null,
          puestoLabel: `${group.count} simuladores`,
          puestos: group.puestos,
        }
      : null
    : booking
    ? {
        status: booking.status,
        code: booking.code,
        duration: booking.duration,
        startTime: booking.startTime,
        customerEmail: booking.customerEmail,
        puestoLabel: booking.puesto.name,
        puestos: null,
      }
    : null;

  useEffect(() => {
    if (view?.code) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, [view?.code]);

  function handleCopy() {
    if (view?.code) {
      navigator.clipboard.writeText(view.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  const isPaid = (view?.status === "PAID" || view?.status === "ACTIVE") && !!view?.code;
  // Reserva que no prosperó (venció sin pago, o fue cancelada) → estado terminal,
  // así no queda "procesando" para siempre.
  const isDead = view?.status === "EXPIRED" || view?.status === "CANCELLED";

  return (
    <div className="min-h-screen bg-[#0A0A0C]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0A0A0C]/90 backdrop-blur-md">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition font-condensed tracking-wide">
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

      <div className="container mx-auto flex min-h-[calc(100vh-56px)] items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">

          {/* ── No id ──────────────────────────────────────────────────── */}
          {!hasId && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center"
            >
              <AlertCircle className="mx-auto h-10 w-10 text-white/30 mb-4" />
              <h2 className="font-racing tracking-wider text-white text-xl">SIN RESERVA</h2>
              <p className="mt-1 text-sm text-white/50">No se encontró un ID de reserva.</p>
              <Link href="/reserva" className="mt-5 block">
                <button className="w-full h-11 rounded-xl bg-[#E60012] font-condensed font-bold tracking-widest uppercase text-sm text-white hover:bg-[#ff1a2b] transition">
                  IR A RESERVAR
                </button>
              </Link>
            </motion.div>
          )}

          {/* ── Error ──────────────────────────────────────────────────── */}
          {hasId && error && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-[#E60012]/30 bg-[#E60012]/10 p-8 text-center"
            >
              <AlertCircle className="mx-auto h-10 w-10 text-[#E60012] mb-4" />
              <h2 className="font-racing tracking-wider text-white text-xl">ERROR</h2>
              <p className="mt-1 text-sm text-white/60">{error}</p>
              <Link href="/reserva" className="mt-5 block">
                <button className="w-full h-11 rounded-xl border border-white/20 font-condensed font-bold tracking-widest uppercase text-sm text-white hover:border-white/40 transition">
                  VOLVER A RESERVAR
                </button>
              </Link>
            </motion.div>
          )}

          {/* ── Confirmed ─────────────────────────────────────────────── */}
          {hasId && !error && isPaid && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
            >
              {/* Success badge */}
              <div className="mb-5 flex justify-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 300 }}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-[#E60012]/20 border-2 border-[#E60012]/40"
                >
                  <CheckCircle className="h-8 w-8 text-[#E60012]" />
                </motion.div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                {/* Code block */}
                <div className="bg-[#0A0A0C] border-b border-[#E60012]/30 px-6 py-6 text-center relative">
                  <div className="absolute inset-y-0 left-0 w-1 bg-[#E60012]" />
                  <p className="font-condensed text-xs font-semibold tracking-widest uppercase text-white/40 mb-2">
                    CÓDIGO DE ACCESO
                  </p>
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="font-racing text-5xl sm:text-6xl tracking-[0.3em] text-white drop-shadow-[0_0_20px_rgba(230,0,18,0.5)]"
                  >
                    {view?.code}
                  </motion.p>
                  {view?.puestos && (
                    <p className="mt-2 font-condensed text-xs tracking-widest uppercase text-white/40">
                      Un solo código para todo el grupo
                    </p>
                  )}
                </div>

                <div className="px-6 py-5 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <p className="font-condensed text-xs font-semibold tracking-widest uppercase text-white/30 mb-0.5">
                        {view?.puestos ? "Simuladores" : "Simulador"}
                      </p>
                      <p className="font-condensed font-bold text-white truncate">{view?.puestoLabel}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <p className="font-condensed text-xs font-semibold tracking-widest uppercase text-white/30 mb-0.5">Duración</p>
                      <p className="font-racing text-lg text-white tracking-wider">{view?.duration} min</p>
                    </div>
                    {view?.puestos && view.puestos.length > 0 && (
                      <div className="col-span-2 flex flex-wrap gap-1.5">
                        {view.puestos.map((name, idx) => (
                          <span
                            key={`${name}-${idx}`}
                            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-condensed tracking-wide text-white/70"
                          >
                            <Car className="h-3 w-3 text-[#E60012]" />
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                    {view?.startTime && (
                      <div className="col-span-2 rounded-xl border border-white/10 bg-white/5 p-3">
                        <p className="font-condensed text-xs font-semibold tracking-widest uppercase text-white/30 mb-0.5">Horario</p>
                        <p className="font-condensed font-bold text-white">
                          {new Date(view.startTime).toLocaleString("es-AR", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: "America/Argentina/Buenos_Aires",
                          })}
                        </p>
                      </div>
                    )}
                  </div>

                  {view?.customerEmail && (
                    <p className="text-xs text-center font-condensed tracking-wide text-white/30">
                      Código enviado a {view.customerEmail}
                    </p>
                  )}

                  <button
                    onClick={handleCopy}
                    className="w-full h-11 rounded-xl border border-white/20 hover:border-[#E60012]/50 font-condensed font-bold tracking-widest uppercase text-sm text-white/70 hover:text-white transition flex items-center justify-center gap-2"
                  >
                    {copied ? (
                      <><CheckCircle className="h-4 w-4 text-[#E60012]" /> COPIADO</>
                    ) : (
                      <><Copy className="h-4 w-4" /> COPIAR CÓDIGO</>
                    )}
                  </button>

                  <div className="flex gap-2">
                    <Link href="/" className="flex-1">
                      <button className="w-full h-10 rounded-xl border border-white/10 font-condensed text-xs tracking-widest uppercase text-white/40 hover:text-white/70 hover:border-white/20 transition">
                        INICIO
                      </button>
                    </Link>
                    <Link href="/reserva" className="flex-1">
                      <button className="w-full h-10 rounded-xl bg-[#E60012] hover:bg-[#ff1a2b] font-condensed font-bold text-xs tracking-widest uppercase text-white transition shadow-[0_0_12px_rgba(230,0,18,0.3)]">
                        NUEVA RESERVA
                      </button>
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Processing (still within the fast window) ─────────────── */}
          {hasId && !error && !isPaid && !isDead && !timedOut && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <div className="rounded-2xl border border-white/10 bg-white/5">
                <div className="flex flex-col items-center gap-4 px-6 py-10">
                  <div className="relative flex h-16 w-16 items-center justify-center">
                    <div className="absolute inset-0 animate-ping rounded-full bg-[#E60012]/20" />
                    <div className="relative h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-[#E60012]" />
                  </div>
                  <div className="text-center">
                    <h2 className="font-racing text-xl tracking-wider text-white">PROCESANDO PAGO...</h2>
                    <p className="mt-1.5 text-sm text-white/50 font-condensed">
                      {mpPaymentId
                        ? "Verificando con MercadoPago..."
                        : "Esperando confirmación. Esta página se actualiza sola."}
                    </p>
                    {mpPaymentId && (
                      <p className="mt-1 text-xs text-white/25 font-mono">
                        Pago #{mpPaymentId}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-[#E60012]/20 bg-[#E60012]/10 px-4 py-2.5 text-xs text-[#E60012] font-condensed tracking-wide">
                    <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                    Puede tardar unos segundos
                  </div>
                </div>
                <div className="border-t border-white/5 px-6 py-4">
                  <Link href="/">
                    <button className="w-full h-10 rounded-xl border border-white/10 font-condensed text-xs tracking-widest uppercase text-white/40 hover:text-white/70 transition">
                      VOLVER AL INICIO
                    </button>
                  </Link>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Reserva no completada (venció / cancelada) ───────────────── */}
          {hasId && !error && isDead && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center"
            >
              <AlertCircle className="mx-auto h-10 w-10 text-white/30 mb-4" />
              <h2 className="font-racing tracking-wider text-white text-xl">RESERVA NO COMPLETADA</h2>
              <p className="mt-1.5 text-sm text-white/50 font-condensed leading-relaxed">
                {view?.status === "CANCELLED"
                  ? "Esta reserva fue cancelada."
                  : "El pago no se completó a tiempo y la reserva venció. Si te descontaron el dinero, escribinos — no hace falta que pagues de nuevo."}
              </p>
              <Link href="/reserva" className="mt-5 block">
                <button className="w-full h-11 rounded-xl bg-[#E60012] font-condensed font-bold tracking-widest uppercase text-sm text-white hover:bg-[#ff1a2b] transition">
                  HACER UNA NUEVA RESERVA
                </button>
              </Link>
            </motion.div>
          )}

          {/* ── Taking longer than expected ───────────────────────────── */}
          {hasId && !error && !isPaid && !isDead && timedOut && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <div className="rounded-2xl border border-white/10 bg-white/5">
                <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/5">
                    <Clock className="h-6 w-6 text-white/50" />
                  </div>
                  <div>
                    <h2 className="font-racing text-xl tracking-wider text-white">
                      ESTÁ TARDANDO UN POCO
                    </h2>
                    <p className="mt-1.5 text-sm text-white/50 font-condensed leading-relaxed">
                      Tu pago puede seguir procesándose. Si ya lo completaste, el
                      código de acceso te va a llegar por email en cuanto se
                      confirme — no hace falta que pagues de nuevo.
                    </p>
                    {mpPaymentId && (
                      <p className="mt-2 text-xs text-white/25 font-mono">
                        Pago #{mpPaymentId}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-white/25 font-mono">
                      {groupId ? `Grupo #${groupId.slice(0, 8)}` : `Reserva #${bookingId}`}
                    </p>
                  </div>
                </div>
                <div className="border-t border-white/5 px-6 py-4 space-y-2">
                  <button
                    onClick={() => {
                      setTimedOut(false);
                      poll();
                      // Re-armar la ventana: si no, tras un "revisar" volvía a
                      // quedar en el spinner sin caer nunca a "tardando".
                      if (timeoutRef.current) clearTimeout(timeoutRef.current);
                      timeoutRef.current = setTimeout(() => setTimedOut(true), PROCESSING_TIMEOUT_MS);
                    }}
                    className="w-full h-11 rounded-xl bg-[#E60012] hover:bg-[#ff1a2b] font-condensed font-bold tracking-widest uppercase text-sm text-white transition"
                  >
                    REVISAR DE NUEVO
                  </button>
                  <Link href="/">
                    <button className="w-full h-10 rounded-xl border border-white/10 font-condensed text-xs tracking-widest uppercase text-white/40 hover:text-white/70 transition">
                      VOLVER AL INICIO
                    </button>
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0A0A0C] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[#E60012]" />
        </div>
      }
    >
      <ConfirmationContent />
    </Suspense>
  );
}
