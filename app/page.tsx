"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Car, CreditCard, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="container mx-auto flex h-16 items-center justify-between px-4"
        >
          <span className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <motion.span
              animate={{ rotate: [0, -5, 5, 0] }}
              transition={{ repeat: Infinity, duration: 3, repeatDelay: 2 }}
            >
              <Car className="h-6 w-6 text-slate-700" />
            </motion.span>
            Simulador VR
          </span>
          <Link href="/admin/login">
            <Button variant="ghost">Panel admin</Button>
          </Link>
        </motion.div>
      </header>

      <section className="container mx-auto px-4 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-3xl text-center"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mb-8 inline-flex rounded-2xl bg-slate-100 p-6"
          >
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
            >
              <Car className="h-20 w-20 text-slate-700" strokeWidth={1.5} />
            </motion.div>
          </motion.div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Vive la emoción del
            <span className="block bg-gradient-to-r from-slate-700 to-slate-900 bg-clip-text text-transparent">
              racing en realidad virtual
            </span>
          </h1>
          <p className="mt-6 text-lg text-slate-600">
            Reserva tu sesión en nuestro simulador de carreras. Elige tu puesto,
            la duración y prepárate para la adrenalina.
          </p>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="mt-10"
          >
            <Link href="/reserva">
              <Button size="lg" className="shadow-lg">
                Reservar ahora
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </section>

      <section className="border-t border-slate-200 bg-white py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-center text-2xl font-semibold text-slate-900">
            Cómo funciona
          </h2>
          <div className="mx-auto mt-12 grid max-w-4xl gap-8 sm:grid-cols-3">
            {[
              {
                step: "1",
                icon: Car,
                title: "Elige tu simulador",
                desc: "Selecciona el puesto disponible y la duración (30, 60 o 120 minutos).",
              },
              {
                step: "2",
                icon: CreditCard,
                title: "Paga online",
                desc: "Completa el pago con MercadoPago de forma segura.",
              },
              {
                step: "3",
                icon: Ticket,
                title: "Presenta tu código",
                desc: "Recibirás un código por email. Preséntalo al llegar y disfruta.",
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                whileHover={{ y: -4 }}
                className="rounded-xl border border-slate-200 bg-slate-50/50 p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white">
                  <item.icon className="h-6 w-6" />
                </span>
                <h3 className="mt-4 font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-50 py-16">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="container mx-auto px-4 text-center"
        >
          <p className="text-slate-600">
            ¿Listo para la experiencia?
          </p>
          <motion.span whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
            <Link href="/reserva">
              <Button className="mt-4" variant="outline">
                Ir a reservar
              </Button>
            </Link>
          </motion.span>
        </motion.div>
      </section>
    </main>
  );
}
