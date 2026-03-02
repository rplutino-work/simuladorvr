"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
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

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const bookingId  = searchParams.get("bookingId");
  const mpPaymentId = searchParams.get("payment_id") ?? searchParams.get("collection_id");
  const mpStatus    = searchParams.get("status") ?? searchParams.get("collection_status");

  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [copied, setCopied]   = useState(false);
  const verifiedRef = useRef(false);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchBooking() {
    if (!bookingId) return;
    const res = await fetch(`/api/bookings/${bookingId}`);
    if (res.ok) {
      const data: Booking = await res.json();
      setBooking(data);
      if ((data.status === "PAID" || data.status === "ACTIVE") && data.code) {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    } else {
      setError("Reserva no encontrada");
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

  useEffect(() => {
    if (!bookingId) return;
    fetchBooking();
    if (mpPaymentId && mpStatus === "approved") verifyWithMP();
    pollRef.current = setInterval(fetchBooking, 6_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  useEffect(() => {
    if (booking?.code && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [booking?.code]);

  function handleCopy() {
    if (booking?.code) {
      navigator.clipboard.writeText(booking.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }

  const isPaid = (booking?.status === "PAID" || booking?.status === "ACTIVE") && booking?.code;

  return (
    <div className="min-h-screen bg-[#0D0008]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#080C2E]/90 backdrop-blur-md">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition font-condensed tracking-wide">
            <ChevronLeft className="h-4 w-4" />
            INICIO
          </Link>
          <span className="flex items-center gap-2 font-racing tracking-widest text-white text-sm">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-[#E50014] text-white font-racing text-xs leading-none">V</span>
            SIMULADOR VR
          </span>
          <div className="w-16" />
        </div>
      </header>

      <div className="container mx-auto flex min-h-[calc(100vh-56px)] items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">

          {/* ── No bookingId ───────────────────────────────────────────── */}
          {!bookingId && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center"
            >
              <AlertCircle className="mx-auto h-10 w-10 text-white/30 mb-4" />
              <h2 className="font-racing tracking-wider text-white text-xl">SIN RESERVA</h2>
              <p className="mt-1 text-sm text-white/50">No se encontró un ID de reserva.</p>
              <Link href="/reserva" className="mt-5 block">
                <button className="w-full h-11 rounded-xl bg-[#E50014] font-condensed font-bold tracking-widest uppercase text-sm text-white hover:bg-[#ff1a2b] transition">
                  IR A RESERVAR
                </button>
              </Link>
            </motion.div>
          )}

          {/* ── Error ──────────────────────────────────────────────────── */}
          {bookingId && error && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-[#E50014]/30 bg-[#E50014]/10 p-8 text-center"
            >
              <AlertCircle className="mx-auto h-10 w-10 text-[#E50014] mb-4" />
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
          {bookingId && !error && isPaid && (
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
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-[#E50014]/20 border-2 border-[#E50014]/40"
                >
                  <CheckCircle className="h-8 w-8 text-[#E50014]" />
                </motion.div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
                {/* Code block */}
                <div className="bg-[#080C2E] border-b border-[#E50014]/30 px-6 py-6 text-center relative">
                  <div className="absolute inset-y-0 left-0 w-1 bg-[#E50014]" />
                  <p className="font-condensed text-xs font-semibold tracking-widest uppercase text-white/40 mb-2">
                    CÓDIGO DE ACCESO
                  </p>
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="font-racing text-5xl sm:text-6xl tracking-[0.3em] text-white drop-shadow-[0_0_20px_rgba(229,0,20,0.5)]"
                  >
                    {booking?.code}
                  </motion.p>
                </div>

                <div className="px-6 py-5 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <p className="font-condensed text-xs font-semibold tracking-widest uppercase text-white/30 mb-0.5">Simulador</p>
                      <p className="font-condensed font-bold text-white truncate">{booking?.puesto.name}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <p className="font-condensed text-xs font-semibold tracking-widest uppercase text-white/30 mb-0.5">Duración</p>
                      <p className="font-racing text-lg text-white tracking-wider">{booking?.duration} min</p>
                    </div>
                    {booking?.startTime && (
                      <div className="col-span-2 rounded-xl border border-white/10 bg-white/5 p-3">
                        <p className="font-condensed text-xs font-semibold tracking-widest uppercase text-white/30 mb-0.5">Horario</p>
                        <p className="font-condensed font-bold text-white">
                          {new Date(booking.startTime).toLocaleString("es-AR", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                    )}
                  </div>

                  {booking?.customerEmail && (
                    <p className="text-xs text-center font-condensed tracking-wide text-white/30">
                      Código enviado a {booking.customerEmail}
                    </p>
                  )}

                  <button
                    onClick={handleCopy}
                    className="w-full h-11 rounded-xl border border-white/20 hover:border-[#E50014]/50 font-condensed font-bold tracking-widest uppercase text-sm text-white/70 hover:text-white transition flex items-center justify-center gap-2"
                  >
                    {copied ? (
                      <><CheckCircle className="h-4 w-4 text-[#E50014]" /> COPIADO</>
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
                      <button className="w-full h-10 rounded-xl bg-[#E50014] hover:bg-[#ff1a2b] font-condensed font-bold text-xs tracking-widest uppercase text-white transition shadow-[0_0_12px_rgba(229,0,20,0.3)]">
                        NUEVA RESERVA
                      </button>
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Processing ────────────────────────────────────────────── */}
          {bookingId && !error && !isPaid && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <div className="rounded-2xl border border-white/10 bg-white/5">
                <div className="flex flex-col items-center gap-4 px-6 py-10">
                  <div className="relative flex h-16 w-16 items-center justify-center">
                    <div className="absolute inset-0 animate-ping rounded-full bg-[#E50014]/20" />
                    <div className="relative h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-[#E50014]" />
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
                  <div className="flex items-center gap-2 rounded-xl border border-[#E50014]/20 bg-[#E50014]/10 px-4 py-2.5 text-xs text-[#E50014] font-condensed tracking-wide">
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
        </div>
      </div>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0D0008] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-[#E50014]" />
        </div>
      }
    >
      <ConfirmationContent />
    </Suspense>
  );
}
