"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "react-qr-code";

// ─── Types ─────────────────────────────────────────────────────────────────

type State =
  | "screensaver"
  | "input"
  | "validating"
  | "error"
  | "active"
  | "warning"        // < 5 min remaining
  | "extend_options"
  | "extend_qr"
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

const EXTEND_OPTIONS = [30, 60, 120] as const;
const WARNING_MS = 5 * 60 * 1000;   // 5 minutes
const POLL_INTERVAL_MS = 4000;
const SCREENSAVER_RETURN_MS = 8000; // after session ends

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
          className="absolute h-px bg-gradient-to-r from-transparent via-[#E50014] to-transparent opacity-40"
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
        stroke={warning ? "#E50014" : "#E50014"}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        transform="rotate(-90 150 150)"
        initial={false}
        animate={{
          stroke: warning ? ["#E50014", "#ff6b6b", "#E50014"] : "#E50014",
          strokeDasharray: `${dash} ${circ}`,
        }}
        transition={warning ? { stroke: { duration: 0.8, repeat: Infinity } } : { duration: 0.5 }}
      />
    </svg>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function TabletPage() {
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const screensaverRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ── Auto-finish when time runs out ──────────────────────────────────────
  useEffect(() => {
    if ((state === "active" || state === "warning") && remainingMs === 0) {
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

  function handleScreensaverTap() {
    setCodeInput("");
    setErrorMsg("");
    setState("input");
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

  async function handleManualFinish() {
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
        isWarning ? "bg-[#1A0000]" : "bg-[#0D0008]"
      } transition-colors duration-1000`}
      style={{ WebkitUserSelect: "none" }}
    >
      <AnimatePresence mode="wait">

        {/* ── SCREENSAVER ─────────────────────────────────────────────── */}
        {state === "screensaver" && (
          <motion.div
            key="screensaver"
            className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.6 }}
            onClick={handleScreensaverTap}
          >
            <RacingLines />
            <div className="relative z-10 flex flex-col items-center gap-8">
              {/* Logo */}
              <motion.div
                animate={{ scale: [1, 1.03, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="text-center"
              >
                <div className="flex items-center justify-center gap-3 mb-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[#E50014] shadow-[0_0_40px_rgba(229,0,20,0.6)]">
                    <span className="font-racing text-3xl text-white">V</span>
                  </div>
                  <h1 className="font-racing text-5xl sm:text-7xl tracking-widest text-white">
                    SIMULADOR<span className="text-[#E50014]">VR</span>
                  </h1>
                </div>
                <div className="mx-auto h-0.5 w-32 bg-[#E50014] opacity-80" />
              </motion.div>

              {/* Puesto name */}
              <p className="font-condensed text-sm tracking-[0.4em] uppercase text-white/40">
                {puestoId.replace(/-/g, " ").toUpperCase()}
              </p>

              {/* Touch to start */}
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="mt-8 flex flex-col items-center gap-3"
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#E50014]/40 bg-[#E50014]/10">
                  <span className="text-3xl">👆</span>
                </div>
                <p className="font-racing text-2xl tracking-[0.3em] text-white/60 uppercase">
                  TOCÁ PARA COMENZAR
                </p>
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* ── INPUT + CUSTOM KEYBOARD ─────────────────────────────── */}
        {state === "input" && (
          <motion.div
            key="input"
            className="absolute inset-0 flex flex-col items-center justify-between px-6 py-6"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.35 }}
          >
            {/* Top: Header + Code Display */}
            <div className="w-full max-w-2xl text-center pt-2">
              <h2 className="font-racing text-3xl sm:text-4xl tracking-widest text-white mb-1">
                INGRESÁ TU CÓDIGO
              </h2>
              <p className="font-condensed text-xs tracking-widest uppercase text-white/40">
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
                      ? "border-[#E50014] bg-[#E50014]/10 shadow-[0_0_20px_rgba(229,0,20,0.3)]"
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

            {/* Custom Keyboard */}
            <div className="w-full max-w-2xl">
              {/* Row 1: Numbers */}
              <div className="flex gap-2 justify-center mb-2">
                {["2", "3", "4", "5", "6", "7", "8", "9"].map((key) => (
                  <motion.button
                    key={key}
                    whileTap={{ scale: 0.9, backgroundColor: "rgba(229,0,20,0.3)" }}
                    onClick={() => codeInput.length < 4 && setCodeInput((p) => p + key)}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl border border-white/15 bg-white/5 flex items-center justify-center font-racing text-2xl text-white active:bg-[#E50014]/20 transition-colors"
                  >
                    {key}
                  </motion.button>
                ))}
              </div>

              {/* Row 2: A-J */}
              <div className="flex gap-2 justify-center mb-2">
                {["A", "B", "C", "D", "E", "F", "G", "H", "J", "K"].map((key) => (
                  <motion.button
                    key={key}
                    whileTap={{ scale: 0.9, backgroundColor: "rgba(229,0,20,0.3)" }}
                    onClick={() => codeInput.length < 4 && setCodeInput((p) => p + key)}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl border border-white/15 bg-white/5 flex items-center justify-center font-racing text-2xl text-white active:bg-[#E50014]/20 transition-colors"
                  >
                    {key}
                  </motion.button>
                ))}
              </div>

              {/* Row 3: L-X */}
              <div className="flex gap-2 justify-center mb-2">
                {["L", "M", "N", "P", "Q", "R", "S", "T", "U", "V"].map((key) => (
                  <motion.button
                    key={key}
                    whileTap={{ scale: 0.9, backgroundColor: "rgba(229,0,20,0.3)" }}
                    onClick={() => codeInput.length < 4 && setCodeInput((p) => p + key)}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl border border-white/15 bg-white/5 flex items-center justify-center font-racing text-2xl text-white active:bg-[#E50014]/20 transition-colors"
                  >
                    {key}
                  </motion.button>
                ))}
              </div>

              {/* Row 4: W-Z + Delete + Confirm */}
              <div className="flex gap-2 justify-center mt-1">
                {["W", "X", "Y", "Z"].map((key) => (
                  <motion.button
                    key={key}
                    whileTap={{ scale: 0.9, backgroundColor: "rgba(229,0,20,0.3)" }}
                    onClick={() => codeInput.length < 4 && setCodeInput((p) => p + key)}
                    className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl border border-white/15 bg-white/5 flex items-center justify-center font-racing text-2xl text-white active:bg-[#E50014]/20 transition-colors"
                  >
                    {key}
                  </motion.button>
                ))}

                {/* Delete */}
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setCodeInput((p) => p.slice(0, -1))}
                  className="w-20 h-14 sm:w-24 sm:h-16 rounded-xl border border-white/20 bg-white/10 flex items-center justify-center font-condensed text-base tracking-wider text-white/60 active:bg-red-900/30 transition-colors"
                >
                  ← BORRAR
                </motion.button>

                {/* Confirm */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleActivate}
                  disabled={codeInput.length !== 4}
                  className={`flex-1 h-14 sm:h-16 rounded-xl font-racing text-xl tracking-widest transition-all ${
                    codeInput.length === 4
                      ? "bg-[#E50014] text-white shadow-[0_0_24px_rgba(229,0,20,0.4)]"
                      : "bg-white/5 text-white/15 cursor-not-allowed"
                  }`}
                >
                  INICIAR →
                </motion.button>
              </div>

              {/* Back button */}
              <button
                onClick={() => { setCodeInput(""); setState("screensaver"); }}
                className="mt-3 w-full py-2 font-condensed text-xs tracking-widest uppercase text-white/20 hover:text-white/40 transition"
              >
                ← VOLVER
              </button>
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
              className="h-20 w-20 rounded-full border-4 border-white/10 border-t-[#E50014]"
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
                className="w-full rounded-2xl bg-[#E50014] py-5 font-racing text-xl tracking-widest text-white uppercase shadow-[0_0_24px_rgba(229,0,20,0.35)]"
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
            className="absolute inset-0 flex flex-col items-center justify-between px-8 py-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Warning overlay pulse */}
            <AnimatePresence>
              {isWarning && (
                <motion.div
                  key="warning-overlay"
                  className="pointer-events-none absolute inset-0 border-4 border-[#E50014] rounded-none"
                  animate={{ opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              )}
            </AnimatePresence>

            {/* Top bar */}
            <div className="w-full flex items-center justify-between">
              <div>
                <p className="font-condensed text-xs tracking-[0.3em] uppercase text-white/30">
                  SIMULADOR
                </p>
                <p className="font-racing text-xl tracking-widest text-white">
                  {session.puestoName}
                </p>
              </div>
              {session.customerName && (
                <div className="text-right">
                  <p className="font-condensed text-xs tracking-[0.3em] uppercase text-white/30">
                    PILOTO
                  </p>
                  <p className="font-racing text-xl tracking-widest text-white">
                    {session.customerName.toUpperCase()}
                  </p>
                </div>
              )}
              {isWarning && (
                <div className="flex items-center gap-2 rounded-xl border border-[#E50014]/50 bg-[#E50014]/20 px-4 py-2">
                  <motion.span
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 0.7, repeat: Infinity }}
                    className="text-xl"
                  >
                    ⚠️
                  </motion.span>
                  <span className="font-racing text-sm tracking-widest text-[#E50014]">
                    ¡ÚLTIMOS MINUTOS!
                  </span>
                </div>
              )}
            </div>

            {/* Countdown clock */}
            <div className="relative flex items-center justify-center">
              <div className="relative h-72 w-72 flex items-center justify-center">
                <ProgressRing pct={progressPct} warning={isWarning} />
                <div className="text-center z-10">
                  <motion.p
                    className={`font-racing leading-none ${
                      isWarning ? "text-[#E50014]" : "text-white"
                    }`}
                    style={{ fontSize: remainingMs >= 3600000 ? "3rem" : "4.5rem" }}
                    animate={isWarning ? { scale: [1, 1.04, 1] } : {}}
                    transition={isWarning ? { duration: 1, repeat: Infinity } : {}}
                  >
                    {fmtCountdown(remainingMs)}
                  </motion.p>
                  <p className="font-condensed text-xs tracking-[0.3em] uppercase text-white/30 mt-2">
                    TIEMPO RESTANTE
                  </p>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="w-full grid grid-cols-2 gap-4 max-w-lg">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => setState("extend_options")}
                className="rounded-2xl border border-[#E50014]/40 bg-[#E50014]/10 py-5 font-racing text-lg tracking-widest text-[#E50014] uppercase hover:bg-[#E50014]/20 transition"
              >
                +TIEMPO
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleManualFinish}
                className="rounded-2xl border border-white/10 bg-white/5 py-5 font-racing text-lg tracking-widest text-white/50 uppercase hover:bg-white/10 transition"
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
                    className="flex flex-col items-center justify-center rounded-2xl border-2 border-white/10 bg-white/5 py-8 hover:border-[#E50014]/60 hover:bg-[#E50014]/10 transition-all group"
                  >
                    <span className="font-racing text-5xl text-white group-hover:text-[#E50014] transition-colors">
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
              <div className="mx-auto mb-8 inline-block rounded-2xl bg-white p-5 shadow-[0_0_40px_rgba(229,0,20,0.2)]">
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
                className="w-full rounded-2xl bg-[#E50014] py-5 font-racing text-xl tracking-widest text-white uppercase shadow-[0_0_24px_rgba(229,0,20,0.35)] mb-4"
              >
                YA PAGUÉ → ESPERAR CONFIRMACIÓN
              </motion.button>

              <button
                onClick={handleCancelExtend}
                className="w-full py-3 font-condensed text-sm tracking-widest uppercase text-white/25 hover:text-white/50 transition"
              >
                CANCELAR
              </button>
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
              className="h-20 w-20 rounded-full border-4 border-white/10 border-t-[#E50014]"
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
                  className="font-racing text-2xl tracking-widest text-[#E50014] mb-4"
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
