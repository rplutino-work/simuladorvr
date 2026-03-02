"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { CheckCircle, Copy, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  const bookingId = searchParams.get("bookingId");

  // MercadoPago appends these to the success redirect URL
  const mpPaymentId = searchParams.get("payment_id") ?? searchParams.get("collection_id");
  const mpStatus   = searchParams.get("status") ?? searchParams.get("collection_status");

  const [booking, setBooking]   = useState<Booking | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [copied, setCopied]     = useState(false);
  const verifiedRef             = useRef(false);
  const pollRef                 = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── fetch current booking state ──────────────────────────────────────────
  async function fetchBooking() {
    if (!bookingId) return;
    const res = await fetch(`/api/bookings/${bookingId}`);
    if (res.ok) {
      const data: Booking = await res.json();
      setBooking(data);
      // Stop polling once confirmed
      if ((data.status === "PAID" || data.status === "ACTIVE") && data.code) {
        if (pollRef.current) clearInterval(pollRef.current);
      }
    } else {
      setError("Reserva no encontrada");
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }

  // ── verify payment via MP API (uses payment_id from redirect URL) ─────────
  async function verifyWithMP() {
    if (!bookingId || !mpPaymentId || verifiedRef.current) return;
    verifiedRef.current = true;
    try {
      const res = await fetch(
        `/api/bookings/${bookingId}/verify-payment?paymentId=${mpPaymentId}`
      );
      if (res.ok) {
        const data: Booking = await res.json();
        setBooking(data);
        if ((data.status === "PAID" || data.status === "ACTIVE") && data.code) {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }
    } catch (err) {
      console.error("[confirm] verify-payment error:", err);
    }
  }

  useEffect(() => {
    if (!bookingId) return;

    // Initial fetch
    fetchBooking();

    // If MP returned with payment_id & approved status, verify immediately
    if (mpPaymentId && (mpStatus === "approved" || mpStatus === "approved")) {
      verifyWithMP();
    }

    // Poll every 6 seconds as fallback (webhook may arrive before verify-payment)
    pollRef.current = setInterval(fetchBooking, 6_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  // Stop polling when confirmed
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

  // ── no bookingId ──────────────────────────────────────────────────────────
  if (!bookingId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Sin reserva</CardTitle>
            <CardDescription>No se encontró ID de reserva.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/reserva"><Button className="w-full">Ir a reservar</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" /> Error
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/reserva"><Button className="w-full">Volver a reservar</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPaid = (booking?.status === "PAID" || booking?.status === "ACTIVE") && booking?.code;

  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="container mx-auto px-4">
        <Link href="/" className="mb-6 inline-block text-sm text-slate-600 hover:text-slate-900">
          ← Inicio
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-md"
        >
          <Card className="shadow-lg">
            {isPaid ? (
              // ── CONFIRMED ──────────────────────────────────────────────────
              <>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="h-5 w-5" />
                    ¡Reserva confirmada!
                  </CardTitle>
                  <CardDescription>
                    {booking?.customerEmail
                      ? `Se envió el código a ${booking.customerEmail}`
                      : "Guardá este código para acceder al simulador"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Big code display */}
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="rounded-2xl bg-slate-900 p-6 text-center"
                  >
                    <p className="text-xs uppercase tracking-widest text-slate-400 mb-2">
                      Código de acceso
                    </p>
                    <p className="font-mono text-4xl font-bold tracking-[0.3em] text-white">
                      {booking?.code}
                    </p>
                    <p className="mt-3 text-sm text-slate-400">
                      {booking?.puesto.name} · {booking?.duration} minutos
                    </p>
                    {booking?.startTime && (
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(booking.startTime).toLocaleString("es-AR", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    )}
                  </motion.div>

                  {/* Copy button */}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleCopy}
                  >
                    {copied ? (
                      <><CheckCircle className="mr-2 h-4 w-4 text-green-600" /> ¡Copiado!</>
                    ) : (
                      <><Copy className="mr-2 h-4 w-4" /> Copiar código</>
                    )}
                  </Button>

                  <div className="flex gap-2">
                    <Link href="/" className="flex-1">
                      <Button variant="outline" className="w-full">Volver al inicio</Button>
                    </Link>
                    <Link href="/reserva" className="flex-1">
                      <Button className="w-full">Nueva reserva</Button>
                    </Link>
                  </div>
                </CardContent>
              </>
            ) : (
              // ── PENDING / PROCESSING ───────────────────────────────────────
              <>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 animate-pulse text-amber-500" />
                    Procesando pago...
                  </CardTitle>
                  <CardDescription>
                    {mpPaymentId
                      ? "Verificando el pago con MercadoPago, un momento..."
                      : "Esperando confirmación. Esta página se actualiza sola."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center gap-4 py-8">
                    <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800" />
                    {mpPaymentId && (
                      <p className="text-xs text-slate-400 font-mono">
                        Pago #{mpPaymentId}
                      </p>
                    )}
                  </div>
                  <Link href="/">
                    <Button variant="outline" className="w-full">Volver al inicio</Button>
                  </Link>
                </CardContent>
              </>
            )}
          </Card>
        </motion.div>
      </div>
    </main>
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
