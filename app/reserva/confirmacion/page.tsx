"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { usePolling } from "@/hooks/use-polling";
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
  puesto: { name: string };
};

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get("bookingId");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchBooking = async () => {
    if (!bookingId) return;
    const res = await fetch(`/api/bookings/${bookingId}`);
    if (res.ok) {
      const data = await res.json();
      setBooking(data);
    } else {
      setError("Reserva no encontrada");
    }
  };

  usePolling(fetchBooking, 10_000, !!bookingId && !booking?.code);

  useEffect(() => {
    if (bookingId) fetchBooking();
  }, [bookingId]);

  if (!bookingId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Sin reserva</CardTitle>
            <CardDescription>
              No se encontró un ID de reserva. Vuelve a intentar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/reserva">
              <Button>Ir a reservar</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/reserva">
              <Button>Volver a reservar</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPaid = booking?.status === "PAID" && booking?.code;

  return (
    <main className="min-h-screen bg-slate-50 py-12">
      <div className="container mx-auto px-4">
        <Link
          href="/"
          className="mb-6 inline-block text-sm text-slate-600 hover:text-slate-900"
        >
          ← Inicio
        </Link>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-md"
        >
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>
                {isPaid ? "¡Reserva confirmada!" : "Procesando pago..."}
              </CardTitle>
              <CardDescription>
                {isPaid
                  ? "Tu código ha sido enviado por email"
                  : "Esperando confirmación de MercadoPago. Esta página se actualiza automáticamente."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isPaid && booking && (
                <div className="rounded-xl bg-slate-100 p-6 text-center">
                  <p className="text-sm text-slate-600">Tu código de acceso</p>
                  <p className="mt-2 font-mono text-3xl font-bold tracking-[0.3em] text-slate-900">
                    {booking.code}
                  </p>
                  <p className="mt-4 text-sm text-slate-600">
                    {booking.puesto.name} • {booking.duration} minutos
                  </p>
                </div>
              )}
              {!isPaid && (
                <div className="flex justify-center py-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
                </div>
              )}
              <div className="mt-6 flex gap-2">
                <Link href="/" className="flex-1">
                  <Button variant="outline" className="w-full">
                    Volver al inicio
                  </Button>
                </Link>
                {isPaid && (
                  <Link href="/reserva" className="flex-1">
                    <Button className="w-full">Nueva reserva</Button>
                  </Link>
                )}
              </div>
            </CardContent>
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
