"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import QRCode from "react-qr-code";
import { useAutoReload } from "@/lib/use-auto-reload";

// ─── Types ─────────────────────────────────────────────────────────────────

type State =
  | "screensaver"
  | "choose_duration"    // direct-purchase: pick 30/60/120
  | "direct_loading"     // creating MP preference
  | "direct_qr"          // show QR, 1-min countdown
  | "direct_confirm_cancel" // confirm before cancelling the pending payment
  | "direct_waiting"     // payment being confirmed
  | "input"
  | "validating"
  | "error"
  | "active"
  | "warning"        // < 5 min remaining
  | "confirm_finish" // confirm manual finish during active session
  | "extend_options"
  | "extend_qr"
  | "extend_confirm_cancel" // confirm before abandoning the extension QR
  | "extend_waiting"
  | "finished";

type Session = {
  bookingId: string;
  code: string | null;
  customerName: string | null;
  endTime: string;
  duration: number;
  puestoName: string;
};

type DirectOption = {
  requested: 30 | 60 | 120;
  fullPriceCents: number;      // Always present — the tier's reference price
  actualMinutes: number;       // 0 when unavailable
  priceCents: number;          // 0 when unavailable (pro-rata if partial)
  available: boolean;
  partial?: boolean;
  ceilingTime?: string | null;
  reason?: string;
};

const EXTEND_OPTIONS = [30, 60, 120] as const;
const WARNING_MS = 5 * 60 * 1000;   // 5 minutes
const POLL_INTERVAL_MS = 4000;
const SCREENSAVER_RETURN_MS = 8000; // after session ends
const DIRECT_QR_TIMEOUT_MS = 60 * 1000; // 1 min window to pay

// ─── Countdown formatting ───────────────────────────────────────────────────
function fmtCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─── Racing particle line (screensaver) ────────────────────────────────────
function RacingLines() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-px bg-gradient-to-r from-transparent via-[#CC1E4A] to-transparent opacity-40"
          style={{ top: `${15 + i * 14}%`, left: 0, right: 0 }}
          initial={{ x: "-100%" }}
          animate={{ x: "200%" }}
          transition={{
            duration: 3 + i * 0.7,
            repeat: Infinity,
            delay: i * 0.5,
            ease: "easeInOut",
          }}
        />
      ))}
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={`b${i}`}
          className="absolute h-0.5 bg-gradient-to-r from-transparent via-white to-transparent opacity-15"
          style={{ top: `${30 + i * 20}%`, left: 0, right: 0 }}
          initial={{ x: "-100%" }}
          animate={{ x: "200%" }}
          transition={{
            duration: 5 + i,
            repeat: Infinity,
            delay: 1.5 + i * 0.8,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
}

// ─── Circular progress ring ─────────────────────────────────────────────────
function ProgressRing({ pct, warning }: { pct: number; warning: boolean }) {
  const r = 130;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.max(0, Math.min(1, pct));
  return (
    <svg width="300" height="300" className="absolute" style={{ top: -10, left: -10 }}>
      {/* Track */}
      <circle cx="150" cy="150" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
      {/* Progress */}
      <motion.circle
        cx="150"
        cy="150"
        r={r}
        fill="none"
        stroke={warning ? "#CC1E4A" : "#CC1E4A"}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        transform="rotate(-90 150 150)"
        initial={false}
        animate={{
          stroke: warning ? ["#CC1E4A", "#ff6b6b", "#CC1E4A"] : "#CC1E4A",
          strokeDasharray: `${dash} ${circ}`,
        }}
        transition={warning ? { stroke: { duration: 0.8, repeat: Infinity } } : { duration: 0.5 }}
      />
    </svg>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function TabletPage() {
  useAutoReload();
  const params = useParams();
  const puestoId = params?.puestoId as string;

  const [state, setState] = useState<State>("screensaver");
  const [codeInput, setCodeInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [totalMs, setTotalMs] = useState(0);
  const [extendUrl, setExtendUrl] = useState("");
  const [extendAmount, setExtendAmount] = useState(0);
  const [extendMinutes, setExtendMinutes] = useState(0);
  // Direct-purchase flow
  const [directOptions, setDirectOptions] = useState<DirectOption[]>([]);
  const [directBookingId, setDirectBookingId] = useState<string | null>(null);
  const [directUrl, setDirectUrl] = useState("");
  const [directSelection, setDirectSelection] = useState<DirectOption | null>(null);
  const [directSecondsLeft, setDirectSecondsLeft] = useState(DIRECT_QR_TIMEOUT_MS / 1000);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const screensaverRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const directTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const directPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Countdown tick ──────────────────────────────────────────────────────
  const startCountdown = useCallback((endTimeIso: string, durationMinutes: number) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    const totalSessionMs = durationMinutes * 60 * 1000;
    setTotalMs(totalSessionMs);

    const tick = () => {
      const ms = Math.max(0, new Date(endTimeIso).getTime() - Date.now());
      setRemainingMs(ms);
      if (ms <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
      }
    };
    tick();
    countdownRef.current = setInterval(tick, 500);
  }, []);

  // ── Update endTime from server ──────────────────────────────────────────
  const updateEndTime = useCallback((newEndTimeIso: string) => {
    setSession((prev) => prev ? { ...prev, endTime: newEndTimeIso } : prev);
    startCountdown(newEndTimeIso, session?.duration ?? 60);
  }, [session?.duration, startCountdown]);

  // ── Auto-submit code as soon as 4 chars are entered ─────────────────────
  useEffect(() => {
    if (state === "input" && codeInput.length === 4) {
      handleActivate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeInput, state]);

  // ── Auto-finish when time runs out ──────────────────────────────────────
  useEffect(() => {
    // Also auto-finish if the customer is staring at the finish-confirmation
    // modal when their time runs out — otherwise the session would just hang.
    if (
      (state === "active" || state === "warning" || state === "confirm_finish") &&
      remainingMs === 0
    ) {
      handleAutoFinish();
    }
    if ((state === "active" || state === "warning") && remainingMs <= WARNING_MS && remainingMs > 0) {
      setState("warning");
    } else if (state === "warning" && remainingMs > WARNING_MS) {
      setState("active");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs]);

  // ── Poll server for session status while active ─────────────────────────
  useEffect(() => {
    if (!["active", "warning", "extend_waiting"].includes(state)) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/tablet/${puestoId}/status`);
        const data = await res.json();
        if (!data.session) return;

        // Extension detected (endTime changed)
        if (session && data.session.endTime !== session.endTime) {
          updateEndTime(data.session.endTime);
          if (state === "extend_waiting") {
            setState(data.session.remainingMs <= WARNING_MS ? "warning" : "active");
          }
        }

        setRemainingMs(data.session.remainingMs);
      } catch {
        // network error — ignore, keep counting down locally
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, puestoId]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (screensaverRef.current) clearTimeout(screensaverRef.current);
      if (directTimerRef.current) clearInterval(directTimerRef.current);
      if (directPollRef.current) clearInterval(directPollRef.current);
    };
  }, []);


  // ── On mount: check if there's already an active session ───────────────
  useEffect(() => {
    if (!puestoId) return;
    fetch(`/api/tablet/${puestoId}/status`)
      .then((r) => r.json())
      .then((data) => {
        if (data.session) {
          setSession(data.session);
          startCountdown(data.session.endTime, data.session.duration);
          setTotalMs(data.session.duration * 60 * 1000);
          setState(data.session.remainingMs <= WARNING_MS ? "warning" : "active");
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puestoId]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function stopDirectTimers() {
    if (directTimerRef.current) {
      clearInterval(directTimerRef.current);
      directTimerRef.current = null;
    }
    if (directPollRef.current) {
      clearInterval(directPollRef.current);
      directPollRef.current = null;
    }
  }

  function handleGoCodeFlow() {
    setCodeInput("");
    setErrorMsg("");
    setState("input");
  }

  async function handleGoDirectFlow() {
    setErrorMsg("");
    setState("choose_duration");
    try {
      const res = await fetch(`/api/tablet/${puestoId}/direct-options`);
      const data = await res.json();
      setDirectOptions(data.options ?? []);
    } catch {
      setDirectOptions([]);
      setErrorMsg("No se pudieron cargar las opciones. Verificá el Wi-Fi.");
      setState("error");
    }
  }

  async function handleSelectDirectOption(opt: DirectOption) {
    if (!opt.available) return;
    setDirectSelection(opt);
    setState("direct_loading");
    try {
      const res = await fetch(`/api/tablet/${puestoId}/direct-purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: opt.requested, actualMinutes: opt.actualMinutes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Error al crear el pago");
        setState("error");
        return;
      }
      const isSandbox = process.env.NEXT_PUBLIC_MERCADOPAGO_SANDBOX === "true";
      const url = isSandbox ? (data.sandboxInitPoint ?? data.initPoint) : data.initPoint;
      setDirectUrl(url);
      setDirectBookingId(data.bookingId);
      setDirectSecondsLeft(DIRECT_QR_TIMEOUT_MS / 1000);
      setState("direct_qr");

      // 1-min countdown until auto-cancel
      directTimerRef.current = setInterval(() => {
        setDirectSecondsLeft((s) => {
          if (s <= 1) {
            handleDirectTimeout();
            return 0;
          }
          return s - 1;
        });
      }, 1000);

      // Poll session status — when payment confirmed, webhook activates session
      directPollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/tablet/${puestoId}/status`);
          const d = await r.json();
          if (d.session) {
            stopDirectTimers();
            setDirectUrl("");
            setDirectBookingId(null);
            setDirectSelection(null);
            setSession(d.session);
            setTotalMs(d.session.duration * 60 * 1000);
            startCountdown(d.session.endTime, d.session.duration);
            setState(d.session.remainingMs <= WARNING_MS ? "warning" : "active");
          }
        } catch {
          // network flap, keep trying
        }
      }, 3000);
    } catch {
      setErrorMsg("Error de conexión al crear el pago.");
      setState("error");
    }
  }

  async function cancelDirectBooking() {
    if (!directBookingId) return;
    try {
      await fetch("/api/tablet/direct-cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: directBookingId }),
      });
    } catch { /* ignore */ }
  }

  async function handleDirectTimeout() {
    stopDirectTimers();
    await cancelDirectBooking();
    setDirectBookingId(null);
    setDirectUrl("");
    setDirectSelection(null);
    // Return to options so the customer can choose again
    handleGoDirectFlow();
  }

  function handleRequestCancelDirect() {
    setState("direct_confirm_cancel");
  }

  function handleAbandonCancelDirect() {
    setState("direct_qr");
  }

  async function handleConfirmCancelDirect() {
    stopDirectTimers();
    await cancelDirectBooking();
    setDirectBookingId(null);
    setDirectUrl("");
    setDirectSelection(null);
    setState("screensaver");
  }

  async function handleBackFromChooseDuration() {
    setDirectOptions([]);
    setState("screensaver");
  }

  function handleBackFromInput() {
    setCodeInput("");
    setErrorMsg("");
    setState("screensaver");
  }

  function hapticTap() {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(12);
    }
  }

  function handleKeyPress(key: string) {
    if (codeInput.length >= 4) return;
    hapticTap();
    setCodeInput((p) => p + key);
  }

  function handleDeleteKey() {
    if (codeInput.length === 0) return;
    hapticTap();
    setCodeInput((p) => p.slice(0, -1));
  }

  async function handleActivate() {
    const trimmed = codeInput.trim().toUpperCase();
    if (trimmed.length !== 4) {
      setErrorMsg("El código debe tener 4 caracteres");
      return;
    }
    setState("validating");
    try {
      const res = await fetch("/api/tablet/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed, puestoId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Error al validar");
        setState("error");
        return;
      }
      const endTime = data.endTime;
      const duration = data.duration ?? 30;
      setSession(data);
      setTotalMs(duration * 60 * 1000);
      startCountdown(endTime, duration);
      setState("active");
    } catch (err) {
      console.error("[tablet] activate error:", err);
      setErrorMsg("Error de conexión. Verificá el Wi-Fi.");
      setState("error");
    }
  }

  async function handleAutoFinish() {
    if (!session) return;
    try {
      await fetch("/api/tablet/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: session.bookingId, puestoId }),
      });
    } catch { /* ignore */ }
    setState("finished");
    screensaverRef.current = setTimeout(() => {
      setSession(null);
      setCodeInput("");
      setState("screensaver");
    }, SCREENSAVER_RETURN_MS);
  }

  // Manual finish needs confirmation — destructive + the customer already paid.
  function handleRequestFinish() {
    if (!session) return;
    setState("confirm_finish");
  }

  function handleAbandonFinish() {
    // Return to whichever state matches the remaining time
    setState(remainingMs <= WARNING_MS ? "warning" : "active");
  }

  async function handleConfirmFinish() {
    if (!session) return;
    setState("validating");
    try {
      await fetch("/api/tablet/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: session.bookingId, puestoId }),
      });
    } catch { /* ignore */ }
    setState("finished");
    screensaverRef.current = setTimeout(() => {
      setSession(null);
      setCodeInput("");
      setState("screensaver");
    }, SCREENSAVER_RETURN_MS);
  }

  async function handleExtendSelect(minutes: 30 | 60 | 120) {
    if (!session) return;
    setState("validating");
    try {
      const res = await fetch("/api/tablet/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: session.bookingId,
          additionalMinutes: minutes,
          puestoId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Error al crear el pago");
        setState("error");
        return;
      }
      const isSandbox = process.env.NEXT_PUBLIC_MERCADOPAGO_SANDBOX === "true";
      const url = isSandbox ? (data.sandboxInitPoint ?? data.initPoint) : data.initPoint;
      setExtendUrl(url);
      setExtendAmount(data.amount);
      setExtendMinutes(minutes);
      setState("extend_qr");
    } catch {
      setErrorMsg("Error de conexión al crear el pago.");
      setState("error");
    }
  }

  function handleExtendWait() {
    setState("extend_waiting");
  }

  function handleRequestCancelExtend() {
    setState("extend_confirm_cancel");
  }

  function handleAbandonCancelExtend() {
    setState("extend_qr");
  }

  function handleCancelExtend() {
    setState(remainingMs <= WARNING_MS ? "warning" : "active");
    setExtendUrl("");
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  const progressPct = totalMs > 0 ? remainingMs / totalMs : 1;
  const isWarning = state === "warning";

  return (
    <div
      className={`fixed inset-0 overflow-hidden select-none ${
        isWarning ? "bg-[#2A0915]" : "bg-[#121F45]"
      } transition-colors duration-1000`}
      style={{ WebkitUserSelect: "none" }}
    >
      <AnimatePresence mode="wait">

        {/* ── SCREENSAVER ─────────────────────────────────────────────── */}
        {state === "screensaver" && (
          <motion.div
            key="screensaver"
            className="absolute inset-0 flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.6 }}
          >
            <RacingLines />
            <div className="relative z-10 flex flex-col items-center gap-6 px-6 w-full">
              {/* Logo — Race Room official */}
              <motion.div
                animate={{ scale: [1, 1.03, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="w-full max-w-md sm:max-w-lg"
              >
                <Image
                  src="/race-room-logo.png"
                  alt="Race Room"
                  width={839}
                  height={306}
                  priority
                  className="w-full h-auto drop-shadow-[0_0_60px_rgba(204,30,74,0.35)]"
                />
              </motion.div>

              {/* Puesto name */}
              <p className="font-condensed text-base tracking-[0.4em] uppercase text-white/60">
                {puestoId.replace(/-/g, " ").toUpperCase()}
              </p>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-4 w-full max-w-3xl mt-2">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleGoDirectFlow}
                  className="flex-1 py-7 rounded-2xl bg-[#CC1E4A] hover:bg-[#e1224f] text-white font-racing text-2xl sm:text-3xl tracking-[0.25em] uppercase shadow-[0_0_40px_rgba(204,30,74,0.5)] transition-colors"
                >
                  🏁 Jugar ahora
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleGoCodeFlow}
                  className="flex-1 py-7 rounded-2xl border-2 border-[#FFC906]/50 bg-[#223971]/30 hover:bg-[#223971]/50 text-white font-racing text-2xl sm:text-3xl tracking-[0.25em] uppercase transition-colors"
                >
                  Ya tengo código
                </motion.button>
              </div>
              <p className="font-condensed text-sm tracking-widest uppercase text-white/40 mt-1 text-center">
                Pagá con MercadoPago o ingresá el código que recibiste por email
              </p>
            </div>
          </motion.div>
        )}

        {/* ── CHOOSE DURATION (direct flow) ────────────────────────────── */}
        {state === "choose_duration" && (
          <motion.div
            key="choose_duration"
            className="absolute inset-0 flex flex-col items-center justify-center px-6 py-4 overflow-y-auto"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.35 }}
          >
            <RacingLines />
            <div className="relative z-10 w-full max-w-5xl my-auto">
              <div className="text-center mb-6">
                <h2 className="font-racing text-4xl sm:text-5xl tracking-widest text-white mb-2">
                  ELEGÍ TU SESIÓN
                </h2>
                <p className="font-condensed text-base tracking-widest uppercase text-white/50">
                  El tiempo empieza cuando se confirma el pago
                </p>
              </div>

              {directOptions.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-10 h-10 border-4 border-[#CC1E4A] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-8">
                  {directOptions.map((opt) => {
                    const fmtPrice = (cents: number) =>
                      (cents / 100).toLocaleString("es-AR", {
                        style: "currency",
                        currency: "ARS",
                        maximumFractionDigits: 0,
                      });
                    const fullPriceStr = fmtPrice(opt.fullPriceCents);
                    const partialPriceStr = opt.available && opt.partial ? fmtPrice(opt.priceCents) : null;
                    const ceilingHm = opt.ceilingTime
                      ? new Date(opt.ceilingTime).toLocaleTimeString("es-AR", {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "America/Argentina/Buenos_Aires",
                        })
                      : null;

                    return (
                      <motion.button
                        key={opt.requested}
                        whileTap={opt.available ? { scale: 0.97 } : undefined}
                        disabled={!opt.available}
                        onClick={() => handleSelectDirectOption(opt)}
                        className={`relative flex flex-col items-center justify-center rounded-2xl border-2 py-8 px-5 transition-all ${
                          opt.available
                            ? "border-white/15 bg-white/5 hover:border-[#CC1E4A]/70 hover:bg-[#CC1E4A]/10 cursor-pointer"
                            : "border-white/5 bg-white/[0.02] cursor-not-allowed opacity-50"
                        }`}
                      >
                        {opt.partial && opt.available && (
                          <span className="absolute top-3 right-3 text-[11px] tracking-widest font-condensed font-semibold uppercase px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
                            Parcial
                          </span>
                        )}

                        {/* Tier header — always shows the tier in minutes + reference full price */}
                        <span className="font-racing text-6xl sm:text-7xl text-white leading-none">
                          {opt.requested}
                        </span>
                        <span className="font-condensed text-sm tracking-widest uppercase text-white/60 mt-1">
                          minutos
                        </span>
                        <span className="font-racing text-3xl sm:text-4xl text-[#CC1E4A] mt-5">
                          {fullPriceStr}
                        </span>

                        {/* Partial detail — shows only when available AND partial */}
                        {opt.available && opt.partial && (
                          <div className="mt-4 pt-4 border-t border-white/10 w-full text-center">
                            <span className="block font-condensed text-xs tracking-widest uppercase text-white/50">
                              Ahora solo entran
                            </span>
                            <span className="block font-racing text-2xl text-white mt-1">
                              {opt.actualMinutes} min · {partialPriceStr}
                            </span>
                            {ceilingHm && (
                              <span className="block font-condensed text-xs tracking-widest uppercase text-white/40 mt-1">
                                Hasta las {ceilingHm}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Unavailable reason */}
                        {!opt.available && (
                          <div className="mt-6 pt-6 border-t border-white/10 w-full text-center">
                            <span className="block font-condensed text-sm tracking-widest uppercase text-white/40">
                              {opt.reason ?? "No disponible"}
                            </span>
                          </div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-center">
                <button
                  onClick={handleBackFromChooseDuration}
                  className="py-4 px-10 rounded-xl border border-white/15 text-white/70 font-condensed text-base tracking-widest uppercase hover:bg-white/5 hover:text-white transition"
                >
                  ← Volver
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── DIRECT LOADING (creating MP preference) ──────────────────── */}
        {state === "direct_loading" && (
          <motion.div
            key="direct_loading"
            className="absolute inset-0 flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="w-14 h-14 border-4 border-[#CC1E4A] border-t-transparent rounded-full animate-spin mb-6" />
            <p className="font-condensed text-sm tracking-widest uppercase text-white/50">
              Generando link de pago…
            </p>
          </motion.div>
        )}

        {/* ── DIRECT QR (MP payment) ───────────────────────────────────── */}
        {state === "direct_qr" && directSelection && directUrl && (
          <motion.div
            key="direct_qr"
            className="absolute inset-0 flex flex-col items-center justify-center px-6 py-4 overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="w-full max-w-md text-center my-auto">
              <h2 className="font-racing text-3xl tracking-widest text-white mb-1">
                ESCANEÁ PARA PAGAR
              </h2>
              <p className="font-condensed text-base tracking-widest uppercase text-white/50 mb-4">
                {directSelection.actualMinutes} MIN ·{" "}
                {(directSelection.priceCents / 100).toLocaleString("es-AR", {
                  style: "currency",
                  currency: "ARS",
                  maximumFractionDigits: 0,
                })}
              </p>

              <div className="bg-white p-4 rounded-2xl inline-block mb-4 shadow-[0_0_40px_rgba(204,30,74,0.25)]">
                <QRCode value={directUrl} size={200} />
              </div>

              <p className="font-condensed text-sm text-white/60 mb-4 leading-snug">
                Escaneá con la cámara de tu celular y completá el pago en MercadoPago.
                La sesión arranca al confirmarse.
              </p>

              {/* Countdown */}
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="font-condensed text-sm tracking-widest uppercase text-white/50">
                  Tenés
                </span>
                <span
                  className={`font-racing text-3xl tracking-wider ${
                    directSecondsLeft <= 15 ? "text-[#CC1E4A]" : "text-white"
                  }`}
                >
                  0:{String(directSecondsLeft).padStart(2, "0")}
                </span>
                <span className="font-condensed text-sm tracking-widest uppercase text-white/50">
                  para pagar
                </span>
              </div>

              <button
                onClick={handleRequestCancelDirect}
                className="w-full py-3 rounded-xl border border-white/15 text-white/70 font-condensed text-base tracking-widest uppercase hover:bg-white/5 hover:text-white transition"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        )}

        {/* ── DIRECT CONFIRM CANCEL ─────────────────────────────────────── */}
        {state === "direct_confirm_cancel" && (
          <motion.div
            key="direct_confirm_cancel"
            className="absolute inset-0 flex flex-col items-center justify-center px-6 py-4 bg-black/70 overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="w-full max-w-lg text-center rounded-2xl border border-white/10 bg-[#1A2B58] p-10">
              <h3 className="font-racing text-3xl sm:text-4xl tracking-widest text-white mb-4">
                ¿CANCELAR EL PAGO?
              </h3>
              <p className="font-condensed text-lg text-white/60 mb-8">
                Si ya escaneaste el QR y estás a punto de pagar, mejor esperá a que se confirme.
              </p>
              <div className="flex flex-col gap-4">
                <button
                  onClick={handleConfirmCancelDirect}
                  className="py-5 rounded-xl bg-[#CC1E4A] hover:bg-[#e1224f] text-white font-racing text-xl tracking-widest uppercase transition"
                >
                  Sí, cancelar
                </button>
                <button
                  onClick={handleAbandonCancelDirect}
                  className="py-5 rounded-xl border border-white/15 text-white/70 font-condensed text-lg tracking-widest uppercase hover:bg-white/5 transition"
                >
                  No, volver al QR
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── DIRECT WAITING (confirming payment) ──────────────────────── */}
        {state === "direct_waiting" && (
          <motion.div
            key="direct_waiting"
            className="absolute inset-0 flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="w-14 h-14 border-4 border-[#CC1E4A] border-t-transparent rounded-full animate-spin mb-6" />
            <p className="font-condensed text-sm tracking-widest uppercase text-white/50">
              Confirmando pago…
            </p>
          </motion.div>
        )}

        {/* ── INPUT + CUSTOM KEYBOARD ─────────────────────────────── */}
        {state === "input" && (
          <motion.div
            key="input"
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 py-4 overflow-y-auto"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.35 }}
          >
            {/* Top: Back button + Header + Code Display */}
            <div className="w-full max-w-3xl text-center pt-2 relative">
              <button
                onClick={handleBackFromInput}
                className="absolute left-0 top-1 py-3 px-5 rounded-xl border border-white/15 text-white/70 font-condensed text-sm tracking-widest uppercase hover:bg-white/5 hover:text-white transition"
              >
                ← Volver
              </button>
              <h2 className="font-racing text-4xl sm:text-5xl tracking-widest text-white mb-2">
                INGRESÁ TU CÓDIGO
              </h2>
              <p className="font-condensed text-base tracking-widest uppercase text-white/50">
                El código te llegó al email al confirmar el pago
              </p>
            </div>

            {/* Code display boxes */}
            <div className="flex gap-4 justify-center">
              {[0, 1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  className={`w-20 h-24 sm:w-24 sm:h-28 rounded-2xl border-2 flex items-center justify-center transition-all duration-200 ${
                    codeInput.length === i
                      ? "border-[#CC1E4A] bg-[#CC1E4A]/10 shadow-[0_0_20px_rgba(204,30,74,0.3)]"
                      : codeInput[i]
                      ? "border-white/30 bg-white/10"
                      : "border-white/10 bg-white/5"
                  }`}
                  animate={codeInput.length === i ? { scale: [1, 1.03, 1] } : {}}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <span className="font-racing text-5xl sm:text-6xl text-white">
                    {codeInput[i] || ""}
                  </span>
                </motion.div>
              ))}
            </div>

            {/* QWERTY keyboard */}
            <div className="w-full max-w-3xl">
              {(() => {
                // Codes exclude 0, 1, I, O to avoid confusion (see lib/code-generator.ts).
                // Layout: digits 2-9, then QWERTY skipping I and O.
                const ROW_DIGITS = ["2", "3", "4", "5", "6", "7", "8", "9"];
                const ROW_QWERTY_TOP = ["Q", "W", "E", "R", "T", "Y", "U", "P"]; // no I, no O
                const ROW_QWERTY_MID = ["A", "S", "D", "F", "G", "H", "J", "K", "L"];
                const ROW_QWERTY_BOT = ["Z", "X", "C", "V", "B", "N", "M"];

                const keyClass =
                  "h-14 sm:h-16 rounded-xl border border-white/15 bg-white/5 flex items-center justify-center font-racing text-2xl sm:text-3xl text-white active:bg-[#CC1E4A]/30 active:border-[#CC1E4A]/50 transition-colors select-none";

                return (
                  <>
                    {/* Digits */}
                    <div className="grid grid-cols-8 gap-2 mb-2">
                      {ROW_DIGITS.map((key) => (
                        <motion.button
                          key={key}
                          whileTap={{ scale: 0.92 }}
                          onClick={() => handleKeyPress(key)}
                          className={keyClass}
                        >
                          {key}
                        </motion.button>
                      ))}
                    </div>

                    {/* QWERTY top */}
                    <div className="grid grid-cols-8 gap-2 mb-2">
                      {ROW_QWERTY_TOP.map((key) => (
                        <motion.button
                          key={key}
                          whileTap={{ scale: 0.92 }}
                          onClick={() => handleKeyPress(key)}
                          className={keyClass}
                        >
                          {key}
                        </motion.button>
                      ))}
                    </div>

                    {/* QWERTY mid — 9 keys */}
                    <div className="grid grid-cols-9 gap-2 mb-2 px-[4%]">
                      {ROW_QWERTY_MID.map((key) => (
                        <motion.button
                          key={key}
                          whileTap={{ scale: 0.92 }}
                          onClick={() => handleKeyPress(key)}
                          className={keyClass}
                        >
                          {key}
                        </motion.button>
                      ))}
                    </div>

                    {/* QWERTY bottom + ⌫ */}
                    <div className="grid grid-cols-9 gap-2 mb-4 px-[4%]">
                      <div />
                      {ROW_QWERTY_BOT.map((key) => (
                        <motion.button
                          key={key}
                          whileTap={{ scale: 0.92 }}
                          onClick={() => handleKeyPress(key)}
                          className={keyClass}
                        >
                          {key}
                        </motion.button>
                      ))}
                      <motion.button
                        whileTap={{ scale: 0.92 }}
                        onClick={handleDeleteKey}
                        disabled={codeInput.length === 0}
                        className={`h-14 sm:h-16 rounded-xl border flex items-center justify-center font-racing text-2xl sm:text-3xl transition-colors select-none ${
                          codeInput.length === 0
                            ? "border-white/5 bg-white/[0.02] text-white/15 cursor-not-allowed"
                            : "border-white/20 bg-white/10 text-white/70 active:bg-red-900/30 active:border-red-500/50"
                        }`}
                      >
                        ⌫
                      </motion.button>
                    </div>

                    {/* Start (confirm) — auto-submit also fires when 4 chars are entered, this is a manual fallback */}
                    <motion.button
                      whileTap={codeInput.length === 4 ? { scale: 0.97 } : undefined}
                      onClick={handleActivate}
                      disabled={codeInput.length !== 4}
                      className={`w-full h-16 sm:h-20 rounded-xl font-racing text-2xl sm:text-3xl tracking-[0.25em] uppercase transition-all ${
                        codeInput.length === 4
                          ? "bg-[#CC1E4A] text-white shadow-[0_0_40px_rgba(204,30,74,0.5)] hover:bg-[#e1224f]"
                          : "bg-white/5 text-white/20 cursor-not-allowed"
                      }`}
                    >
                      Iniciar sesión →
                    </motion.button>
                  </>
                );
              })()}
            </div>
          </motion.div>
        )}

        {/* ── VALIDATING ─────────────────────────────────────────────── */}
        {state === "validating" && (
          <motion.div
            key="validating"
            className="absolute inset-0 flex flex-col items-center justify-center gap-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="h-20 w-20 rounded-full border-4 border-white/10 border-t-[#CC1E4A]"
            />
            <p className="font-racing text-2xl tracking-widest text-white/60 uppercase">
              VALIDANDO...
            </p>
          </motion.div>
        )}

        {/* ── ERROR ──────────────────────────────────────────────────── */}
        {state === "error" && (
          <motion.div
            key="error"
            className="absolute inset-0 flex flex-col items-center justify-center px-8"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="w-full max-w-lg text-center">
              <motion.div
                animate={{ rotate: [0, -5, 5, -5, 0] }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border-2 border-red-500/40 bg-red-900/30"
              >
                <span className="text-4xl">❌</span>
              </motion.div>
              <h2 className="font-racing text-3xl tracking-widest text-white mb-4">
                CÓDIGO INVÁLIDO
              </h2>
              <div className="mb-8 rounded-xl border border-red-500/20 bg-red-900/20 px-6 py-4">
                <p className="font-condensed text-base text-red-300 leading-relaxed">
                  {errorMsg}
                </p>
              </div>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setCodeInput("");
                  setErrorMsg("");
                  setState("input");
                }}
                className="w-full rounded-2xl bg-[#CC1E4A] py-5 font-racing text-xl tracking-widest text-white uppercase shadow-[0_0_24px_rgba(204,30,74,0.35)]"
              >
                INTENTAR DE NUEVO
              </motion.button>
              <button
                onClick={() => setState("screensaver")}
                className="mt-4 w-full py-3 font-condensed text-sm tracking-widest uppercase text-white/25 hover:text-white/50 transition"
              >
                CANCELAR
              </button>
            </div>
          </motion.div>
        )}

        {/* ── ACTIVE / WARNING ──────────────────────────────────────── */}
        {(state === "active" || state === "warning") && session && (
          <motion.div
            key="active"
            className="absolute inset-0 flex flex-col items-center justify-between px-6 py-6 overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Warning overlay pulse */}
            <AnimatePresence>
              {isWarning && (
                <motion.div
                  key="warning-overlay"
                  className="pointer-events-none absolute inset-0 border-4 border-[#CC1E4A] rounded-none"
                  animate={{ opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              )}
            </AnimatePresence>

            {/* Top bar */}
            <div className="w-full flex items-center justify-between">
              <div>
                <p className="font-condensed text-xs tracking-[0.3em] uppercase text-white/40">
                  SIMULADOR
                </p>
                <p className="font-racing text-2xl tracking-widest text-white">
                  {session.puestoName}
                </p>
              </div>
              {session.customerName && (
                <div className="text-right">
                  <p className="font-condensed text-xs tracking-[0.3em] uppercase text-white/40">
                    PILOTO
                  </p>
                  <p className="font-racing text-2xl tracking-widest text-white">
                    {session.customerName.toUpperCase()}
                  </p>
                </div>
              )}
              {isWarning && (
                <div className="flex items-center gap-2 rounded-xl border border-[#CC1E4A]/50 bg-[#CC1E4A]/20 px-4 py-2">
                  <motion.span
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 0.7, repeat: Infinity }}
                    className="text-2xl"
                  >
                    ⚠️
                  </motion.span>
                  <span className="font-racing text-base tracking-widest text-[#CC1E4A]">
                    ¡ÚLTIMOS MINUTOS!
                  </span>
                </div>
              )}
            </div>

            {/* Countdown clock */}
            <div className="relative flex items-center justify-center">
              <div className="relative h-64 w-64 sm:h-72 sm:w-72 flex items-center justify-center">
                <ProgressRing pct={progressPct} warning={isWarning} />
                <div className="text-center z-10">
                  <motion.p
                    className={`font-racing leading-none ${
                      isWarning ? "text-[#CC1E4A]" : "text-white"
                    }`}
                    style={{ fontSize: remainingMs >= 3600000 ? "3rem" : "4rem" }}
                    animate={isWarning ? { scale: [1, 1.04, 1] } : {}}
                    transition={isWarning ? { duration: 1, repeat: Infinity } : {}}
                  >
                    {fmtCountdown(remainingMs)}
                  </motion.p>
                  <p className="font-condensed text-xs tracking-[0.3em] uppercase text-white/40 mt-2">
                    TIEMPO RESTANTE
                  </p>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="w-full grid grid-cols-2 gap-4 max-w-xl">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => setState("extend_options")}
                className="rounded-2xl border border-[#CC1E4A]/40 bg-[#CC1E4A]/10 py-5 font-racing text-xl sm:text-2xl tracking-widest text-[#CC1E4A] uppercase hover:bg-[#CC1E4A]/20 transition"
              >
                +TIEMPO
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleRequestFinish}
                className="rounded-2xl border border-white/10 bg-white/5 py-5 font-racing text-xl sm:text-2xl tracking-widest text-white/60 uppercase hover:bg-white/10 transition"
              >
                FINALIZAR
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* ── EXTEND OPTIONS ─────────────────────────────────────────── */}
        {state === "extend_options" && session && (
          <motion.div
            key="extend-options"
            className="absolute inset-0 flex flex-col items-center justify-center px-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <div className="w-full max-w-lg">
              <div className="mb-10 text-center">
                <h2 className="font-racing text-4xl tracking-widest text-white mb-2">
                  EXTENDER SESIÓN
                </h2>
                <p className="font-condensed text-sm tracking-widest uppercase text-white/40">
                  Elegí cuánto tiempo más querés en pista
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-8">
                {EXTEND_OPTIONS.map((min) => (
                  <motion.button
                    key={min}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleExtendSelect(min)}
                    className="flex flex-col items-center justify-center rounded-2xl border-2 border-white/10 bg-white/5 py-8 hover:border-[#CC1E4A]/60 hover:bg-[#CC1E4A]/10 transition-all group"
                  >
                    <span className="font-racing text-5xl text-white group-hover:text-[#CC1E4A] transition-colors">
                      +{min}
                    </span>
                    <span className="font-condensed text-xs tracking-widest uppercase text-white/30 mt-1 group-hover:text-white/60 transition-colors">
                      MIN
                    </span>
                  </motion.button>
                ))}
              </div>

              <button
                onClick={handleCancelExtend}
                className="w-full py-4 font-condensed text-sm tracking-widest uppercase text-white/30 hover:text-white/60 transition"
              >
                CANCELAR
              </button>
            </div>
          </motion.div>
        )}

        {/* ── EXTEND QR ──────────────────────────────────────────────── */}
        {state === "extend_qr" && (
          <motion.div
            key="extend-qr"
            className="absolute inset-0 flex flex-col items-center justify-center px-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="w-full max-w-md text-center">
              <h2 className="font-racing text-3xl tracking-widest text-white mb-2">
                ESCANEÁ PARA PAGAR
              </h2>
              <p className="font-condensed text-sm tracking-widest uppercase text-white/40 mb-8">
                +{extendMinutes} MIN — ${extendAmount.toLocaleString("es-AR")} ARS
              </p>

              {/* QR */}
              <div className="mx-auto mb-8 inline-block rounded-2xl bg-white p-5 shadow-[0_0_40px_rgba(204,30,74,0.2)]">
                <QRCode value={extendUrl} size={220} />
              </div>

              <p className="font-condensed text-sm text-white/40 tracking-wide mb-6 leading-relaxed">
                Escaneá el QR con la cámara de tu celular y completá el pago con MercadoPago.
                <br />
                La sesión se extenderá automáticamente al confirmar.
              </p>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleExtendWait}
                className="w-full rounded-2xl bg-[#CC1E4A] py-5 font-racing text-xl tracking-widest text-white uppercase shadow-[0_0_24px_rgba(204,30,74,0.35)] mb-4"
              >
                YA PAGUÉ → ESPERAR CONFIRMACIÓN
              </motion.button>

              <button
                onClick={handleRequestCancelExtend}
                className="w-full py-3 font-condensed text-sm tracking-widest uppercase text-white/25 hover:text-white/50 transition"
              >
                CANCELAR
              </button>
            </div>
          </motion.div>
        )}

        {/* ── EXTEND CONFIRM CANCEL ──────────────────────────────────── */}
        {state === "extend_confirm_cancel" && (
          <motion.div
            key="extend-confirm-cancel"
            className="absolute inset-0 flex flex-col items-center justify-center px-6 py-4 bg-black/70 overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="w-full max-w-lg text-center rounded-2xl border border-white/10 bg-[#1A2B58] p-10">
              <h3 className="font-racing text-3xl sm:text-4xl tracking-widest text-white mb-4">
                ¿CANCELAR EL PAGO?
              </h3>
              <p className="font-condensed text-lg text-white/60 mb-8">
                Si ya escaneaste el QR y estás por pagar, mejor esperá a que confirme.
              </p>
              <div className="flex flex-col gap-4">
                <button
                  onClick={handleCancelExtend}
                  className="py-5 rounded-xl bg-[#CC1E4A] hover:bg-[#e1224f] text-white font-racing text-xl tracking-widest uppercase transition"
                >
                  Sí, cancelar
                </button>
                <button
                  onClick={handleAbandonCancelExtend}
                  className="py-5 rounded-xl border border-white/15 text-white/70 font-condensed text-lg tracking-widest uppercase hover:bg-white/5 transition"
                >
                  No, volver al QR
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── CONFIRM MANUAL FINISH ──────────────────────────────────── */}
        {state === "confirm_finish" && session && (
          <motion.div
            key="confirm_finish"
            className="absolute inset-0 flex flex-col items-center justify-center px-6 py-4 bg-black/70 overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="w-full max-w-lg text-center rounded-2xl border border-white/10 bg-[#1A2B58] p-10">
              <h3 className="font-racing text-3xl sm:text-4xl tracking-widest text-white mb-4">
                ¿FINALIZAR LA SESIÓN?
              </h3>
              <p className="font-condensed text-lg text-white/70 mb-3">
                Quedan <span className="text-white font-bold">{fmtCountdown(remainingMs)}</span> de juego.
              </p>
              <p className="font-condensed text-base text-white/50 mb-8">
                Si finalizás ahora, el tiempo restante se pierde y no se reembolsa.
              </p>
              <div className="flex flex-col gap-4">
                <button
                  onClick={handleConfirmFinish}
                  className="py-5 rounded-xl bg-[#CC1E4A] hover:bg-[#e1224f] text-white font-racing text-xl tracking-widest uppercase transition"
                >
                  Sí, finalizar
                </button>
                <button
                  onClick={handleAbandonFinish}
                  className="py-5 rounded-xl border border-white/15 text-white/70 font-condensed text-lg tracking-widest uppercase hover:bg-white/5 transition"
                >
                  No, seguir jugando
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── EXTEND WAITING ─────────────────────────────────────────── */}
        {state === "extend_waiting" && (
          <motion.div
            key="extend-waiting"
            className="absolute inset-0 flex flex-col items-center justify-center gap-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
              className="h-20 w-20 rounded-full border-4 border-white/10 border-t-[#CC1E4A]"
            />
            <div className="text-center">
              <p className="font-racing text-2xl tracking-widest text-white mb-2">
                ESPERANDO PAGO...
              </p>
              <p className="font-condensed text-sm tracking-widest uppercase text-white/30">
                La sesión se extenderá automáticamente
              </p>
            </div>
            <button
              onClick={handleCancelExtend}
              className="mt-4 font-condensed text-xs tracking-widest uppercase text-white/20 hover:text-white/40 transition"
            >
              Cancelar
            </button>
          </motion.div>
        )}

        {/* ── FINISHED ───────────────────────────────────────────────── */}
        {state === "finished" && (
          <motion.div
            key="finished"
            className="absolute inset-0 flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
          >
            <RacingLines />
            <div className="relative z-10 text-center px-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1, rotate: [0, -5, 5, 0] }}
                transition={{ duration: 0.5, type: "spring" }}
                className="mb-6 text-7xl"
              >
                🏁
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="font-racing text-5xl sm:text-7xl tracking-widest text-white mb-4"
              >
                ¡SESIÓN FINALIZADA!
              </motion.h2>
              {session?.customerName && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="font-racing text-2xl tracking-widest text-[#CC1E4A] mb-4"
                >
                  GRACIAS, {session.customerName.toUpperCase()}
                </motion.p>
              )}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="font-condensed text-lg tracking-widest uppercase text-white/40"
              >
                ¡Gracias por correr con nosotros!
              </motion.p>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2 }}
                className="mt-8 font-condensed text-sm tracking-[0.3em] uppercase text-white/20"
              >
                Volviendo al inicio en unos segundos...
              </motion.p>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
