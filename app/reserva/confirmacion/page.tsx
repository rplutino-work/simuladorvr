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
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition">
            <ChevronLeft className="h-4 w-4" />
            Inicio
          </Link>
          <span className="flex items-center gap-1.5 font-semibold text-slate-900 text-sm">
            <Car className="h-4 w-4" />
            Simulador VR
          </span>
          <div className="w-16" />
        </div>
      </header>

      <div className="container mx-auto flex min-h-[calc(100vh-56px)] items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">

          {/* ── No bookingId ───────────────────────────────────────────── */}
          {!bookingId && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"
            >
              <AlertCircle className="mx-auto h-10 w-10 text-slate-300 mb-4" />
              <h2 className="font-semibold text-slate-900">Sin reserva</h2>
              <p className="mt-1 text-sm text-slate-500">No se encontró un ID de reserva.</p>
              <Link href="/reserva" className="mt-4 block">
                <Button className="w-full">Ir a reservar</Button>
              </Link>
            </motion.div>
          )}

          {/* ── Error ──────────────────────────────────────────────────── */}
          {bookingId && error && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center"
            >
              <AlertCircle className="mx-auto h-10 w-10 text-red-400 mb-4" />
              <h2 className="font-semibold text-red-900">Algo salió mal</h2>
              <p className="mt-1 text-sm text-red-700">{error}</p>
              <Link href="/reserva" className="mt-4 block">
                <Button variant="outline" className="w-full">Volver a reservar</Button>
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
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100"
                >
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </motion.div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="bg-slate-900 px-6 py-5 text-center">
                  <p className="text-xs uppercase tracking-widest text-slate-400 mb-2">
                    Código de acceso
                  </p>
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="font-mono text-4xl sm:text-5xl font-bold tracking-[0.3em] text-white"
                  >
                    {booking?.code}
                  </motion.p>
                </div>

                <div className="px-6 py-5 space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-400 mb-0.5">Simulador</p>
                      <p className="font-semibold text-slate-900 truncate">{booking?.puesto.name}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs text-slate-400 mb-0.5">Duración</p>
                      <p className="font-semibold text-slate-900">{booking?.duration} min</p>
                    </div>
                    {booking?.startTime && (
                      <div className="col-span-2 rounded-xl bg-slate-50 p-3">
                        <p className="text-xs text-slate-400 mb-0.5">Horario</p>
                        <p className="font-semibold text-slate-900">
                          {new Date(booking.startTime).toLocaleString("es-AR", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                    )}
                  </div>

                  {booking?.customerEmail && (
                    <p className="text-xs text-center text-slate-400">
                      Código enviado a {booking.customerEmail}
                    </p>
                  )}

                  <Button variant="outline" className="w-full" onClick={handleCopy}>
                    {copied
                      ? <><CheckCircle className="mr-2 h-4 w-4 text-green-600" /> ¡Copiado!</>
                      : <><Copy className="mr-2 h-4 w-4" /> Copiar código</>
                    }
                  </Button>

                  <div className="flex gap-2">
                    <Link href="/" className="flex-1">
                      <Button variant="ghost" className="w-full text-sm">Inicio</Button>
                    </Link>
                    <Link href="/reserva" className="flex-1">
                      <Button className="w-full text-sm">Nueva reserva</Button>
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Processing ────────────────────────────────────────────── */}
          {bookingId && !error && !isPaid && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col items-center gap-4 px-6 py-10">
                  <div className="relative flex h-16 w-16 items-center justify-center">
                    <div className="absolute inset-0 animate-ping rounded-full bg-amber-100 opacity-60" />
                    <div className="relative h-10 w-10 animate-spin rounded-full border-3 border-slate-200 border-t-slate-800" />
                  </div>
                  <div className="text-center">
                    <h2 className="font-semibold text-slate-900">Procesando pago...</h2>
                    <p className="mt-1.5 text-sm text-slate-500">
                      {mpPaymentId
                        ? "Verificando con MercadoPago..."
                        : "Esperando confirmación. Esta página se actualiza sola."}
                    </p>
                    {mpPaymentId && (
                      <p className="mt-1 text-xs text-slate-400 font-mono">
                        Pago #{mpPaymentId}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-700">
                    <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                    Puede tardar unos segundos
                  </div>
                </div>
                <div className="border-t border-slate-100 px-6 py-4">
                  <Link href="/">
                    <Button variant="ghost" className="w-full text-sm">Volver al inicio</Button>
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
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
        </div>
      }
    >
      <ConfirmationContent />
    </Suspense>
  );
}
