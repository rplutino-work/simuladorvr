"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Car, CreditCard, Ticket, ChevronRight, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-sm sticky top-0 z-20">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="container mx-auto flex h-14 sm:h-16 items-center justify-between px-4"
        >
          <span className="flex items-center gap-2 text-lg sm:text-xl font-bold text-slate-900">
            <motion.span
              animate={{ rotate: [0, -6, 6, 0] }}
              transition={{ repeat: Infinity, duration: 3, repeatDelay: 2 }}
            >
              <Car className="h-5 w-5 sm:h-6 sm:w-6 text-slate-700" />
            </motion.span>
            Simulador VR
          </span>
          <Link href="/admin/login">
            <Button variant="ghost" size="sm" className="text-sm">
              Admin
            </Button>
          </Link>
        </motion.div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="container mx-auto px-4 py-14 sm:py-20 lg:py-28">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-3xl text-center"
        >
          {/* Animated car icon */}
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className="mb-6 sm:mb-8 inline-flex rounded-2xl bg-slate-100 p-5 sm:p-6"
          >
            <motion.div
              animate={{ y: [0, -7, 0] }}
              transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
            >
              <Car className="h-14 w-14 sm:h-20 sm:w-20 text-slate-700" strokeWidth={1.5} />
            </motion.div>
          </motion.div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
            Vive la emoción del
            <span className="block bg-gradient-to-r from-slate-600 to-slate-900 bg-clip-text text-transparent mt-1">
              racing en realidad virtual
            </span>
          </h1>
          <p className="mt-4 sm:mt-6 text-base sm:text-lg text-slate-600 max-w-xl mx-auto">
            Reserva tu sesión, elige tu puesto y prepárate para la adrenalina.
            Pago seguro con MercadoPago.
          </p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              <Link href="/reserva">
                <Button size="lg" className="w-full sm:w-auto px-8 shadow-lg text-base h-12">
                  Reservar ahora
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </motion.div>
          </motion.div>

          {/* Social proof */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-6 flex items-center justify-center gap-1.5 text-sm text-slate-500"
          >
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            ))}
            <span className="ml-1">La experiencia de racing más realista</span>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Cómo funciona ─────────────────────────────────────────────────── */}
      <section className="border-t border-slate-200 bg-white py-14 sm:py-20">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-widest text-slate-500 mb-3">
              Proceso
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
              Cómo funciona
            </h2>
          </motion.div>

          <div className="mx-auto mt-10 sm:mt-12 grid max-w-4xl gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-3">
            {[
              {
                step: "01",
                icon: Car,
                title: "Elige tu simulador",
                desc: "Selecciona el puesto disponible, la fecha y la duración de tu sesión.",
              },
              {
                step: "02",
                icon: CreditCard,
                title: "Paga de forma segura",
                desc: "Completa el pago con MercadoPago. Débito, crédito o efectivo.",
              },
              {
                step: "03",
                icon: Ticket,
                title: "Presenta tu código",
                desc: "Recibirás un código único. Muéstralo al llegar y a correr.",
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                whileHover={{ y: -3 }}
                className="relative rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="absolute right-4 top-4 text-3xl font-black text-slate-100 select-none">
                  {item.step}
                </span>
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
                  <item.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ────────────────────────────────────────────────────── */}
      <section className="border-t border-slate-200 bg-slate-900 py-12 sm:py-16">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="container mx-auto px-4 text-center"
        >
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            ¿Listo para la experiencia?
          </h2>
          <p className="mt-3 text-slate-400">
            Turnos disponibles hoy. Reserva en menos de 2 minutos.
          </p>
          <motion.div
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="mt-6"
          >
            <Link href="/reserva">
              <Button
                variant="outline"
                size="lg"
                className="border-white text-white hover:bg-white hover:text-slate-900 h-12 px-8"
              >
                Ver disponibilidad
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <Car className="h-4 w-4" />
            <span className="font-medium text-slate-700">Simulador VR</span>
          </div>
          <p>© {new Date().getFullYear()} · Todos los derechos reservados</p>
          <Link href="/admin/login" className="hover:text-slate-700 transition">
            Acceso admin
          </Link>
        </div>
      </footer>
    </main>
  );
}
