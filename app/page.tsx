"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Zap, Shield, Clock, Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "Inicio", href: "#top" },
  { label: "Cómo funciona", href: "#como-funciona" },
  { label: "Beneficios", href: "#beneficios" },
];

// ── Animation helpers ───────────────────────────────────────────────
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] },
});

const fadeIn = (delay = 0) => ({
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.6, delay },
});

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <main id="top" className="min-h-screen bg-[#0A0A0C] text-white overflow-x-hidden">

      {/* ── Header — floating glass bar ─────────────────────────────── */}
      <motion.header
        {...fadeIn(0)}
        className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-4 sm:pt-4"
      >
        <div className="container mx-auto">
          <div className="flex h-14 items-center justify-between rounded-2xl border border-white/10 bg-[#0E0E12]/80 px-3 shadow-[0_10px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:px-5">
            {/* Logo */}
            <Link href="/" className="flex shrink-0 items-center">
              <Image
                src="/race-room-logo.png"
                alt="Race Room"
                width={512}
                height={512}
                priority
                className="h-10 w-auto drop-shadow-[0_0_14px_rgba(230,0,18,0.45)]"
              />
            </Link>

            {/* Center nav (desktop) */}
            <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
              {NAV_LINKS.map((n) => (
                <a
                  key={n.href}
                  href={n.href}
                  className="group relative px-4 py-2 font-condensed text-xs font-semibold uppercase tracking-widest text-white/60 transition-colors hover:text-white"
                >
                  {n.label}
                  <span className="absolute inset-x-4 -bottom-0.5 h-px origin-left scale-x-0 bg-[#E60012] transition-transform duration-300 group-hover:scale-x-100" />
                </a>
              ))}
            </nav>

            {/* Right: CTA + mobile toggle */}
            <div className="flex items-center gap-2">
              <Link href="/reserva" className="hidden sm:block">
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  className="rounded-full bg-[#E60012] px-5 py-2.5 font-condensed text-xs font-bold uppercase tracking-widest text-white shadow-[0_0_18px_rgba(230,0,18,0.5)] transition-colors hover:bg-[#ff1a2b]"
                >
                  Reservar
                </motion.button>
              </Link>
              <button
                aria-label="Menú"
                onClick={() => setMenuOpen((v) => !v)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-white/80 transition-colors hover:bg-white/5 md:hidden"
              >
                {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Mobile menu */}
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#0E0E12]/95 p-2 backdrop-blur-xl md:hidden"
              >
                {NAV_LINKS.map((n) => (
                  <a
                    key={n.href}
                    href={n.href}
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-lg px-4 py-3 font-condensed text-sm font-semibold uppercase tracking-widest text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    {n.label}
                  </a>
                ))}
                <Link href="/reserva" onClick={() => setMenuOpen(false)} className="mt-1 block">
                  <div className="rounded-xl bg-[#E60012] px-5 py-3 text-center font-condensed text-xs font-bold uppercase tracking-widest text-white shadow-[0_0_18px_rgba(230,0,18,0.5)]">
                    Reservar
                  </div>
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.header>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Animated branded background — matches the neon logo, no stock photo */}
        <div className="absolute inset-0 z-0 overflow-hidden bg-[#0A0A0C]">
          {/* Pulsing red glow orbs */}
          <motion.div
            className="absolute -top-1/4 -left-1/4 h-[65vh] w-[65vh] rounded-full bg-[#E60012] blur-[130px]"
            animate={{ scale: [1, 1.18, 1], opacity: [0.18, 0.32, 0.18] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute -bottom-1/3 -right-1/4 h-[60vh] w-[60vh] rounded-full bg-[#E60012] blur-[140px]"
            animate={{ scale: [1.1, 1, 1.1], opacity: [0.12, 0.26, 0.12] }}
            transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
          />
          {/* Racing speed lines */}
          {[...Array(7)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-px bg-gradient-to-r from-transparent via-[#E60012] to-transparent"
              style={{ top: `${11 + i * 12}%`, left: 0, right: 0, opacity: 0.25 }}
              initial={{ x: "-100%" }}
              animate={{ x: "200%" }}
              transition={{ duration: 3.5 + i * 0.6, repeat: Infinity, delay: i * 0.4, ease: "linear" }}
            />
          ))}
          {/* Subtle tech grid */}
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
          {/* Vignette + fade to the page black */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0C]/30 via-transparent to-[#0A0A0C]" />
          <div
            className="absolute inset-0"
            style={{ background: "radial-gradient(ellipse at center, transparent 35%, #0A0A0C 100%)" }}
          />
        </div>

        {/* Hero content */}
        <div className="relative z-10 container mx-auto px-4 sm:px-6 pt-24 pb-16 text-center">

          {/* Category pill */}
          <motion.div {...fadeUp(0.2)}>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#E60012]/40 bg-[#E60012]/10 px-4 py-1.5 text-xs font-condensed font-semibold uppercase tracking-widest text-[#E60012] mb-6">
              <Zap className="h-3.5 w-3.5" />
              Simulador de Racing en VR
            </span>
          </motion.div>

          {/* Main title */}
          <motion.h1
            {...fadeUp(0.3)}
            className="font-racing text-6xl sm:text-7xl lg:text-9xl leading-none tracking-wider"
          >
            <span className="block text-white">VIVE LA</span>
            <span className="block text-[#E60012] drop-shadow-[0_0_30px_rgba(230,0,18,0.6)]">
              ADRENALINA
            </span>
            <span className="block text-white text-4xl sm:text-5xl lg:text-7xl mt-1">
              DEL RACING VIRTUAL
            </span>
          </motion.h1>

          {/* Divider bar */}
          <motion.div
            {...fadeIn(0.5)}
            className="mx-auto mt-6 mb-6 h-0.5 w-24 bg-[#E60012]"
          />

          <motion.p
            {...fadeUp(0.45)}
            className="font-barlow text-base sm:text-lg text-white/70 max-w-lg mx-auto leading-relaxed"
          >
            Elegí tu simulador, reservá tu turno y tomá el volante.
            Pago seguro con MercadoPago. Código de acceso instantáneo.
          </motion.p>

          {/* CTAs */}
          <motion.div
            {...fadeUp(0.55)}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link href="/reserva">
              <motion.button
                whileHover={{ scale: 1.04, boxShadow: "0 0 32px rgba(230,0,18,0.6)" }}
                whileTap={{ scale: 0.96 }}
                className="font-condensed font-bold tracking-widest uppercase text-sm bg-[#E60012] hover:bg-[#ff1a2b] text-white px-10 py-4 rounded flex items-center gap-2 shadow-[0_0_20px_rgba(230,0,18,0.4)] transition-colors w-full sm:w-auto justify-center"
              >
                RESERVAR AHORA
                <ChevronRight className="h-4 w-4" />
              </motion.button>
            </Link>
            <a href="#como-funciona">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="font-condensed font-semibold tracking-widest uppercase text-sm border border-white/30 hover:border-white/60 text-white/70 hover:text-white px-10 py-4 rounded transition w-full sm:w-auto justify-center flex items-center"
              >
                VER COMO FUNCIONA
              </motion.button>
            </a>
          </motion.div>

          {/* Scroll hint */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: [0, 8, 0] }}
            transition={{ delay: 1.2, duration: 2, repeat: Infinity }}
            className="mt-16 flex justify-center"
          >
            <div className="h-10 w-6 rounded-full border-2 border-white/20 flex justify-center pt-1.5">
              <div className="h-2 w-0.5 rounded-full bg-white/40" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Stats strip ─────────────────────────────────────────────── */}
      <section className="bg-[#E60012] py-4">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-3 divide-x divide-white/20">
            {[
              { value: "5", label: "SIMULADORES" },
              { value: "30–120", label: "MINUTOS" },
              { value: "100%", label: "INMERSIVO" },
            ].map((stat) => (
              <div key={stat.label} className="py-3 text-center">
                <p className="font-racing text-2xl sm:text-3xl tracking-widest text-white leading-none">
                  {stat.value}
                </p>
                <p className="font-condensed text-xs font-semibold tracking-widest uppercase text-white/80 mt-0.5">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Thin divider between stats and how-it-works ─────────────── */}
      <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* ── Cómo funciona ───────────────────────────────────────────── */}
      <section id="como-funciona" className="scroll-mt-24 bg-[#0A0A0C] py-16 sm:py-24">
        <div className="container mx-auto px-4 sm:px-6">

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <span className="inline-block font-condensed text-xs font-semibold tracking-widest uppercase text-[#E60012] mb-3">
              PROCESO
            </span>
            <h2 className="font-racing text-4xl sm:text-5xl lg:text-6xl tracking-wider text-white">
              CÓMO <span className="text-[#E60012]">FUNCIONA</span>
            </h2>
            <div className="mx-auto mt-4 h-0.5 w-16 bg-[#E60012]" />
          </motion.div>

          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-3 max-w-5xl mx-auto">
            {[
              {
                num: "01",
                title: "ELIGE TU SIMULADOR",
                desc: "Seleccioná el puesto disponible, la fecha y la duración de tu sesión — 30, 60 o 120 minutos.",
                color: "#E60012",
              },
              {
                num: "02",
                title: "PAGO SEGURO",
                desc: "Pagá con MercadoPago. Débito, crédito o efectivo. Proceso encriptado y seguro.",
                color: "#241016",
              },
              {
                num: "03",
                title: "A LA PISTA",
                desc: "Recibís un código único al instante. Presentalo al llegar y arrancá a correr.",
                color: "#E60012",
              },
            ].map((item, i) => (
              <motion.div
                key={item.num}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, duration: 0.5 }}
                whileHover={{ y: -4 }}
                className="relative rounded-xl border border-white/10 bg-white/5 p-6 sm:p-8 overflow-hidden group transition-all hover:border-white/20 hover:bg-white/8"
              >
                {/* Big background number */}
                <span
                  className="absolute right-4 top-3 font-racing text-7xl sm:text-8xl leading-none select-none opacity-10 group-hover:opacity-15 transition-opacity"
                  style={{ color: item.color }}
                >
                  {item.num}
                </span>
                {/* Left border accent */}
                <div
                  className="absolute inset-y-0 left-0 w-1 rounded-l-xl"
                  style={{ background: item.color }}
                />
                <div
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg mb-4 font-racing text-lg"
                  style={{ background: item.color + "22", color: item.color }}
                >
                  {item.num}
                </div>
                <h3 className="font-racing text-xl sm:text-2xl tracking-wider text-white mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-white/60 leading-relaxed font-barlow">
                  {item.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features row ────────────────────────────────────────────── */}
      <section id="beneficios" className="scroll-mt-24 bg-[#0A0A0C] border-t border-white/5 py-12">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              {
                icon: Zap,
                title: "Respuesta inmediata",
                desc: "Tu código llega por email al instante después del pago.",
                color: "#E60012",
              },
              {
                icon: Shield,
                title: "Pago protegido",
                desc: "MercadoPago con encriptado SSL. Sin riesgos.",
                color: "#241016",
              },
              {
                icon: Clock,
                title: "Reserva flexible",
                desc: "Cancelá o reprogramá tu turno con anticipación.",
                color: "#E60012",
              },
            ].map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="flex items-start gap-4"
              >
                <div
                  className="shrink-0 flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ background: f.color + "20" }}
                >
                  <f.icon className="h-5 w-5" style={{ color: f.color }} />
                </div>
                <div>
                  <h4 className="font-condensed font-bold text-sm tracking-wide uppercase text-white mb-1">
                    {f.title}
                  </h4>
                  <p className="text-xs text-white/50 leading-relaxed">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-16 sm:py-20">
        {/* Background */}
        <div className="absolute inset-0 z-0">
          <Image
            src="https://images.unsplash.com/photo-1504707748692-419802cf939d?auto=format&fit=crop&w=1920&q=80"
            alt="Racing atmosphere"
            fill
            className="object-cover object-center opacity-20"
            unoptimized
          />
          <div className="absolute inset-0 bg-[#E60012]" style={{ opacity: 0.92 }} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative z-10 container mx-auto px-4 text-center"
        >
          <p className="font-condensed text-xs font-semibold tracking-widest uppercase text-white/70 mb-3">
            LUGARES LIMITADOS
          </p>
          <h2 className="font-racing text-4xl sm:text-5xl lg:text-6xl tracking-wider text-white mb-4">
            ¿LISTO PARA LA PISTA?
          </h2>
          <p className="font-barlow text-white/80 text-base mb-8 max-w-md mx-auto">
            Turnos disponibles hoy. Reservá en menos de 2 minutos.
          </p>
          <Link href="/reserva">
            <motion.button
              whileHover={{ scale: 1.05, backgroundColor: "#0A0A0C" }}
              whileTap={{ scale: 0.96 }}
              className="font-condensed font-bold tracking-widest uppercase text-sm bg-[#0A0A0C] text-white px-12 py-4 rounded transition-colors inline-flex items-center gap-2"
            >
              VER DISPONIBILIDAD
              <ChevronRight className="h-4 w-4" />
            </motion.button>
          </Link>
        </motion.div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="bg-[#0A0A0C] border-t border-white/10 py-8">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/race-room-logo.png"
              alt="Race Room"
              width={512}
              height={512}
              className="h-9 w-auto"
            />
          </Link>
          <p className="font-barlow text-white/30 text-xs">
            © {new Date().getFullYear()} Race Room · Todos los derechos reservados
          </p>
        </div>
      </footer>
    </main>
  );
}
